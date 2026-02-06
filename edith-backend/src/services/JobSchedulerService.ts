/**
 * JobSchedulerService
 * Central job management with timezone-aware scheduling
 */

import { Queue } from 'bullmq';
import { prisma } from '../database/client.js';
import { logger } from '../utils/logger.js';
import {
  emailQueue,
  calendarQueue,
  reportQueue,
  maintenanceQueue,
  notificationQueue,
} from '../jobs/queue.js';
import type { JobType } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface ScheduleOptions {
  timezone?: string;
  immediate?: boolean;
  cronExpression?: string;
  scheduledFor?: Date;
  payload?: Record<string, unknown>;
}

export interface UserJobPreferences {
  morningBriefingTime: string; // HH:mm
  weeklyReportDay: number;     // 0=Sun, 5=Fri
  weeklyReportTime: string;    // HH:mm
  calendarOptimizerTime: string; // HH:mm
  skipWeekends: boolean;
}

// ============================================================================
// JobSchedulerService
// ============================================================================

class JobSchedulerServiceImpl {
  private queues: Map<string, Queue> = new Map();

  constructor() {
    this.queues.set('email', emailQueue);
    this.queues.set('calendar', calendarQueue);
    this.queues.set('report', reportQueue);
    this.queues.set('maintenance', maintenanceQueue);
    this.queues.set('notification', notificationQueue);
  }

