/**
 * Workers Index
 * Registers and initializes all job workers
 */

import { Worker } from 'bullmq';
import { logger } from '../../utils/logger.js';
import {
  emailQueue,
  calendarQueue,
  reportQueue,
  maintenanceQueue,
  notificationQueue,
} from '../queue.js';

// Import workers
import { morningBriefingWorker } from './MorningBriefingWorker.js';
import { inboxProcessorWorker } from './InboxProcessorWorker.js';
import { meetingPrepWorker } from './MeetingPrepWorker.js';
import { calendarOptimizerWorker } from './CalendarOptimizerWorker.js';
import { weeklyReportWorker } from './WeeklyReportWorker.js';
import { emailDigestWorker } from './EmailDigestWorker.js';
import { followUpReminderWorker } from './FollowUpReminderWorker.js';
import { relationshipNurtureWorker } from './RelationshipNurtureWorker.js';
import { securityAuditWorker } from './SecurityAuditWorker.js';
import { metricAggregationWorker } from './MetricAggregationWorker.js';

// Export workers for direct access
export { morningBriefingWorker } from './MorningBriefingWorker.js';
export { inboxProcessorWorker } from './InboxProcessorWorker.js';
export { meetingPrepWorker } from './MeetingPrepWorker.js';
export { calendarOptimizerWorker } from './CalendarOptimizerWorker.js';
export { weeklyReportWorker } from './WeeklyReportWorker.js';
export { emailDigestWorker } from './EmailDigestWorker.js';
export { followUpReminderWorker } from './FollowUpReminderWorker.js';
export { relationshipNurtureWorker } from './RelationshipNurtureWorker.js';
export { securityAuditWorker } from './SecurityAuditWorker.js';
export { metricAggregationWorker } from './MetricAggregationWorker.js';

// Collection of all initialized workers
const workers: Worker[] = [];

/**
 * Initialize all workers and attach them to their respective queues
 */
export async function initializeWorkers(): Promise<void> {
  logger.info('Initializing job workers...');

  try {
    // Report queue workers
    workers.push(morningBriefingWorker.initialize(reportQueue as any));
    logger.debug('MorningBriefingWorker initialized');

    workers.push(weeklyReportWorker.initialize(reportQueue as any));
    logger.debug('WeeklyReportWorker initialized');

    // Email queue workers
    workers.push(inboxProcessorWorker.initialize(emailQueue as any));
    logger.debug('InboxProcessorWorker initialized');

    workers.push(emailDigestWorker.initialize(emailQueue as any));
    logger.debug('EmailDigestWorker initialized');

    // Calendar queue workers
    workers.push(meetingPrepWorker.initialize(calendarQueue as any));
    logger.debug('MeetingPrepWorker initialized');

    workers.push(calendarOptimizerWorker.initialize(calendarQueue as any));
    logger.debug('CalendarOptimizerWorker initialized');

    // Notification queue workers
    workers.push(followUpReminderWorker.initialize(notificationQueue as any));
    logger.debug('FollowUpReminderWorker initialized');

    // Maintenance queue workers
    workers.push(securityAuditWorker.initialize(maintenanceQueue as any));
    logger.debug('SecurityAuditWorker initialized');

    workers.push(metricAggregationWorker.initialize(maintenanceQueue as any));
    logger.debug('MetricAggregationWorker initialized');

    workers.push(relationshipNurtureWorker.initialize(maintenanceQueue as any));
    logger.debug('RelationshipNurtureWorker initialized');

    logger.info('All job workers initialized', { count: workers.length });
  } catch (error) {
    logger.error('Failed to initialize workers', { error: (error as Error).message });
    throw error;
  }
}

/**
 * Stop all workers gracefully
 */
export async function stopWorkers(): Promise<void> {
  logger.info('Stopping job workers...');

  const stopPromises = workers.map(async (worker) => {
    try {
      await worker.close();
    } catch (error) {
      logger.error('Error stopping worker', {
        worker: worker.name,
        error: (error as Error).message,
      });
    }
  });

  await Promise.all(stopPromises);
  workers.length = 0;

  logger.info('All job workers stopped');
}

/**
 * Get health status of all workers
 */
export function getWorkersHealth(): Array<{
  name: string;
  isRunning: boolean;
  isPaused: boolean;
}> {
  return workers.map((worker) => ({
    name: worker.name,
    isRunning: worker.isRunning(),
    isPaused: worker.isPaused(),
  }));
}

/**
 * Pause all workers (for maintenance)
 */
export async function pauseWorkers(): Promise<void> {
  logger.info('Pausing all workers...');
  await Promise.all(workers.map((worker) => worker.pause()));
}

/**
 * Resume all workers
 */
export async function resumeWorkers(): Promise<void> {
  logger.info('Resuming all workers...');
  await Promise.all(workers.map((worker) => worker.resume()));
}
