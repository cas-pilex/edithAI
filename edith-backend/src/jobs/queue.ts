import { Queue, Worker, Job } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Redis connection for BullMQ
const connection = {
  host: new URL(config.redis.url).hostname,
  port: parseInt(new URL(config.redis.url).port || '6379'),
};

// ==================== QUEUE DEFINITIONS ====================

export const emailQueue = new Queue('email', { connection });
export const calendarQueue = new Queue('calendar', { connection });
export const syncQueue = new Queue('sync', { connection });
export const notificationQueue = new Queue('notification', { connection });
export const reportQueue = new Queue('report', { connection });
export const maintenanceQueue = new Queue('maintenance', { connection });

// ==================== JOB TYPES ====================

export interface EmailJobData {
  type: 'process' | 'send' | 'sync';
  userId: string;
  emailId?: string;
  data?: Record<string, unknown>;
}

export interface CalendarJobData {
  type: 'sync' | 'optimize' | 'reminder';
  userId: string;
  eventId?: string;
  data?: Record<string, unknown>;
}

export interface SyncJobData {
  type: 'full' | 'incremental';
  userId: string;
  provider: string;
}

export interface NotificationJobData {
  userId: string;
  type: string;
  title: string;
  body?: string;
  channel: string;
  data?: Record<string, unknown>;
}

export interface ReportJobData {
  type: 'daily' | 'weekly' | 'monthly';
  userId: string;
  date: string;
}

export interface MaintenanceJobData {
  type: 'cleanup' | 'audit' | 'backup';
  params?: Record<string, unknown>;
}

// ==================== WORKER FACTORY ====================

export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>
): Worker<T> {
  const worker = new Worker<T>(queueName, processor, {
    connection,
    concurrency: 5,
  });

  worker.on('completed', (job) => {
    logger.debug(`Job ${job.id} completed in queue ${queueName}`);
  });

  worker.on('failed', (job, error) => {
    logger.error(`Job ${job?.id} failed in queue ${queueName}`, {
      error: error.message,
      jobData: job?.data,
    });
  });

  return worker;
}

// ==================== JOB SCHEDULING ====================

/**
 * Schedule morning briefing for a user
 */
export async function scheduleMorningBriefing(
  userId: string,
  hour: number = 7,
  minute: number = 0
): Promise<void> {
  const cronExpression = `${minute} ${hour} * * 1-5`; // Weekdays only

  await reportQueue.add(
    'morning-briefing',
    { type: 'daily', userId, date: new Date().toISOString() },
    {
      repeat: { pattern: cronExpression },
      jobId: `morning-briefing-${userId}`,
    }
  );

  logger.info('Morning briefing scheduled', { userId, hour, minute });
}

/**
 * Schedule weekly report for a user
 */
export async function scheduleWeeklyReport(userId: string): Promise<void> {
  await reportQueue.add(
    'weekly-report',
    { type: 'weekly', userId, date: new Date().toISOString() },
    {
      repeat: { pattern: '0 18 * * 5' }, // Friday at 6 PM
      jobId: `weekly-report-${userId}`,
    }
  );

  logger.info('Weekly report scheduled', { userId });
}

/**
 * Schedule maintenance jobs
 */
export async function scheduleMaintenanceJobs(): Promise<void> {
  // Cleanup old data daily at 3 AM
  await maintenanceQueue.add(
    'cleanup',
    { type: 'cleanup' },
    {
      repeat: { pattern: '0 3 * * *' },
      jobId: 'daily-cleanup',
    }
  );

  // Security audit weekly on Sundays at 2 AM
  await maintenanceQueue.add(
    'audit',
    { type: 'audit' },
    {
      repeat: { pattern: '0 2 * * 0' },
      jobId: 'weekly-audit',
    }
  );

  logger.info('Maintenance jobs scheduled');
}

// ==================== QUEUE MANAGEMENT ====================

/**
 * Close all queues gracefully
 */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    emailQueue.close(),
    calendarQueue.close(),
    syncQueue.close(),
    notificationQueue.close(),
    reportQueue.close(),
    maintenanceQueue.close(),
  ]);

  logger.info('All job queues closed');
}

/**
 * Get queue stats
 */
export async function getQueueStats(): Promise<Record<string, unknown>> {
  const queues = [
    { name: 'email', queue: emailQueue },
    { name: 'calendar', queue: calendarQueue },
    { name: 'sync', queue: syncQueue },
    { name: 'notification', queue: notificationQueue },
    { name: 'report', queue: reportQueue },
    { name: 'maintenance', queue: maintenanceQueue },
  ];

  const stats: Record<string, unknown> = {};

  for (const { name, queue } of queues) {
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    stats[name] = { waiting, active, completed, failed };
  }

  return stats;
}
