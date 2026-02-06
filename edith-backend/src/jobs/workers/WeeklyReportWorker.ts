/**
 * WeeklyReportWorker
 * Generates and sends weekly productivity reports to users
 */

import { Job } from 'bullmq';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';
import { notificationService } from '../../services/NotificationService.js';
import { BaseWorker } from './BaseWorker.js';
import type {
  WeeklyReportJobData,
  WeeklyReportResult,
  JobExecutionContext,
} from '../types.js';

interface WeeklyStats {
  emailsProcessed: number;
  emailsDrafted: number;
  meetingsScheduled: number;
  meetingsAttended: number;
  tasksCompleted: number;
  timeSavedMinutes: number;
  travelBooked: number;
  contactsNurtured: number;
}

interface DayStats {
  date: string;
  meetingCount: number;
  taskCount: number;
  emailCount: number;
}

export class WeeklyReportWorker extends BaseWorker<WeeklyReportJobData> {
  protected queueName = 'report';
  protected jobType = 'WEEKLY_REPORT' as const;

  protected async execute(
    job: Job<WeeklyReportJobData>,
    context: JobExecutionContext
  ): Promise<WeeklyReportResult> {
    const { userId, userTimezone } = context;

    logger.info('Generating weekly report', { userId, jobId: job.id });

    // Calculate week boundaries
    const endDate = this.getEndOfDayInTimezone(userTimezone);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);

    // Gather weekly statistics
    const stats = await this.gatherWeeklyStats(userId, startDate, endDate);
    const dailyBreakdown = await this.getDailyBreakdown(userId, startDate, endDate);
    const insights = this.generateInsights(stats, dailyBreakdown);
    const suggestions = await this.generateSuggestions(userId, stats);

    // Calculate week end date
    const weekEndDate = new Date(endDate);
    weekEndDate.setHours(23, 59, 59, 999);

    // Save weekly report to database
    const report = await prisma.weeklyReport.create({
      data: {
        userId,
        weekStart: startDate,
        weekEnd: weekEndDate,
        metrics: {
          emailsProcessed: stats.emailsProcessed,
          emailsDrafted: stats.emailsDrafted,
          meetingsScheduled: stats.meetingsScheduled,
          meetingsAttended: stats.meetingsAttended,
          tasksCompleted: stats.tasksCompleted,
          timeSavedMinutes: stats.timeSavedMinutes,
          travelBooked: stats.travelBooked,
          contactsNurtured: stats.contactsNurtured,
        },
        highlights: insights,
        suggestions,
      },
    });

    // Format and send report
    const { title, body } = this.formatReport(stats, insights, suggestions, startDate);

    await notificationService.send({
      userId,
      type: 'WEEKLY_REPORT',
      title,
      body,
      data: {
        reportId: report.id,
        weekStarting: startDate.toISOString(),
        stats,
        insights,
        suggestions,
      },
      priority: 'NORMAL',
    });

    logger.info('Weekly report sent', {
      userId,
      reportId: report.id,
      timeSaved: stats.timeSavedMinutes,
    });

