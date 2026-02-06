/**
 * ReportingService
 * Provides dashboard data, reports, and export functionality
 */

import { prisma } from '../database/client.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface DashboardData {
  todayStats: {
    emailsProcessed: number;
    tasksCompleted: number;
    meetingsAttended: number;
    timeSavedMinutes: number;
  };
  weekStats: {
    emailsProcessed: number;
    tasksCompleted: number;
    meetingsAttended: number;
    timeSavedMinutes: number;
  };
  pendingItems: {
    unreadEmails: number;
    pendingTasks: number;
    upcomingMeetings: number;
    pendingApprovals: number;
  };
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: Date;
  }>;
  nextMeeting?: {
    title: string;
    startTime: Date;
    attendeeCount: number;
  };
}

export interface WeeklyReportData {
  id: string;
  weekStart: Date;
  weekEnd: Date;
  metrics: {
    emailsProcessed: number;
    emailsDrafted: number;
    meetingsScheduled: number;
    meetingsAttended: number;
    tasksCompleted: number;
    timeSavedMinutes: number;
    travelBooked: number;
    contactsNurtured: number;
  };
  highlights: string[];
  suggestions: string[];
  generatedAt: Date;
}

export interface MonthlySummary {
  month: string;
  year: number;
  weeks: WeeklyReportData[];
  totals: {
    emailsProcessed: number;
    tasksCompleted: number;
    meetingsAttended: number;
    timeSavedMinutes: number;
  };
  trends: {
    emailTrend: number;
    taskTrend: number;
    timeSavedTrend: number;
  };
}

// ============================================================================
// Service Implementation
// ============================================================================

class ReportingServiceImpl {
  /**
   * Get dashboard data for a user
   */
  async getDashboardData(userId: string): Promise<DashboardData> {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);

    // Get today's and week's success metrics
    const [todayMetrics, weekMetrics] = await Promise.all([
      prisma.successMetrics.findFirst({
        where: { userId, date: { gte: startOfToday, lte: endOfToday } },
      }),
      prisma.successMetrics.findMany({
        where: { userId, date: { gte: startOfWeek } },
      }),
    ]);

    // Aggregate week metrics
    const weekTotals = weekMetrics.reduce(
      (acc, m) => ({
        emailsProcessed: acc.emailsProcessed + m.emailsProcessed,
        tasksCompleted: acc.tasksCompleted + m.tasksCompleted,
        meetingsAttended: acc.meetingsAttended + m.meetingsScheduled,
        timeSavedMinutes: acc.timeSavedMinutes + m.timeSavedMinutes,
      }),
      { emailsProcessed: 0, tasksCompleted: 0, meetingsAttended: 0, timeSavedMinutes: 0 }
    );

    // Get pending items
    const [unreadEmails, pendingTasks, upcomingMeetings, pendingApprovals] =
      await Promise.all([
        prisma.email.count({
          where: { userId, isRead: false },
        }),
        prisma.task.count({
          where: { userId, status: { notIn: ['DONE'] } },
        }),
        prisma.calendarEvent.count({
          where: {
            userId,
            startTime: { gte: now, lte: endOfToday },
            status: { not: 'CANCELLED' },
          },
        }),
        prisma.notification.count({
          where: {
            userId,
            type: 'APPROVAL_REQUEST',
            readAt: null,
          },
        }),
      ]);

    // Get recent activity
    const recentActions = await prisma.actionLog.findMany({
      where: { userId },
      orderBy: { executedAt: 'desc' },
      take: 10,
      select: {
        action: true,
        agentType: true,
        executedAt: true,
        status: true,
      },
    });

    // Get next meeting
    const nextMeeting = await prisma.calendarEvent.findFirst({
      where: {
        userId,
        startTime: { gte: now },
        status: { not: 'CANCELLED' },
      },
      orderBy: { startTime: 'asc' },
      select: {
        title: true,
        startTime: true,
        attendees: true,
      },
    });

