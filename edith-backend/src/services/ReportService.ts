/**
 * ReportService
 * Business logic for generating daily/weekly reports and metrics
 */

import { prisma } from '../database/client.js';

// TaskStatus: TODO, IN_PROGRESS, BLOCKED, DONE
// Contact uses reminders (ContactReminder) not followUps
// ContactReminder uses isCompleted (boolean) not status
// Email uses priorityScore not priority

export interface DailyReport {
  date: Date;
  summary: {
    emailsProcessed: number;
    meetingsAttended: number;
    tasksCompleted: number;
    contactsEngaged: number;
  };
  highlights: string[];
  actionItems: Array<{
    type: string;
    description: string;
    priority: string;
  }>;
  sections: {
    inbox: InboxReport;
    calendar: CalendarReport;
    tasks: TaskReport;
    crm: CRMReport;
  };
}

export interface WeeklyReport {
  startDate: Date;
  endDate: Date;
  summary: {
    totalEmails: number;
    totalMeetings: number;
    totalMeetingMinutes: number;
    tasksCreated: number;
    tasksCompleted: number;
    contactsEngaged: number;
    travelDays: number;
  };
  trends: {
    emailVolume: 'increasing' | 'decreasing' | 'stable';
    meetingLoad: 'increasing' | 'decreasing' | 'stable';
    taskCompletion: 'improving' | 'declining' | 'stable';
  };
  recommendations: string[];
  dailyBreakdown: DailyReport[];
}

interface InboxReport {
  received: number;
  sent: number;
  unread: number;
  categorized: Record<string, number>;
  responseTime?: number;
}

interface CalendarReport {
  events: number;
  totalMinutes: number;
  conflictsResolved: number;
  focusTimeProtected: number;
}

interface TaskReport {
  created: number;
  completed: number;
  overdue: number;
  byPriority: Record<string, number>;
}

interface CRMReport {
  interactions: number;
  newContacts: number;
  remindersCompleted: number;
  remindersPending: number;
}

class ReportServiceImpl {
  /**
   * Generate daily report
   */
  async generateDailyReport(userId: string, date: Date = new Date()): Promise<DailyReport> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Gather data from all domains
    const [inboxReport, calendarReport, taskReport, crmReport] = await Promise.all([
      this.generateInboxReport(userId, startOfDay, endOfDay),
      this.generateCalendarReport(userId, startOfDay, endOfDay),
      this.generateTaskReport(userId, startOfDay, endOfDay),
      this.generateCRMReport(userId, startOfDay, endOfDay),
    ]);

    // Generate highlights
    const highlights = this.generateHighlights(inboxReport, calendarReport, taskReport, crmReport);

    // Generate action items
    const actionItems = await this.generateActionItems(userId, date);

