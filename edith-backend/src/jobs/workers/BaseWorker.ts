/**
 * BaseWorker
 * Abstract base class for all job workers providing common functionality:
 * - Pre-execution hooks (load user, check quiet hours)
 * - Post-execution hooks (audit logging, metrics update)
 * - Timezone conversion helpers
 * - Error handling and categorization
 */

import { Job, Worker, Queue } from 'bullmq';
import { prisma } from '../../database/client.js';
import { auditService } from '../../services/AuditService.js';
import { logger } from '../../utils/logger.js';
import type {
  BaseJobData,
  JobExecutionContext,
  UserWithPreferences,
  JobResult,
} from '../types.js';
import { JobError, JobErrorCode } from '../types.js';
import type { JobType, JobStatus } from '@prisma/client';

// ============================================================================
// Default Job Options
// ============================================================================

export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 60000, // 1 minute initial, then 2 min, 4 min
  },
  removeOnComplete: {
    age: 7 * 24 * 3600, // Keep completed jobs for 7 days
    count: 1000,
  },
  removeOnFail: {
    age: 30 * 24 * 3600, // Keep failed jobs for 30 days
  },
};

// ============================================================================
// BaseWorker Abstract Class
// ============================================================================

export abstract class BaseWorker<T extends BaseJobData> {
  protected abstract queueName: string;
  protected abstract jobType: JobType;
  protected worker: Worker<T> | null = null;

  /**
   * Main execution method - subclasses must implement this
   */
  protected abstract execute(job: Job<T>, context: JobExecutionContext): Promise<JobResult>;

  /**
   * Update metrics after successful job execution - subclasses can override
   */
  protected abstract updateMetrics(context: JobExecutionContext, result: JobResult): Promise<void>;

  /**
   * Initialize the worker with the queue connection
   */
  initialize(queue: Queue<T>): Worker<T> {
    this.worker = new Worker<T>(
      this.queueName,
      async (job: Job<T>) => this.processJob(job),
      {
        connection: {
          host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
          port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379'),
        },
        concurrency: 5,
      }
    );

    this.worker.on('completed', (job) => {
      logger.debug(`Job ${job.id} completed in queue ${this.queueName}`, {
        jobType: this.jobType,
        userId: job.data.userId,
      });
    });

    this.worker.on('failed', (job, error) => {
      logger.error(`Job ${job?.id} failed in queue ${this.queueName}`, {
        jobType: this.jobType,
        error: error.message,
        userId: job?.data.userId,
      });
    });

    return this.worker;
  }

  /**
   * Main job processing method with hooks
   */
  private async processJob(job: Job<T>): Promise<JobResult> {
    let context: JobExecutionContext | null = null;
    let result: JobResult = { success: false };

    try {
      // Pre-execution
      context = await this.beforeExecute(job);

      // Update job status to RUNNING
      if (job.data.scheduledJobId) {
        await this.updateScheduledJobStatus(job.data.scheduledJobId, 'RUNNING');
      }

      // Execute the job
      result = await this.execute(job, context);

      // Post-execution
      await this.afterExecute(job, context, true, result);

      return result;
    } catch (error) {
      const jobError = this.categorizeError(error as Error);

      // Handle special error cases
      if (jobError.code === 'QUIET_HOURS' && jobError.retryAfterMs) {
        // Reschedule for after quiet hours
        logger.info('Job delayed due to quiet hours', {
          jobId: job.id,
          jobType: this.jobType,
          retryAfterMs: jobError.retryAfterMs,
        });
        throw jobError; // BullMQ will retry
      }

      if (context) {
        await this.afterExecute(job, context, false, result, jobError);
      }

      throw jobError;
    }
  }

  /**
   * Pre-execution hook - load user, check quiet hours, create context
   */
  protected async beforeExecute(job: Job<T>): Promise<JobExecutionContext> {
    const { userId, scheduledJobId } = job.data;

    // For system-wide jobs without a specific user
    if (!userId) {
      return {
        jobId: job.id || 'unknown',
        userId: 'system',
        userTimezone: 'UTC',
        userPreferences: {} as any,
        startTime: new Date(),
      };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    });