    return {
      todayStats: {
        emailsProcessed: todayMetrics?.emailsProcessed || 0,
        tasksCompleted: todayMetrics?.tasksCompleted || 0,
        meetingsAttended: todayMetrics?.meetingsScheduled || 0,
        timeSavedMinutes: todayMetrics?.timeSavedMinutes || 0,
      },
      weekStats: weekTotals,
      pendingItems: {
        unreadEmails,
        pendingTasks,
        upcomingMeetings,
        pendingApprovals,
      },
      recentActivity: recentActions.map((a) => ({
        type: a.agentType,
        description: `${a.action} (${a.status})`,
        timestamp: a.executedAt,
      })),
      nextMeeting: nextMeeting
        ? {
            title: nextMeeting.title,
            startTime: nextMeeting.startTime,
            attendeeCount: Array.isArray(nextMeeting.attendees)
              ? (nextMeeting.attendees as string[]).length
              : 0,
          }
        : undefined,
    };
  }

  /**
   * Get weekly report for a specific week
   */
  async getWeeklyReport(
    userId: string,
    weekStart?: Date
  ): Promise<WeeklyReportData | null> {
    const targetWeekStart = weekStart || this.getLastWeekStart();

    const report = await prisma.weeklyReport.findFirst({
      where: {
        userId,
        weekStart: { gte: targetWeekStart },
      },
      orderBy: { weekStart: 'desc' },
    });

    if (!report) {
      return null;
    }

    const metrics = (report.metrics as Record<string, number>) || {};

    return {
      id: report.id,
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
      metrics: {
        emailsProcessed: metrics.emailsProcessed || 0,
        emailsDrafted: metrics.emailsDrafted || 0,
        meetingsScheduled: metrics.meetingsScheduled || 0,
        meetingsAttended: metrics.meetingsAttended || 0,
        tasksCompleted: metrics.tasksCompleted || 0,
        timeSavedMinutes: metrics.timeSavedMinutes || 0,
        travelBooked: metrics.travelBooked || 0,
        contactsNurtured: metrics.contactsNurtured || 0,
      },
      highlights: report.highlights,
      suggestions: report.suggestions,
      generatedAt: report.generatedAt,
    };
  }

  /**
   * Generate monthly summary from weekly reports
   */
  async generateMonthlySummary(
    userId: string,
    month: number,
    year: number
  ): Promise<MonthlySummary> {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const weeklyReports = await prisma.weeklyReport.findMany({
      where: {
        userId,
        weekStart: { gte: startOfMonth, lte: endOfMonth },
      },
      orderBy: { weekStart: 'asc' },
    });

    const weeks: WeeklyReportData[] = weeklyReports.map((report) => {
      const metrics = (report.metrics as Record<string, number>) || {};
      return {
        id: report.id,
        weekStart: report.weekStart,
        weekEnd: report.weekEnd,
        metrics: {
          emailsProcessed: metrics.emailsProcessed || 0,
          emailsDrafted: metrics.emailsDrafted || 0,
          meetingsScheduled: metrics.meetingsScheduled || 0,
          meetingsAttended: metrics.meetingsAttended || 0,
          tasksCompleted: metrics.tasksCompleted || 0,
          timeSavedMinutes: metrics.timeSavedMinutes || 0,
          travelBooked: metrics.travelBooked || 0,
          contactsNurtured: metrics.contactsNurtured || 0,
        },
        highlights: report.highlights,
        suggestions: report.suggestions,
        generatedAt: report.generatedAt,
      };
    });

    // Calculate totals
    const totals = weeks.reduce(
      (acc, week) => ({
        emailsProcessed: acc.emailsProcessed + week.metrics.emailsProcessed,
        tasksCompleted: acc.tasksCompleted + week.metrics.tasksCompleted,
        meetingsAttended: acc.meetingsAttended + week.metrics.meetingsAttended,
        timeSavedMinutes: acc.timeSavedMinutes + week.metrics.timeSavedMinutes,
      }),
      { emailsProcessed: 0, tasksCompleted: 0, meetingsAttended: 0, timeSavedMinutes: 0 }
    );

    // Calculate trends (compare first half to second half of month)
    const trends = this.calculateTrends(weeks);

    return {
      month: new Date(year, month - 1).toLocaleDateString('en-US', {
        month: 'long',
      }),
      year,
      weeks,
      totals,
      trends,
    };
  }

  /**
   * Export report data in various formats
   */
  async exportReport(
    userId: string,
    type: 'weekly' | 'monthly' | 'custom',
    format: 'json' | 'csv',
    options: {
      startDate?: Date;
      endDate?: Date;
      month?: number;
      year?: number;
    } = {}
  ): Promise<{ data: string; filename: string; mimeType: string }> {
    let reportData: unknown;
    let filename: string;

    if (type === 'weekly') {
      reportData = await this.getWeeklyReport(userId, options.startDate);
      filename = `weekly-report-${new Date().toISOString().split('T')[0]}`;
    } else if (type === 'monthly' && options.month && options.year) {
      reportData = await this.generateMonthlySummary(
        userId,
        options.month,
        options.year
      );
      filename = `monthly-report-${options.year}-${options.month.toString().padStart(2, '0')}`;
    } else {
      // Custom date range
      const startDate = options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = options.endDate || new Date();

      const metrics = await prisma.successMetrics.findMany({
        where: {
          userId,
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: 'asc' },
      });

      reportData = { dateRange: { start: startDate, end: endDate }, metrics };
      filename = `custom-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}`;
    }

    if (format === 'json') {
      return {
        data: JSON.stringify(reportData, null, 2),
        filename: `${filename}.json`,
        mimeType: 'application/json',
      };
    } else {
      // CSV format
      const csvData = this.convertToCSV(reportData);
      return {
        data: csvData,
        filename: `${filename}.csv`,
        mimeType: 'text/csv',
      };
    }
  }

  /**
   * Get time saved statistics
   */
  async getTimeSavedStats(
    userId: string,
    period: 'week' | 'month' | 'year'
  ): Promise<{
    totalMinutes: number;
    byCategory: Record<string, number>;
    trend: number;
  }> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
    }

    const metrics = await prisma.successMetrics.findMany({
      where: {
        userId,
        date: { gte: startDate },
      },
    });

    const totalMinutes = metrics.reduce((sum, m) => sum + m.timeSavedMinutes, 0);

    // Estimate time saved by category based on action types
    const byCategory = {
      email: metrics.reduce((sum, m) => sum + m.emailsProcessed * 1 + m.emailsDrafted * 5, 0),
      calendar: metrics.reduce((sum, m) => sum + m.meetingsScheduled * 10, 0),
      tasks: metrics.reduce((sum, m) => sum + m.tasksCompleted * 2, 0),
      travel: metrics.reduce((sum, m) => sum + m.travelBooked * 30, 0),
    };

    // Calculate trend (compare current period to previous period)
    const previousStart = new Date(startDate.getTime() - (now.getTime() - startDate.getTime()));
    const previousMetrics = await prisma.successMetrics.findMany({
      where: {
        userId,
        date: { gte: previousStart, lt: startDate },
      },
    });

    const previousTotal = previousMetrics.reduce(
      (sum, m) => sum + m.timeSavedMinutes,
      0
    );
    const trend = previousTotal > 0 ? ((totalMinutes - previousTotal) / previousTotal) * 100 : 0;

    return {
      totalMinutes,
      byCategory,
      trend: Math.round(trend),
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private getLastWeekStart(): Date {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) - 7;
    const lastWeekStart = new Date(now.setDate(diff));
    lastWeekStart.setHours(0, 0, 0, 0);
    return lastWeekStart;
  }

  private calculateTrends(weeks: WeeklyReportData[]): {
    emailTrend: number;
    taskTrend: number;
    timeSavedTrend: number;
  } {
    if (weeks.length < 2) {
      return { emailTrend: 0, taskTrend: 0, timeSavedTrend: 0 };
    }

    const midpoint = Math.floor(weeks.length / 2);
    const firstHalf = weeks.slice(0, midpoint);
    const secondHalf = weeks.slice(midpoint);

    const firstHalfTotals = firstHalf.reduce(
      (acc, w) => ({
        emails: acc.emails + w.metrics.emailsProcessed,
        tasks: acc.tasks + w.metrics.tasksCompleted,
        time: acc.time + w.metrics.timeSavedMinutes,
      }),
      { emails: 0, tasks: 0, time: 0 }
    );

    const secondHalfTotals = secondHalf.reduce(
      (acc, w) => ({
        emails: acc.emails + w.metrics.emailsProcessed,
        tasks: acc.tasks + w.metrics.tasksCompleted,
        time: acc.time + w.metrics.timeSavedMinutes,
      }),
      { emails: 0, tasks: 0, time: 0 }
    );

    return {
      emailTrend: this.calcTrendPercent(firstHalfTotals.emails, secondHalfTotals.emails),
      taskTrend: this.calcTrendPercent(firstHalfTotals.tasks, secondHalfTotals.tasks),
      timeSavedTrend: this.calcTrendPercent(firstHalfTotals.time, secondHalfTotals.time),
    };
  }

  private calcTrendPercent(first: number, second: number): number {
    if (first === 0) return second > 0 ? 100 : 0;
    return Math.round(((second - first) / first) * 100);
  }

  private convertToCSV(data: unknown): string {
    if (!data || typeof data !== 'object') {
      return '';
    }

    const obj = data as Record<string, unknown>;

    // Handle array of metrics
    if (Array.isArray(obj.metrics)) {
      const metrics = obj.metrics;
      if (metrics.length === 0) return '';

      const headers = Object.keys(metrics[0] as Record<string, unknown>);
      const rows = metrics.map((m) =>
        headers.map((h) => String((m as Record<string, unknown>)[h] ?? '')).join(',')
      );
      return [headers.join(','), ...rows].join('\n');
    }

    // Handle single object
    if (obj.metrics && typeof obj.metrics === 'object') {
      const metrics = obj.metrics as Record<string, unknown>;
      const headers = Object.keys(metrics);
      const values = headers.map((h) => String(metrics[h] ?? ''));
      return [headers.join(','), values.join(',')].join('\n');
    }

    // Fallback: stringify keys and values
    const entries = Object.entries(obj);
    return entries.map(([key, value]) => `${key},${JSON.stringify(value)}`).join('\n');
  }
}

export const reportingService = new ReportingServiceImpl();
export default reportingService;