    return {
      date,
      summary: {
        emailsProcessed: inboxReport.received + inboxReport.sent,
        meetingsAttended: calendarReport.events,
        tasksCompleted: taskReport.completed,
        contactsEngaged: crmReport.interactions,
      },
      highlights,
      actionItems,
      sections: {
        inbox: inboxReport,
        calendar: calendarReport,
        tasks: taskReport,
        crm: crmReport,
      },
    };
  }

  /**
   * Generate weekly report
   */
  async generateWeeklyReport(userId: string, weekStart?: Date): Promise<WeeklyReport> {
    const startDate = weekStart || this.getWeekStart(new Date());
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    // Generate daily reports for the week
    const dailyBreakdown: DailyReport[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const report = await this.generateDailyReport(userId, new Date(currentDate));
      dailyBreakdown.push(report);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Aggregate summary
    const summary = {
      totalEmails: dailyBreakdown.reduce((sum, d) => sum + d.summary.emailsProcessed, 0),
      totalMeetings: dailyBreakdown.reduce((sum, d) => sum + d.summary.meetingsAttended, 0),
      totalMeetingMinutes: dailyBreakdown.reduce((sum, d) => sum + d.sections.calendar.totalMinutes, 0),
      tasksCreated: dailyBreakdown.reduce((sum, d) => sum + d.sections.tasks.created, 0),
      tasksCompleted: dailyBreakdown.reduce((sum, d) => sum + d.summary.tasksCompleted, 0),
      contactsEngaged: dailyBreakdown.reduce((sum, d) => sum + d.summary.contactsEngaged, 0),
      travelDays: await this.countTravelDays(userId, startDate, endDate),
    };

    // Calculate trends (compare to previous week)
    const trends = await this.calculateTrends(userId, startDate);

    // Generate recommendations
    const recommendations = this.generateRecommendations(summary, trends, dailyBreakdown);

    return {
      startDate,
      endDate,
      summary,
      trends,
      recommendations,
      dailyBreakdown,
    };
  }

  /**
   * Generate inbox report for a date range
   */
  private async generateInboxReport(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<InboxReport> {
    const [received, sent, unread, categorized] = await Promise.all([
      prisma.email.count({
        where: {
          userId,
          receivedAt: { gte: startDate, lte: endDate },
        },
      }),
      prisma.email.count({
        where: {
          userId,
          labels: { has: 'SENT' },
          receivedAt: { gte: startDate, lte: endDate },
        },
      }),
      prisma.email.count({
        where: {
          userId,
          isRead: false,
          isArchived: false,
        },
      }),
      prisma.email.groupBy({
        by: ['category'],
        where: {
          userId,
          receivedAt: { gte: startDate, lte: endDate },
        },
        _count: true,
      }),
    ]);

    return {
      received,
      sent,
      unread,
      categorized: categorized.reduce((acc, item) => {
        acc[item.category || 'uncategorized'] = item._count;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  /**
   * Generate calendar report for a date range
   */
  private async generateCalendarReport(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CalendarReport> {
    const events = await prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: startDate, lte: endDate },
      },
    });

    const totalMinutes = events.reduce((sum, e) => {
      return sum + (new Date(e.endTime).getTime() - new Date(e.startTime).getTime()) / 60000;
    }, 0);

    return {
      events: events.length,
      totalMinutes: Math.round(totalMinutes),
      conflictsResolved: 0, // Would need to track this separately
      focusTimeProtected: events.filter(e => e.title.toLowerCase().includes('focus')).length,
    };
  }

  /**
   * Generate task report for a date range
   */
  private async generateTaskReport(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<TaskReport> {
    const [created, completed, overdue, byPriority] = await Promise.all([
      prisma.task.count({
        where: {
          userId,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      prisma.task.count({
        where: {
          userId,
          completedAt: { gte: startDate, lte: endDate },
        },
      }),
      prisma.task.count({
        where: {
          userId,
          status: { notIn: ['DONE'] },
          dueDate: { lt: new Date() },
        },
      }),
      prisma.task.groupBy({
        by: ['priority'],
        where: {
          userId,
          status: { notIn: ['DONE'] },
        },
        _count: true,
      }),
    ]);

    return {
      created,
      completed,
      overdue,
      byPriority: byPriority.reduce((acc, item) => {
        acc[item.priority] = item._count;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  /**
   * Generate CRM report for a date range
   */
  private async generateCRMReport(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CRMReport> {
    // Count interactions in the date range
    const interactions = await prisma.interaction.count({
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
      },
    });

    // Count new contacts
    const newContacts = await prisma.contact.count({
      where: {
        userId,
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    // Count reminders
    const [remindersCompleted, remindersPending] = await Promise.all([
      prisma.contactReminder.count({
        where: {
          contact: { userId },
          isCompleted: true,
          completedAt: { gte: startDate, lte: endDate },
        },
      }),
      prisma.contactReminder.count({
        where: {
          contact: { userId },
          isCompleted: false,
        },
      }),
    ]);

    return {
      interactions,
      newContacts,
      remindersCompleted,
      remindersPending,
    };
  }

  /**
   * Generate highlights from reports
   */
  private generateHighlights(
    inbox: InboxReport,
    calendar: CalendarReport,
    tasks: TaskReport,
    crm: CRMReport
  ): string[] {
    const highlights: string[] = [];

    if (inbox.received > 50) {
      highlights.push(`High email volume: ${inbox.received} emails received`);
    }

    if (calendar.totalMinutes > 360) {
      highlights.push(`Heavy meeting day: ${Math.round(calendar.totalMinutes / 60)} hours in meetings`);
    }

    if (tasks.completed > 5) {
      highlights.push(`Productive day: ${tasks.completed} tasks completed`);
    }

    if (tasks.overdue > 5) {
      highlights.push(`Attention needed: ${tasks.overdue} overdue tasks`);
    }

    if (crm.interactions > 10) {
      highlights.push(`Strong networking: ${crm.interactions} contact interactions`);
    }

    if (inbox.unread > 50) {
      highlights.push(`Inbox needs attention: ${inbox.unread} unread emails`);
    }

    return highlights;
  }

  /**
   * Generate action items
   */
  private async generateActionItems(
    userId: string,
    date: Date
  ): Promise<Array<{ type: string; description: string; priority: string }>> {
    const actionItems: Array<{ type: string; description: string; priority: string }> = [];

    // Check for overdue tasks
    const overdueTasks = await prisma.task.count({
      where: {
        userId,
        status: { notIn: ['DONE'] },
        dueDate: { lt: date },
      },
    });

    if (overdueTasks > 0) {
      actionItems.push({
        type: 'tasks',
        description: `Review ${overdueTasks} overdue tasks`,
        priority: 'high',
      });
    }

    // Check for overdue reminders
    const overdueReminders = await prisma.contactReminder.count({
      where: {
        contact: { userId },
        isCompleted: false,
        dueDate: { lt: date },
      },
    });

    if (overdueReminders > 0) {
      actionItems.push({
        type: 'crm',
        description: `Complete ${overdueReminders} overdue follow-ups`,
        priority: 'medium',
      });
    }

    // Check for unread important emails
    const unreadImportant = await prisma.email.count({
      where: {
        userId,
        isRead: false,
        priorityScore: { gte: 8 },
      },
    });

    if (unreadImportant > 0) {
      actionItems.push({
        type: 'inbox',
        description: `Review ${unreadImportant} important unread emails`,
        priority: 'high',
      });
    }

    return actionItems;
  }

  /**
   * Calculate trends compared to previous period
   */
  private async calculateTrends(
    userId: string,
    currentWeekStart: Date
  ): Promise<{
    emailVolume: 'increasing' | 'decreasing' | 'stable';
    meetingLoad: 'increasing' | 'decreasing' | 'stable';
    taskCompletion: 'improving' | 'declining' | 'stable';
  }> {
    const prevWeekStart = new Date(currentWeekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    const prevWeekEnd = new Date(currentWeekStart);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
    prevWeekEnd.setHours(23, 59, 59, 999);

    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
    currentWeekEnd.setHours(23, 59, 59, 999);

    // Compare email volume
    const [prevEmails, currentEmails] = await Promise.all([
      prisma.email.count({
        where: {
          userId,
          receivedAt: { gte: prevWeekStart, lte: prevWeekEnd },
        },
      }),
      prisma.email.count({
        where: {
          userId,
          receivedAt: { gte: currentWeekStart, lte: currentWeekEnd },
        },
      }),
    ]);

    // Compare meeting load
    const [prevMeetings, currentMeetings] = await Promise.all([
      prisma.calendarEvent.count({
        where: {
          userId,
          startTime: { gte: prevWeekStart, lte: prevWeekEnd },
        },
      }),
      prisma.calendarEvent.count({
        where: {
          userId,
          startTime: { gte: currentWeekStart, lte: currentWeekEnd },
        },
      }),
    ]);

    // Compare task completion
    const [prevCompleted, currentCompleted] = await Promise.all([
      prisma.task.count({
        where: {
          userId,
          completedAt: { gte: prevWeekStart, lte: prevWeekEnd },
        },
      }),
      prisma.task.count({
        where: {
          userId,
          completedAt: { gte: currentWeekStart, lte: currentWeekEnd },
        },
      }),
    ]);

    const getTrend = (prev: number, current: number, threshold: number = 0.1): 'increasing' | 'decreasing' | 'stable' => {
      if (prev === 0) return current > 0 ? 'increasing' : 'stable';
      const change = (current - prev) / prev;
      if (change > threshold) return 'increasing';
      if (change < -threshold) return 'decreasing';
      return 'stable';
    };

    return {
      emailVolume: getTrend(prevEmails, currentEmails),
      meetingLoad: getTrend(prevMeetings, currentMeetings),
      taskCompletion: currentCompleted > prevCompleted ? 'improving' :
        currentCompleted < prevCompleted ? 'declining' : 'stable',
    };
  }

  /**
   * Generate recommendations based on data
   */
  private generateRecommendations(
    summary: WeeklyReport['summary'],
    trends: WeeklyReport['trends'],
    dailyBreakdown: DailyReport[]
  ): string[] {
    const recommendations: string[] = [];

    // Meeting overload
    if (summary.totalMeetingMinutes > 20 * 60) {
      recommendations.push('Consider declining or delegating some meetings - you spent over 20 hours in meetings this week');
    }

    // Task completion declining
    if (trends.taskCompletion === 'declining') {
      recommendations.push('Task completion rate is declining - consider reviewing priorities and blocking more focus time');
    }

    // Email volume increasing
    if (trends.emailVolume === 'increasing') {
      recommendations.push('Email volume is increasing - consider setting up more automation rules or dedicated email processing times');
    }

    // Overdue tasks
    const totalOverdue = dailyBreakdown.reduce((sum, d) => Math.max(sum, d.sections.tasks.overdue), 0);
    if (totalOverdue > 10) {
      recommendations.push(`You have ${totalOverdue} overdue tasks - schedule time to clear the backlog or re-prioritize`);
    }

    // Low contact engagement
    if (summary.contactsEngaged < 5) {
      recommendations.push('Low network engagement this week - consider reaching out to key contacts');
    }

    return recommendations;
  }

  /**
   * Count travel days in a period
   */
  private async countTravelDays(userId: string, startDate: Date, endDate: Date): Promise<number> {
    const trips = await prisma.trip.findMany({
      where: {
        userId,
        OR: [
          { startDate: { gte: startDate, lte: endDate } },
          { endDate: { gte: startDate, lte: endDate } },
        ],
        status: { not: 'CANCELLED' },
      },
    });

    let travelDays = 0;
    for (const trip of trips) {
      const tripStart = new Date(Math.max(trip.startDate.getTime(), startDate.getTime()));
      const tripEnd = new Date(Math.min(trip.endDate.getTime(), endDate.getTime()));
      const days = Math.ceil((tripEnd.getTime() - tripStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      travelDays += days;
    }

    return travelDays;
  }

  /**
   * Get week start (Monday)
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Save report to weekly reports
   */
  async saveWeeklyReport(
    userId: string,
    report: WeeklyReport
  ) {
    return prisma.weeklyReport.create({
      data: {
        userId,
        weekStart: report.startDate,
        weekEnd: report.endDate,
        metrics: report.summary as object,
        highlights: report.recommendations,
        generatedAt: new Date(),
      },
    });
  }

  /**
   * Get saved weekly reports
   */
  async getSavedReports(
    userId: string,
    limit: number = 10
  ) {
    return prisma.weeklyReport.findMany({
      where: { userId },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    });
  }
}

export const reportService = new ReportServiceImpl();
export default reportService;
