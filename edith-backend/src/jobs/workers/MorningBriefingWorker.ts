/**
 * MorningBriefingWorker
 * Generates and sends daily morning briefing to users
 * Uses Claude AI to analyze unread emails and create a structured daily summary
 */

import { Job } from 'bullmq';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';
import { notificationService } from '../../services/NotificationService.js';
import { calendarService } from '../../services/CalendarService.js';
import { taskService } from '../../services/TaskService.js';
import { inboxService } from '../../services/InboxService.js';
import { crmService } from '../../services/CRMService.js';
import { travelService } from '../../services/TravelService.js';
import { aiService } from '../../services/AIService.js';
import type { DailyBriefing } from '../../services/AIService.js';
import { BaseWorker } from './BaseWorker.js';
import type {
  MorningBriefingJobData,
  MorningBriefingResult,
  JobExecutionContext,
  DailyBriefingData,
} from '../types.js';

// Type definitions for service responses
interface CalendarEvent {
  startTime: string | Date;
  title: string;
  location?: string | null;
  meetingUrl?: string | null;
}

interface Task {
  id: string;
  title: string;
  priority: string;
  dueDate?: Date | null;
}

interface Trip {
  name: string;
  startDate: Date;
}

export class MorningBriefingWorker extends BaseWorker<MorningBriefingJobData> {
  protected queueName = 'report';
  protected jobType = 'MORNING_BRIEFING' as const;

  protected async execute(
    job: Job<MorningBriefingJobData>,
    context: JobExecutionContext
  ): Promise<MorningBriefingResult> {
    const { userId, userTimezone } = context;

    logger.info('Generating morning briefing', { userId, jobId: job.id });

    // Get today's date boundaries in user's timezone
    const startOfDay = this.getStartOfDayInTimezone(userTimezone);
    const endOfDay = this.getEndOfDayInTimezone(userTimezone);

    // Gather all briefing data in parallel (including AI email analysis)
    const [events, tasks, emailStats, crmReminders, upcomingTrips, aiBriefing] = await Promise.all([
      this.getTodaysEvents(userId, startOfDay, endOfDay, userTimezone),
      this.getTodaysTasks(userId, endOfDay),
      this.getEmailStats(userId),
      this.getCRMReminders(userId),
      this.getUpcomingTrips(userId),
      this.generateAIBriefing(userId),
    ]);

    // Build briefing data
    const briefingData: DailyBriefingData = {
      events,
      tasks,
      emails: emailStats,
      crmReminders,
      travelReminders: upcomingTrips,
    };

    // Generate briefing message (enhanced with AI if available)
    const { title, body } = this.formatBriefing(briefingData, userTimezone, aiBriefing);

    // Store AI briefing as a notification with structured data
    const notificationData: Record<string, unknown> = {
      ...briefingData as unknown as Record<string, unknown>,
    };
    if (aiBriefing) {
      notificationData.aiBriefing = aiBriefing;
    }

    await notificationService.send({
      userId,
      type: 'DAILY_BRIEFING',
      title,
      body,
      data: notificationData,
      priority: 'NORMAL',
    });

    // Extract tasks from AI briefing and create them
    let extractedTaskCount = 0;
    if (aiBriefing?.extractedTasks?.length) {
      extractedTaskCount = await this.createExtractedTasks(userId, aiBriefing.extractedTasks);
    }

    logger.info('Morning briefing sent', {
      userId,
      eventsCount: events.length,
      tasksCount: tasks.length,
      urgentEmailsCount: emailStats.important,
      aiBriefing: !!aiBriefing,
      extractedTasks: extractedTaskCount,
    });

    return {
      success: true,
      data: {
        eventsCount: events.length,
        tasksCount: tasks.length,
        urgentEmailsCount: aiBriefing?.urgentItems?.length || emailStats.important,
        notificationSent: true,
      },
    };
  }

