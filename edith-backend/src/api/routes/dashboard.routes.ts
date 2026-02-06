/**
 * Dashboard API Routes
 * Metrics, insights, and reports
 */

import { Router } from 'express';
import type { Router as RouterType, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { reportingService } from '../../services/ReportingService.js';
import { taskService } from '../../services/TaskService.js';
import { inboxService } from '../../services/InboxService.js';
import { calendarService } from '../../services/CalendarService.js';
import { sendSuccess, sendError } from '../../utils/helpers.js';
import { reportExportSchema } from '../../utils/validation.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const router: RouterType = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * GET /dashboard
 * Get main dashboard data
 */
router.get(
  '/',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;

      const dashboardData = await reportingService.getDashboardData(userId);
      sendSuccess(res, dashboardData);
    } catch (error) {
      logger.error('Failed to get dashboard data', { error });
      sendError(res, 'Failed to retrieve dashboard data', 500);
    }
  }
);

/**
 * GET /dashboard/metrics
 * Get performance metrics
 */
router.get('/metrics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { startDate, endDate } = req.query;

    // Get various metrics
    const start = startDate
      ? new Date(startDate as string)
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate as string) : new Date();

    const [taskStats, inboxStats, calendarStats] = await Promise.all([
      taskService.getStats(userId, start, end),
      inboxService.getStats(userId),
      calendarService.getStats(userId, start, end),
    ]);

    sendSuccess(res, {
      period: { startDate: start, endDate: end },
      tasks: taskStats,
      inbox: inboxStats,
      calendar: calendarStats,
    });
  } catch (error) {
    logger.error('Failed to get metrics', { error });
    sendError(res, 'Failed to retrieve metrics', 500);
  }
});

/**
 * GET /dashboard/insights
 * Get AI-powered insights
 */
router.get('/insights', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const dashboardData = await reportingService.getDashboardData(userId);

    // Generate insights from dashboard data
    const insights: string[] = [];

    // Add insights based on pending items
    if (dashboardData.pendingItems.unreadEmails > 10) {
      insights.push(`You have ${dashboardData.pendingItems.unreadEmails} unread emails to process.`);
    }
    if (dashboardData.pendingItems.pendingTasks > 5) {
      insights.push(`${dashboardData.pendingItems.pendingTasks} tasks are waiting for your attention.`);
    }
    if (dashboardData.pendingItems.pendingApprovals > 0) {
      insights.push(`${dashboardData.pendingItems.pendingApprovals} approvals need your review.`);
    }

    // Add productivity insights
    if (dashboardData.weekStats.timeSavedMinutes > 60) {
      insights.push(`Great week! You saved ${Math.round(dashboardData.weekStats.timeSavedMinutes / 60)} hours this week.`);
    }

    sendSuccess(res, {
      insights,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get insights', { error });
    sendError(res, 'Failed to retrieve insights', 500);
  }
});

/**
 * GET /dashboard/activity
 * Get recent activity
 */
router.get('/activity', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const dashboardData = await reportingService.getDashboardData(userId);

    // Extract recent activity
    const activity = dashboardData.recentActivity?.slice(0, limit) || [];

    sendSuccess(res, activity);
  } catch (error) {
    logger.error('Failed to get activity', { error });
    sendError(res, 'Failed to retrieve activity', 500);
  }
});

/**
 * GET /dashboard/upcoming
 * Get upcoming items (meetings, tasks, travel)
 */
router.get('/upcoming', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const days = Math.min(Number(req.query.days) || 7, 30);

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const [{ events }, tasksDueToday, tasksOverdue] = await Promise.all([
      calendarService.getEvents(userId, {
        startDate: new Date(),
        endDate,
      }),
      taskService.getTasksDueToday(userId),
      taskService.getOverdueTasks(userId),
    ]);

    sendSuccess(res, {
      events: events.slice(0, 10),
      tasksDueToday,
      tasksOverdue,
      period: { days },
    });
  } catch (error) {
    logger.error('Failed to get upcoming items', { error });
    sendError(res, 'Failed to retrieve upcoming items', 500);
  }
});

/**
 * GET /reports/weekly
 * Get weekly report
 */
router.get('/reports/weekly', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const weekOffset = Number(req.query.offset) || 0;

    // Calculate week start (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset - (weekOffset * 7));
    weekStart.setHours(0, 0, 0, 0);

    const report = await reportingService.getWeeklyReport(userId, weekStart);

    if (!report) {
      sendSuccess(res, {
        message: 'No report available for this week',
        weekStart,
      });
      return;
    }

    sendSuccess(res, report);
  } catch (error) {
    logger.error('Failed to get weekly report', { error });
    sendError(res, 'Failed to generate weekly report', 500);
  }
});

/**
 * GET /reports/monthly
 * Get monthly report
 */
router.get('/reports/monthly', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;

    const report = await reportingService.generateMonthlySummary(userId, month, year);
    sendSuccess(res, report);
  } catch (error) {
    logger.error('Failed to get monthly report', { error });
    sendError(res, 'Failed to generate monthly report', 500);
  }
});

/**
 * POST /reports/export
 * Export a report
 */
router.post(
  '/reports/export',
  validateBody(reportExportSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { type, format, startDate, endDate } = req.body;

      const result = await reportingService.exportReport(userId, type, format, {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      });

      sendSuccess(res, result, 'Report export initiated');
    } catch (error) {
      logger.error('Failed to export report', { error });
      sendError(res, 'Failed to export report', 500);
    }
  }
);

/**
 * GET /dashboard/productivity
 * Get productivity score and breakdown
 */
router.get('/productivity', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const dashboardData = await reportingService.getDashboardData(userId);

    // Calculate productivity score based on week stats
    const weekStats = dashboardData.weekStats;
    const maxScore = 100;
    const tasksWeight = 30;
    const emailsWeight = 30;
    const meetingsWeight = 20;
    const timeSavedWeight = 20;

    // Simple productivity score calculation (can be refined)
    const score = Math.min(
      maxScore,
      Math.round(
        (weekStats.tasksCompleted / 10) * tasksWeight +
        (weekStats.emailsProcessed / 50) * emailsWeight +
        (weekStats.meetingsAttended / 10) * meetingsWeight +
        (weekStats.timeSavedMinutes / 120) * timeSavedWeight
      )
    );

    const productivity = {
      score,
      tasksCompleted: weekStats.tasksCompleted,
      emailsProcessed: weekStats.emailsProcessed,
      meetingsAttended: weekStats.meetingsAttended,
      timeSaved: weekStats.timeSavedMinutes,
      todayStats: dashboardData.todayStats,
    };

    sendSuccess(res, productivity);
  } catch (error) {
    logger.error('Failed to get productivity score', { error });
    sendError(res, 'Failed to retrieve productivity score', 500);
  }
});

/**
 * GET /dashboard/trends
 * Get trends over time
 */
router.get('/trends', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { period } = req.query;

    // Default to last 7 days
    const days = period === 'month' ? 30 : period === 'quarter' ? 90 : 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get daily stats for the period
    // This would typically be aggregated from SuccessMetrics table
    const trends = {
      period: { days, startDate, endDate: new Date() },
      tasksCompleted: [],
      emailsProcessed: [],
      meetingsScheduled: [],
      focusMinutes: [],
      message: 'Detailed trends require SuccessMetrics aggregation',
    };

    sendSuccess(res, trends);
  } catch (error) {
    logger.error('Failed to get trends', { error });
    sendError(res, 'Failed to retrieve trends', 500);
  }
});

export default router;
