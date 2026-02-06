/**
 * MetricAggregationWorker
 * Daily job to aggregate and calculate success metrics for all users
 */

import { Job } from 'bullmq';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';
import { BaseWorker } from './BaseWorker.js';
import type {
  MetricAggregationJobData,
  JobExecutionContext,
  JobResult,
} from '../types.js';

export class MetricAggregationWorker extends BaseWorker<MetricAggregationJobData> {
  protected queueName = 'maintenance';
  protected jobType = 'METRIC_AGGREGATION' as const;

  protected async execute(
    job: Job<MetricAggregationJobData>,
    context: JobExecutionContext
  ): Promise<JobResult> {
    // Determine which date to aggregate (default: yesterday)
    const targetDate = job.data.date
      ? new Date(job.data.date)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

    logger.info('Starting metric aggregation', {
      jobId: job.id,
      targetDate: targetDate.toISOString(),
    });

    // Get all active users
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    let usersProcessed = 0;
    let totalTimeSaved = 0;

    for (const user of users) {
      try {
        const metrics = await this.aggregateUserMetrics(
          user.id,
          targetDate,
          nextDay
        );

        // Upsert success metrics for the day
        await prisma.successMetrics.upsert({
          where: {
            userId_date: { userId: user.id, date: targetDate },
          },
          create: {
            userId: user.id,
            date: targetDate,
            ...metrics,
          },
          update: metrics,
        });

        usersProcessed++;
        totalTimeSaved += metrics.timeSavedMinutes;
      } catch (error) {
        logger.error('Failed to aggregate metrics for user', {
          userId: user.id,
          error: (error as Error).message,
        });
      }
    }

    logger.info('Metric aggregation completed', {
      usersProcessed,
      totalTimeSaved,
      targetDate: targetDate.toISOString(),
    });

    return {
      success: true,
      data: {
        usersProcessed,
        totalTimeSaved,
        targetDate: targetDate.toISOString(),
      },
    };
  }

  /**
   * Aggregate metrics for a single user for a specific day
   */
  private async aggregateUserMetrics(
    userId: string,
    startOfDay: Date,
    endOfDay: Date
  ): Promise<{
    emailsProcessed: number;
    emailsDrafted: number;
    meetingsScheduled: number;
    tasksCompleted: number;
    timeSavedMinutes: number;
    travelBooked: number;
    contactsNurtured: number;
  }> {
    // Count emails processed
    const emailsProcessed = await prisma.email.count({
      where: {
        userId,
        processedAt: { gte: startOfDay, lt: endOfDay },
        processingStatus: 'COMPLETED',
      },
    });

    // Count drafts created/sent
    const emailsDrafted = await prisma.emailDraft.count({
      where: {
        userId,
        createdAt: { gte: startOfDay, lt: endOfDay },
      },
    });

    // Count meetings scheduled (created by AI)
    const meetingsScheduled = await prisma.calendarEvent.count({
      where: {
        userId,
        createdAt: { gte: startOfDay, lt: endOfDay },
      },
    });

    // Count tasks completed
    const tasksCompleted = await prisma.task.count({
      where: {
        userId,
        completedAt: { gte: startOfDay, lt: endOfDay },
        status: 'DONE',
      },
    });

    // Count travel bookings
    const travelBooked = await prisma.booking.count({
      where: {
        trip: { userId },
        bookedAt: { gte: startOfDay, lt: endOfDay },
        status: 'CONFIRMED',
      },
    });

    // Count contacts nurtured (interactions logged)
    const contactsNurtured = await prisma.interaction.count({
      where: {
        userId,
        createdAt: { gte: startOfDay, lt: endOfDay },
      },
    });

    // Calculate approval rate for learning
    const approvalStats = await this.calculateApprovalStats(userId, startOfDay, endOfDay);

    // Estimate time saved based on actions
    const timeSavedMinutes = this.estimateTimeSaved({
      emailsProcessed,
      emailsDrafted,
      meetingsScheduled,
      tasksCompleted,
      approvalRate: approvalStats.approvalRate,
    });

    return {
      emailsProcessed,
      emailsDrafted,
      meetingsScheduled,
      tasksCompleted,
      timeSavedMinutes,
      travelBooked,
      contactsNurtured,
    };
  }

  /**
   * Calculate approval/rejection stats for agent actions
   */
  private async calculateApprovalStats(
    userId: string,
    startOfDay: Date,
    endOfDay: Date
  ): Promise<{
    approved: number;
    rejected: number;
    approvalRate: number;
  }> {
    const actions = await prisma.actionLog.findMany({
      where: {
        userId,
        executedAt: { gte: startOfDay, lt: endOfDay },
        status: { in: ['SUCCESS', 'REJECTED'] },
      },
      select: { status: true, userFeedback: true },
    });

    const approved = actions.filter(
      (a) => a.status === 'SUCCESS' && a.userFeedback !== 'NEGATIVE'
    ).length;
    const rejected = actions.filter(
      (a) => a.status === 'REJECTED' || a.userFeedback === 'NEGATIVE'
    ).length;
    const total = approved + rejected;

    return {
      approved,
      rejected,
      approvalRate: total > 0 ? approved / total : 1,
    };
  }

  /**
   * Estimate time saved based on completed actions
   * These are rough estimates in minutes
   */
  private estimateTimeSaved(metrics: {
    emailsProcessed: number;
    emailsDrafted: number;
    meetingsScheduled: number;
    tasksCompleted: number;
    approvalRate: number;
  }): number {
    // Time estimates per action type
    const timePerEmail = 1; // 1 minute per email processed
    const timePerDraft = 5; // 5 minutes per draft composed
    const timePerMeeting = 10; // 10 minutes per meeting scheduled
    const timePerTask = 2; // 2 minutes per task managed

    // Calculate base time saved
    let timeSaved =
      metrics.emailsProcessed * timePerEmail +
      metrics.emailsDrafted * timePerDraft +
      metrics.meetingsScheduled * timePerMeeting +
      metrics.tasksCompleted * timePerTask;

    // Adjust by approval rate (lower rate = less trust = less value)
    timeSaved = Math.round(timeSaved * metrics.approvalRate);

    return timeSaved;
  }

  protected async updateMetrics(
    context: JobExecutionContext,
    result: JobResult
  ): Promise<void> {
    // This job IS the metrics updater, no additional updates needed
  }
}

export const metricAggregationWorker = new MetricAggregationWorker();