  /**
   * Generate AI-powered email briefing from unread INBOX emails
   */
  private async generateAIBriefing(userId: string): Promise<DailyBriefing | null> {
    if (!aiService.isConfigured) {
      logger.info('AI service not configured, skipping AI briefing');
      return null;
    }

    try {
      // Fetch unread INBOX emails (not SENT)
      const unreadEmails = await prisma.email.findMany({
        where: {
          userId,
          isRead: false,
          isArchived: false,
          labels: { has: 'INBOX' },
        },
        orderBy: { receivedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          fromAddress: true,
          fromName: true,
          subject: true,
          snippet: true,
          bodyText: true,
          receivedAt: true,
          labels: true,
        },
      });

      if (unreadEmails.length === 0) {
        logger.info('No unread emails for AI briefing', { userId });
        return null;
      }

      logger.info('Generating AI briefing', { userId, emailCount: unreadEmails.length });

      const briefing = await aiService.generateDailyBriefing(unreadEmails);
      return briefing;
    } catch (error) {
      logger.error('Failed to generate AI briefing', { userId, error: (error as Error).message });
      return null;
    }
  }

  /**
   * Create tasks extracted by AI from emails
   */
  private async createExtractedTasks(
    userId: string,
    tasks: DailyBriefing['extractedTasks']
  ): Promise<number> {
    let created = 0;

    for (const task of tasks.slice(0, 10)) {
      try {
        await prisma.task.create({
          data: {
            userId,
            title: task.title,
            priority: task.priority,
            status: 'TODO',
            source: 'EMAIL',
            sourceId: task.emailId,
            dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
          },
        });
        created++;
      } catch (error) {
        logger.error('Failed to create extracted task', {
          userId,
          task: task.title,
          error: (error as Error).message,
        });
      }
    }

    if (created > 0) {
      logger.info('Created tasks from AI briefing', { userId, count: created });
    }

    return created;
  }