  /**
   * Schedule a job for a specific user respecting their timezone
   */
  async scheduleForUser(
    userId: string,
    jobType: JobType,
    options: ScheduleOptions = {}
  ): Promise<{ scheduledJobId: string; bullJobId: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    });

    if (!user) throw new Error('User not found');

    const timezone = options.timezone || user.timezone;
    const cronExpression = options.cronExpression
      ? this.adjustCronForTimezone(options.cronExpression, timezone)
      : undefined;

    // Create scheduled job record
    const scheduledJob = await prisma.scheduledJob.create({
      data: {
        userId,
        jobType,
        cronExpression: options.cronExpression, // Store original cron
        scheduledFor: options.scheduledFor,
        isRecurring: !!cronExpression,
        payload: {
          timezone,
          ...options.payload,
        },
      },
    });

    // Add to BullMQ queue
    const queue = this.getQueueForJobType(jobType);
    const jobData = {
      userId,
      scheduledJobId: scheduledJob.id,
      triggeredAt: new Date().toISOString(),
      ...options.payload,
    };

    const jobOptions: Record<string, unknown> = {
      jobId: `${jobType}-${userId}-${scheduledJob.id}`,
    };

    if (cronExpression) {
      jobOptions.repeat = { pattern: cronExpression };
    } else if (options.scheduledFor) {
      const delay = options.scheduledFor.getTime() - Date.now();
      if (delay > 0) {
        jobOptions.delay = delay;
      }
    }

    const bullJob = await queue.add(jobType, jobData, jobOptions);

    // Update with Bull job ID
    await prisma.scheduledJob.update({
      where: { id: scheduledJob.id },
      data: { bullJobId: bullJob.id },
    });

    logger.info('Job scheduled for user', {
      userId,
      jobType,
      scheduledJobId: scheduledJob.id,
      bullJobId: bullJob.id,
    });

    return {
      scheduledJobId: scheduledJob.id,
      bullJobId: bullJob.id || scheduledJob.id,
    };
  }

  /**
   * Schedule a one-time job to run at a specific time
   */
  async scheduleOneTime(
    userId: string,
    jobType: JobType,
    runAt: Date,
    payload?: Record<string, unknown>
  ): Promise<{ scheduledJobId: string; bullJobId: string }> {
    return this.scheduleForUser(userId, jobType, {
      scheduledFor: runAt,
      payload,
    });
  }

  /**
   * Cancel a scheduled job
   */
  async cancelJob(scheduledJobId: string): Promise<boolean> {
    const scheduledJob = await prisma.scheduledJob.findUnique({
      where: { id: scheduledJobId },
    });

    if (!scheduledJob) {
      return false;
    }

    // Remove from BullMQ
    if (scheduledJob.bullJobId) {
      const queue = this.getQueueForJobType(scheduledJob.jobType);
      try {
        const job = await queue.getJob(scheduledJob.bullJobId);
        if (job) {
          await job.remove();
        }

        // Also try to remove repeatable job
        if (scheduledJob.isRecurring) {
          const repeatableKey = `${scheduledJob.jobType}-${scheduledJob.userId}-${scheduledJob.id}`;
          await queue.removeRepeatableByKey(repeatableKey);
        }
      } catch (error) {
        logger.warn('Failed to remove job from queue', {
          scheduledJobId,
          bullJobId: scheduledJob.bullJobId,
          error: (error as Error).message,
        });
      }
    }

    // Update status
    await prisma.scheduledJob.update({
      where: { id: scheduledJobId },
      data: { status: 'CANCELLED' },
    });

    logger.info('Job cancelled', { scheduledJobId });
    return true;
  }

  /**
   * Reschedule a job to a new time
   */
  async rescheduleJob(scheduledJobId: string, newTime: Date): Promise<boolean> {
    const scheduledJob = await prisma.scheduledJob.findUnique({
      where: { id: scheduledJobId },
    });

    if (!scheduledJob || !scheduledJob.userId) {
      return false;
    }

    // Cancel existing job
    await this.cancelJob(scheduledJobId);

    // Create new job with same parameters
    await this.scheduleOneTime(
      scheduledJob.userId,
      scheduledJob.jobType,
      newTime,
      scheduledJob.payload as Record<string, unknown>
    );

    return true;
  }

  /**
   * Get all scheduled jobs for a user
   */
  async getScheduledJobs(
    userId: string,
    options: { status?: string; jobType?: JobType } = {}
  ): Promise<Array<{
    id: string;
    jobType: JobType;
    status: string;
    scheduledFor: Date | null;
    nextRunAt: Date | null;
    isRecurring: boolean;
  }>> {
    const where: Record<string, unknown> = { userId };
    if (options.status) where.status = options.status;
    if (options.jobType) where.jobType = options.jobType;

    return prisma.scheduledJob.findMany({
      where,
      select: {
        id: true,
        jobType: true,
        status: true,
        scheduledFor: true,
        nextRunAt: true,
        isRecurring: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Initialize system-wide recurring jobs
   */
  async initializeSystemJobs(): Promise<void> {
    // Security audit - daily at 3 AM UTC
    await maintenanceQueue.add(
      'SECURITY_AUDIT',
      { triggeredAt: new Date().toISOString() },
      {
        repeat: { pattern: '0 3 * * *' },
        jobId: 'system-security-audit',
      }
    );

    // Metric aggregation - daily at midnight UTC
    await maintenanceQueue.add(
      'METRIC_AGGREGATION',
      { triggeredAt: new Date().toISOString() },
      {
        repeat: { pattern: '0 0 * * *' },
        jobId: 'system-metric-aggregation',
      }
    );

    // Inbox processor - every 5 minutes
    await emailQueue.add(
      'INBOX_PROCESSOR',
      { triggeredAt: new Date().toISOString() },
      {
        repeat: { every: 5 * 60 * 1000 },
        jobId: 'system-inbox-processor',
      }
    );

    // Email digest - hourly at :00
    await notificationQueue.add(
      'EMAIL_DIGEST',
      { triggeredAt: new Date().toISOString() },
      {
        repeat: { pattern: '0 * * * *' },
        jobId: 'system-email-digest',
      }
    );

    // Follow-up reminder - hourly at :30
    await notificationQueue.add(
      'FOLLOW_UP_REMINDER',
      { triggeredAt: new Date().toISOString() },
      {
        repeat: { pattern: '30 * * * *' },
        jobId: 'system-follow-up-reminder',
      }
    );

    logger.info('System jobs initialized');
  }

  /**
   * Set up user-specific recurring jobs when a user is created or updated
   */
  async setupUserJobs(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    });

    if (!user) return;

    const prefs = user.preferences;
    const timezone = user.timezone;

    // Morning briefing - weekdays at user's preferred time (default 7 AM)
    const briefingHour = prefs?.workingHoursStart
      ? parseInt(prefs.workingHoursStart.split(':')[0]) - 1
      : 7;

    await this.scheduleForUser(userId, 'MORNING_BRIEFING', {
      cronExpression: `0 ${briefingHour} * * 1-5`, // Weekdays
      timezone,
    });

    // Calendar optimizer - daily at 6 PM user's time
    await this.scheduleForUser(userId, 'CALENDAR_OPTIMIZER', {
      cronExpression: '0 18 * * *',
      timezone,
    });

    // Weekly report - Friday at 6 PM user's time
    await this.scheduleForUser(userId, 'WEEKLY_REPORT', {
      cronExpression: '0 18 * * 5',
      timezone,
    });

    // Relationship nurture - Sunday at 7 PM user's time
    await this.scheduleForUser(userId, 'RELATIONSHIP_NURTURE', {
      cronExpression: '0 19 * * 0',
      timezone,
    });

    logger.info('User jobs scheduled', { userId });
  }

  /**
   * Remove all jobs for a user (when account is deleted)
   */
  async removeAllUserJobs(userId: string): Promise<void> {
    const jobs = await prisma.scheduledJob.findMany({
      where: { userId, status: { in: ['SCHEDULED', 'RUNNING'] } },
    });

    for (const job of jobs) {
      await this.cancelJob(job.id);
    }

    logger.info('All user jobs removed', { userId, count: jobs.length });
  }

  /**
   * Convert cron expression from user timezone to UTC
   */
  private adjustCronForTimezone(cron: string, timezone: string): string {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = cron.split(' ');

    // Get current offset for timezone
    const now = new Date();
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const offsetHours = Math.round((utcDate.getTime() - tzDate.getTime()) / (1000 * 60 * 60));

    // Adjust hour if it's a number (not * or */n)
    let adjustedHour = hour;
    if (/^\d+$/.test(hour)) {
      let newHour = parseInt(hour) + offsetHours;
      if (newHour < 0) newHour += 24;
      if (newHour >= 24) newHour -= 24;
      adjustedHour = newHour.toString();
    }

    return `${minute} ${adjustedHour} ${dayOfMonth} ${month} ${dayOfWeek}`;
  }

  /**
   * Get the appropriate queue for a job type
   */
  private getQueueForJobType(jobType: JobType): Queue {
    switch (jobType) {
      case 'INBOX_PROCESSOR':
      case 'EMAIL_DIGEST':
        return emailQueue;
      case 'CALENDAR_OPTIMIZER':
      case 'MEETING_PREP':
        return calendarQueue;
      case 'MORNING_BRIEFING':
      case 'WEEKLY_REPORT':
        return reportQueue;
      case 'FOLLOW_UP_REMINDER':
      case 'RELATIONSHIP_NURTURE':
        return notificationQueue;
      case 'SECURITY_AUDIT':
      case 'METRIC_AGGREGATION':
      default:
        return maintenanceQueue;
    }
  }

  /**
   * Schedule meeting prep for an event
   */
  async scheduleMeetingPrep(
    userId: string,
    eventId: string,
    meetingTime: Date,
    hoursBeforeMeeting: number = 2
  ): Promise<{ scheduledJobId: string; bullJobId: string }> {
    const prepTime = new Date(meetingTime.getTime() - hoursBeforeMeeting * 60 * 60 * 1000);

    // Don't schedule if prep time is in the past
    if (prepTime < new Date()) {
      throw new Error('Meeting prep time is in the past');
    }

    return this.scheduleForUser(userId, 'MEETING_PREP', {
      scheduledFor: prepTime,
      payload: {
        eventId,
        hoursBeforeMeeting,
      },
    });
  }
}

export const jobSchedulerService = new JobSchedulerServiceImpl();
export default jobSchedulerService;