    return {
      success: true,
      data: {
        reportId: report.id,
        timeSavedMinutes: stats.timeSavedMinutes,
        tasksCompleted: stats.tasksCompleted,
        emailsProcessed: stats.emailsProcessed,
        meetingsScheduled: stats.meetingsScheduled,
      },
    };
  }

  /**
   * Gather weekly statistics from all relevant tables
   */
  private async gatherWeeklyStats(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<WeeklyStats> {
    // Get aggregated metrics from SuccessMetrics table
    const metrics = await prisma.successMetrics.findMany({
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
      },
    });

    const stats: WeeklyStats = {
      emailsProcessed: 0,
      emailsDrafted: 0,
      meetingsScheduled: 0,
      meetingsAttended: 0,
      tasksCompleted: 0,
      timeSavedMinutes: 0,
      travelBooked: 0,
      contactsNurtured: 0,
    };

    for (const metric of metrics) {
      stats.emailsProcessed += metric.emailsProcessed;
      stats.emailsDrafted += metric.emailsDrafted;
      stats.meetingsScheduled += metric.meetingsScheduled;
      stats.tasksCompleted += metric.tasksCompleted;
      stats.timeSavedMinutes += metric.timeSavedMinutes;
      stats.travelBooked += metric.travelBooked;
      stats.contactsNurtured += metric.contactsNurtured;
    }

    // Count meetings attended
    stats.meetingsAttended = await prisma.calendarEvent.count({
      where: {
        userId,
        startTime: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' },
      },
    });

    return stats;
  }

  /**
   * Get daily breakdown for insights
   */
  private async getDailyBreakdown(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DayStats[]> {
    const dailyStats: DayStats[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);

      const [meetingCount, taskCount, emailCount] = await Promise.all([
        prisma.calendarEvent.count({
          where: {
            userId,
            startTime: { gte: dayStart, lte: dayEnd },
          },
        }),
        prisma.task.count({
          where: {
            userId,
            completedAt: { gte: dayStart, lte: dayEnd },
          },
        }),
        prisma.email.count({
          where: {
            userId,
            processedAt: { gte: dayStart, lte: dayEnd },
          },
        }),
      ]);

      dailyStats.push({
        date: currentDate.toISOString().split('T')[0],
        meetingCount,
        taskCount,
        emailCount,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dailyStats;
  }

  /**
   * Generate insights based on weekly data
   */
  private generateInsights(stats: WeeklyStats, dailyBreakdown: DayStats[]): string[] {
    const insights: string[] = [];

    // Time saved insight
    if (stats.timeSavedMinutes > 0) {
      const hours = Math.floor(stats.timeSavedMinutes / 60);
      const minutes = stats.timeSavedMinutes % 60;
      if (hours > 0) {
        insights.push(`You saved ${hours} hour${hours > 1 ? 's' : ''} and ${minutes} minutes this week`);
      } else {
        insights.push(`You saved ${minutes} minutes this week`);
      }
    }

    // Busiest day insight
    if (dailyBreakdown.length > 0) {
      const busiestDay = dailyBreakdown.reduce((max, day) =>
        day.meetingCount > max.meetingCount ? day : max
      );
      const dayName = new Date(busiestDay.date).toLocaleDateString('en-US', {
        weekday: 'long',
      });
      if (busiestDay.meetingCount > 0) {
        insights.push(
          `${dayName} was your busiest day with ${busiestDay.meetingCount} meetings`
        );
      }
    }

    // Productivity insight
    if (stats.tasksCompleted > 0) {
      const avgTasksPerDay = (stats.tasksCompleted / 7).toFixed(1);
      insights.push(`You completed an average of ${avgTasksPerDay} tasks per day`);
    }

    // Email processing insight
    if (stats.emailsProcessed > 0) {
      const avgEmailsPerDay = Math.round(stats.emailsProcessed / 7);
      insights.push(`Processed about ${avgEmailsPerDay} emails per day`);
    }

    // Meeting load insight
    if (stats.meetingsAttended > 15) {
      insights.push('You had a meeting-heavy week. Consider scheduling more focus time.');
    } else if (stats.meetingsAttended < 5 && stats.meetingsAttended > 0) {
      insights.push('Light meeting week - great for focused work!');
    }

    return insights;
  }

  /**
   * Generate personalized suggestions
   */
  private async generateSuggestions(
    userId: string,
    stats: WeeklyStats
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Check if approval rate is low
    const recentActions = await prisma.actionLog.findMany({
      where: {
        userId,
        executedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        status: { in: ['SUCCESS', 'REJECTED'] },
      },
      select: { status: true, userFeedback: true },
    });

    const rejected = recentActions.filter(
      (a) => a.status === 'REJECTED' || a.userFeedback === 'NEGATIVE'
    ).length;
    const total = recentActions.length;

    if (total > 10 && rejected / total > 0.3) {
      suggestions.push(
        'Consider adjusting your preferences to improve AI suggestions accuracy'
      );
    }

    // Suggest contact nurturing if low
    if (stats.contactsNurtured < 3) {
      suggestions.push(
        'Schedule time to reconnect with important contacts this week'
      );
    }

    // Suggest email management
    if (stats.emailsProcessed > 200) {
      suggestions.push(
        'High email volume detected. Consider using more filters or delegating'
      );
    }

    // Suggest meeting optimization
    if (stats.meetingsAttended > 20) {
      suggestions.push(
        'Consider auditing recurring meetings to reclaim time'
      );
    }

    return suggestions;
  }

  /**
   * Format report into notification content
   */
  private formatReport(
    stats: WeeklyStats,
    insights: string[],
    suggestions: string[],
    weekStart: Date
  ): { title: string; body: string } {
    const weekStr = weekStart.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    const title = `Your Week in Review (${weekStr})`;

    const lines: string[] = [];

    // Stats summary
    lines.push('This Week:');
    if (stats.timeSavedMinutes > 0) {
      const hours = Math.floor(stats.timeSavedMinutes / 60);
      const mins = stats.timeSavedMinutes % 60;
      lines.push(`⏱️ ${hours > 0 ? `${hours}h ` : ''}${mins}m saved`);
    }
    lines.push(`📧 ${stats.emailsProcessed} emails processed`);
    lines.push(`✅ ${stats.tasksCompleted} tasks completed`);
    lines.push(`📅 ${stats.meetingsAttended} meetings attended`);

    // Top insight
    if (insights.length > 0) {
      lines.push('');
      lines.push(`💡 ${insights[0]}`);
    }

    // Top suggestion
    if (suggestions.length > 0) {
      lines.push('');
      lines.push(`📌 ${suggestions[0]}`);
    }

    return {
      title,
      body: lines.join('\n'),
    };
  }

  protected async updateMetrics(
    context: JobExecutionContext,
    result: WeeklyReportResult
  ): Promise<void> {
    // Weekly report doesn't update success metrics
  }
}

export const weeklyReportWorker = new WeeklyReportWorker();