  /**
   * Get today's calendar events
   */
  private async getTodaysEvents(
    userId: string,
    startOfDay: Date,
    endOfDay: Date,
    timezone: string
  ): Promise<DailyBriefingData['events']> {
    try {
      const result = await calendarService.getEvents(userId, {
        startDate: startOfDay,
        endDate: endOfDay,
      });

      return (result.events as CalendarEvent[]).map((event) => ({
        time: new Date(event.startTime).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: timezone,
        }),
        title: event.title,
        location: event.location || undefined,
        meetingUrl: event.meetingUrl || undefined,
      }));
    } catch (error) {
      logger.error('Failed to get events for briefing', { userId, error });
      return [];
    }
  }

  /**
   * Get tasks due today
   */
  private async getTodaysTasks(
    userId: string,
    endOfDay: Date
  ): Promise<DailyBriefingData['tasks']> {
    try {
      const result = await taskService.getTasks(userId, {
        status: 'TODO',
        dueBefore: endOfDay,
      });

      return (result.tasks as Task[]).map((task) => ({
        id: task.id,
        title: task.title,
        priority: task.priority,
        dueDate: task.dueDate?.toISOString(),
      }));
    } catch (error) {
      logger.error('Failed to get tasks for briefing', { userId, error });
      return [];
    }
  }

  /**
   * Get email statistics
   */
  private async getEmailStats(
    userId: string
  ): Promise<DailyBriefingData['emails']> {
    try {
      const stats = await inboxService.getStats(userId);
      return {
        unread: stats.unread,
        important: stats.byCategory['URGENT'] || 0,
        topSenders: [], // Would need additional query
      };
    } catch (error) {
      logger.error('Failed to get email stats for briefing', { userId, error });
      return { unread: 0, important: 0, topSenders: [] };
    }
  }

  /**
   * Get CRM reminders (birthdays, follow-ups due today)
   */
  private async getCRMReminders(
    userId: string
  ): Promise<DailyBriefingData['crmReminders']> {
    try {
      const reminders: DailyBriefingData['crmReminders'] = [];

      // Get birthdays today
      const today = new Date();
      const contacts = await prisma.contact.findMany({
        where: { userId },
        select: { id: true, firstName: true, lastName: true, birthday: true },
      });

      for (const contact of contacts) {
        if (contact.birthday) {
          const birthday = new Date(contact.birthday);
          if (
            birthday.getMonth() === today.getMonth() &&
            birthday.getDate() === today.getDate()
          ) {
            reminders.push({
              type: 'BIRTHDAY',
              contactName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
              message: 'Birthday today!',
            });
          }
        }
      }

      // Get follow-ups due today
      const followUps = await crmService.getOverdueFollowUps(userId);
      for (const followUp of followUps.slice(0, 5)) {
        const reminder = followUp.reminders[0];
        reminders.push({
          type: 'FOLLOW_UP',
          contactName: followUp.contact.name,
          message: reminder?.message || 'Follow-up due',
        });
      }

      return reminders;
    } catch (error) {
      logger.error('Failed to get CRM reminders for briefing', { userId, error });
      return [];
    }
  }

  /**
   * Get upcoming trips in the next 7 days
   */
  private async getUpcomingTrips(
    userId: string
  ): Promise<DailyBriefingData['travelReminders']> {
    try {
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const trips = await travelService.getTrips(userId, {
        status: 'BOOKED',
        startDate: now,
        endDate: sevenDaysFromNow,
      });

      return (trips.trips as Trip[]).map((trip) => {
        const startDate = new Date(trip.startDate);
        const daysUntil = Math.ceil(
          (startDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );

        return {
          tripName: trip.name,
          startDate: trip.startDate.toISOString(),
          daysUntil,
        };
      });
    } catch (error) {
      logger.error('Failed to get travel reminders for briefing', { userId, error });
      return [];
    }
  }

  /**
   * Format briefing into notification message (enhanced with AI analysis)
   */
  private formatBriefing(
    data: DailyBriefingData,
    timezone: string,
    aiBriefing?: DailyBriefing | null
  ): { title: string; body: string } {
    const now = this.getUserLocalTime(timezone);
    const hour = now.getHours();
    let greeting = 'Good morning';
    if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    if (hour >= 17) greeting = 'Good evening';

    const title = `${greeting}! Here's your briefing`;

    const lines: string[] = [];

    // AI Summary (if available)
    if (aiBriefing?.summary) {
      lines.push(aiBriefing.summary);
      lines.push('');
    }

    // Calendar
    if (data.events.length > 0) {
      lines.push(`${data.events.length} meeting${data.events.length > 1 ? 's' : ''} today`);
      data.events.slice(0, 3).forEach((event) => {
        lines.push(`  - ${event.time} - ${event.title}`);
      });
      if (data.events.length > 3) {
        lines.push(`  ... and ${data.events.length - 3} more`);
      }
    } else {
      lines.push('No meetings today');
    }

    // AI Urgent items
    if (aiBriefing?.urgentItems?.length) {
      lines.push('');
      lines.push(`${aiBriefing.urgentItems.length} urgent email${aiBriefing.urgentItems.length > 1 ? 's' : ''}:`);
      aiBriefing.urgentItems.slice(0, 3).forEach((item) => {
        lines.push(`  - ${item.subject}: ${item.reason}`);
      });
    }

    // AI Questions to answer
    if (aiBriefing?.questionsToAnswer?.length) {
      lines.push('');
      lines.push(`${aiBriefing.questionsToAnswer.length} question${aiBriefing.questionsToAnswer.length > 1 ? 's' : ''} to answer:`);
      aiBriefing.questionsToAnswer.slice(0, 3).forEach((q) => {
        lines.push(`  - ${q.from}: ${q.question}`);
      });
    }

    // Tasks
    if (data.tasks.length > 0) {
      lines.push('');
      const urgent = data.tasks.filter((t) => t.priority === 'URGENT' || t.priority === 'HIGH');
      lines.push(`${data.tasks.length} task${data.tasks.length > 1 ? 's' : ''} due today`);
      if (urgent.length > 0) {
        lines.push(`  ${urgent.length} high priority`);
      }
    }

    // Emails (fallback stats if no AI)
    if (!aiBriefing && data.emails.unread > 0) {
      lines.push('');
      lines.push(`${data.emails.unread} unread email${data.emails.unread > 1 ? 's' : ''}`);
      if (data.emails.important > 0) {
        lines.push(`  ${data.emails.important} important`);
      }
    }

    // CRM Reminders
    if (data.crmReminders && data.crmReminders.length > 0) {
      const birthdays = data.crmReminders.filter((r) => r.type === 'BIRTHDAY');
      if (birthdays.length > 0) {
        lines.push('');
        lines.push(`Birthday: ${birthdays.map((b) => b.contactName).join(', ')}`);
      }
    }

    // Travel
    if (data.travelReminders && data.travelReminders.length > 0) {
      const trip = data.travelReminders[0];
      lines.push('');
      lines.push(`${trip.tripName} in ${trip.daysUntil} day${trip.daysUntil > 1 ? 's' : ''}`);
    }

    return {
      title,
      body: lines.join('\n'),
    };
  }

  protected async updateMetrics(context: JobExecutionContext): Promise<void> {
    // Morning briefing generation doesn't directly update success metrics
    // Could track briefings sent if needed
  }
}

export const morningBriefingWorker = new MorningBriefingWorker();