    if (!user) {
      throw new JobError(JobErrorCode.USER_NOT_FOUND, `User not found: ${userId}`, false);
    }

    if (!user.isActive) {
      throw new JobError(JobErrorCode.USER_NOT_FOUND, `User is inactive: ${userId}`, false);
    }

    // Check quiet hours (skip for system jobs or urgent notifications)
    if (await this.isInQuietHours(user)) {
      const retryAfterMs = this.getMillisecondsUntilQuietHoursEnd(user);
      throw new JobError(JobErrorCode.QUIET_HOURS, 'User is in quiet hours', true, retryAfterMs);
    }

    return {
      jobId: job.id || 'unknown',
      userId: user.id,
      userTimezone: user.timezone,
      userPreferences: user.preferences ?? null,
      startTime: new Date(),
    };
  }

  /**
   * Post-execution hook - audit logging, metrics update, status update
   */
  protected async afterExecute(
    job: Job<T>,
    context: JobExecutionContext,
    success: boolean,
    result: JobResult,
    error?: JobError
  ): Promise<void> {
    const duration = Date.now() - context.startTime.getTime();

    // Log to audit trail
    await auditService.log(
      {
        action: `JOB_${this.jobType}_${success ? 'SUCCESS' : 'FAILURE'}`,
        resource: 'ScheduledJob',
        resourceId: job.id,
        metadata: {
          jobType: this.jobType,
          duration,
          userId: context.userId,
          result: success ? result : undefined,
          error: error?.message,
          errorCode: error?.code,
        },
      },
      { userId: context.userId !== 'system' ? context.userId : undefined }
    );

    // Log to activity log (ActionLog) so it shows in the Activity Log UI
    if (context.userId !== 'system') {
      try {
        await auditService.logAgentAction(
          context.userId,
          `${this.jobType}Worker`,
          `JOB_${this.jobType}`,
          { jobId: job.id, ...(job.data as Record<string, unknown>) },
          success ? (result as unknown as Record<string, unknown>) : { error: error?.message },
          success ? 'SUCCESS' : 'FAILURE',
          undefined,
          duration,
        );
      } catch (logError) {
        logger.error('Failed to log worker action to ActionLog', {
          jobId: job.id,
          error: (logError as Error).message,
        });
      }
    }

    // Update scheduled job status
    if (job.data.scheduledJobId) {
      await this.updateScheduledJobStatus(
        job.data.scheduledJobId,
        success ? 'COMPLETED' : 'FAILED',
        success ? result : undefined,
        error?.message
      );
    }

    // Update metrics if successful
    if (success) {
      try {
        await this.updateMetrics(context, result);
      } catch (metricsError) {
        logger.error('Failed to update metrics', {
          jobId: job.id,
          error: (metricsError as Error).message,
        });
      }
    }
  }

  /**
   * Check if user is in quiet hours
   */
  protected async isInQuietHours(user: UserWithPreferences): Promise<boolean> {
    const prefs = user.preferences;
    if (!prefs?.quietHoursStart || !prefs?.quietHoursEnd) return false;

    const now = this.getUserLocalTime(user.timezone);
    const startParts = prefs.quietHoursStart.split(':').map(Number);
    const endParts = prefs.quietHoursEnd.split(':').map(Number);

    if (startParts.length < 2 || endParts.length < 2 ||
        isNaN(startParts[0]) || isNaN(startParts[1]) ||
        isNaN(endParts[0]) || isNaN(endParts[1])) {
      return false; // Invalid time format, skip quiet hours check
    }

    const [startH, startM] = startParts;
    const [endH, endM] = endParts;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // Quiet hours don't span midnight
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Quiet hours span midnight (e.g., 22:00 - 07:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }

  /**
   * Calculate milliseconds until quiet hours end
   */
  protected getMillisecondsUntilQuietHoursEnd(user: UserWithPreferences): number {
    const prefs = user.preferences;
    if (!prefs?.quietHoursEnd) return 0;

    const now = this.getUserLocalTime(user.timezone);
    const [endH, endM] = prefs.quietHoursEnd.split(':').map(Number);

    const endTime = new Date(now);
    endTime.setHours(endH, endM, 0, 0);

    // If end time is before now, it means quiet hours end tomorrow
    if (endTime <= now) {
      endTime.setDate(endTime.getDate() + 1);
    }

    return endTime.getTime() - now.getTime();
  }

  /**
   * Get current time in user's timezone
   */
  protected getUserLocalTime(timezone: string): Date {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    };

    const formatter = new Intl.DateTimeFormat('en-CA', options);
    const parts = formatter.formatToParts(now);

    const dateParts: Record<string, string> = {};
    for (const part of parts) {
      dateParts[part.type] = part.value;
    }

    return new Date(
      parseInt(dateParts.year),
      parseInt(dateParts.month) - 1,
      parseInt(dateParts.day),
      parseInt(dateParts.hour),
      parseInt(dateParts.minute),
      parseInt(dateParts.second)
    );
  }

  /**
   * Get start of day in user's timezone
   */
  protected getStartOfDayInTimezone(timezone: string, offsetDays: number = 0): Date {
    const localNow = this.getUserLocalTime(timezone);
    localNow.setDate(localNow.getDate() + offsetDays);
    localNow.setHours(0, 0, 0, 0);
    return localNow;
  }

  /**
   * Get end of day in user's timezone
   */
  protected getEndOfDayInTimezone(timezone: string, offsetDays: number = 0): Date {
    const localNow = this.getUserLocalTime(timezone);
    localNow.setDate(localNow.getDate() + offsetDays);
    localNow.setHours(23, 59, 59, 999);
    return localNow;
  }

  /**
   * Categorize error for appropriate handling
   */
  protected categorizeError(error: Error): JobError {
    if (error instanceof JobError) {
      return error;
    }

    const message = error.message.toLowerCase();

    if (message.includes('rate limit') || message.includes('too many requests')) {
      return new JobError(JobErrorCode.RATE_LIMITED, error.message, true, 60000);
    }

    if (message.includes('unauthorized') || message.includes('token expired')) {
      return new JobError(JobErrorCode.AUTH_EXPIRED, error.message, true);
    }

    if (message.includes('network') || message.includes('econnrefused') || message.includes('timeout')) {
      return new JobError(JobErrorCode.NETWORK_ERROR, error.message, true, 30000);
    }

    if (message.includes('user not found') || message.includes('not found')) {
      return new JobError(JobErrorCode.USER_NOT_FOUND, error.message, false);
    }

    return new JobError(JobErrorCode.UNKNOWN, error.message, false);
  }

  /**
   * Update scheduled job status in database
   */
  protected async updateScheduledJobStatus(
    scheduledJobId: string,
    status: JobStatus,
    result?: JobResult,
    errorMessage?: string
  ): Promise<void> {
    try {
      const updateData: Record<string, unknown> = {
        status,
        updatedAt: new Date(),
      };

      if (status === 'RUNNING') {
        updateData.startedAt = new Date();
      } else if (status === 'COMPLETED') {
        updateData.completedAt = new Date();
        updateData.lastRunAt = new Date();
        if (result) {
          updateData.result = result;
        }
      } else if (status === 'FAILED') {
        updateData.failedAt = new Date();
        updateData.errorMessage = errorMessage;
        updateData.retryCount = { increment: 1 };
      }

      await prisma.scheduledJob.update({
        where: { id: scheduledJobId },
        data: updateData as any,
      });
    } catch (error) {
      logger.error('Failed to update scheduled job status', {
        scheduledJobId,
        status,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
