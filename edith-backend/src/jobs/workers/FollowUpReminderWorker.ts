/**
 * FollowUpReminderWorker
 * Checks for and sends reminders for follow-ups and approaching deadlines
 */

import { Job } from 'bullmq';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';
import { notificationService } from '../../services/NotificationService.js';
import { BaseWorker } from './BaseWorker.js';
import type {
  FollowUpReminderJobData,
  FollowUpReminderResult,
  JobExecutionContext,
} from '../types.js';

interface Reminder {
  type: 'email' | 'contact' | 'task';
  id: string;
  title: string;
  context: string;
  dueDate?: Date;
  priority: 'low' | 'medium' | 'high';
}

export class FollowUpReminderWorker extends BaseWorker<FollowUpReminderJobData> {
  protected queueName = 'notification';
  protected jobType = 'FOLLOW_UP_REMINDER' as const;

  protected async execute(
    job: Job<FollowUpReminderJobData>,
    context: JobExecutionContext
  ): Promise<FollowUpReminderResult> {
    const { userId } = context;

    logger.info('Checking follow-up reminders', { userId, jobId: job.id });

    const reminders: Reminder[] = [];

    // Check for email follow-ups
    const emailReminders = await this.getEmailFollowUps(userId);
    reminders.push(...emailReminders);

    // Check for contact reminders
    const contactReminders = await this.getContactReminders(userId);
    reminders.push(...contactReminders);

    // Check for tasks approaching deadline
    const taskReminders = await this.getTaskDeadlines(userId);
    reminders.push(...taskReminders);

    if (reminders.length === 0) {
      logger.info('No follow-ups due', { userId });
      return {
        success: true,
        data: {
          remindersFound: 0,
          remindersSent: 0,
        },
      };
    }

    // Sort by priority and send notification
    reminders.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    await this.sendReminderNotification(userId, reminders);

    logger.info('Follow-up reminders sent', {
      userId,
      count: reminders.length,
    });

    return {
      success: true,
      data: {
        remindersFound: reminders.length,
        remindersSent: reminders.length,
        byType: {
          email: emailReminders.length,
          contact: contactReminders.length,
          task: taskReminders.length,
        },
      },
    };
  }

  /**
   * Get emails marked for follow-up that are due
   */
  private async getEmailFollowUps(userId: string): Promise<Reminder[]> {
    const now = new Date();

    // Find emails that need follow-up (e.g., sent emails without reply)
    const emails = await prisma.email.findMany({
      where: {
        userId,
        category: 'FOLLOW_UP',
        isRead: false,
        receivedAt: {
          // Older than 2 days
          lte: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        },
      },
      take: 10,
      orderBy: { receivedAt: 'asc' },
      select: {
        id: true,
        subject: true,
        fromName: true,
        fromAddress: true,
        receivedAt: true,
        priorityScore: true,
      },
    });

    return emails.map((email) => ({
      type: 'email' as const,
      id: email.id,
      title: `Reply to: ${email.subject}`,
      context: `From ${email.fromName || email.fromAddress}`,
      dueDate: email.receivedAt,
      priority: this.getPriorityFromScore(email.priorityScore),
    }));
  }

  /**
   * Get contact reminders that are due
   */
  private async getContactReminders(userId: string): Promise<Reminder[]> {
    const now = new Date();

    const reminders = await prisma.contactReminder.findMany({
      where: {
        contact: { userId },
        isCompleted: false,
        dueDate: { lte: now },
      },
      take: 10,
      orderBy: { dueDate: 'asc' },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
            importanceScore: true,
          },
        },
      },
    });

    return reminders.map((reminder) => {
      const contactName =
        `${reminder.contact.firstName || ''} ${reminder.contact.lastName || ''}`.trim() ||
        'Unknown Contact';

      return {
        type: 'contact' as const,
        id: reminder.id,
        title: reminder.message || `Follow up with ${contactName}`,
        context: reminder.contact.company || '',
        dueDate: reminder.dueDate,
        priority: this.getPriorityFromImportance(reminder.contact.importanceScore),
      };
    });
  }

  /**
   * Get tasks with approaching deadlines
   */
  private async getTaskDeadlines(userId: string): Promise<Reminder[]> {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const tasks = await prisma.task.findMany({
      where: {
        userId,
        status: { notIn: ['DONE'] },
        dueDate: {
          gte: now,
          lte: tomorrow,
        },
      },
      take: 10,
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      select: {
        id: true,
        title: true,
        priority: true,
        dueDate: true,
        source: true,
      },
    });

    return tasks.map((task) => ({
      type: 'task' as const,
      id: task.id,
      title: task.title,
      context: task.source ? `From: ${task.source}` : '',
      dueDate: task.dueDate || undefined,
      priority: this.mapTaskPriority(task.priority),
    }));
  }

  /**
   * Send consolidated reminder notification
   */
  private async sendReminderNotification(
    userId: string,
    reminders: Reminder[]
  ): Promise<void> {
    const highPriority = reminders.filter((r) => r.priority === 'high');
    const title = highPriority.length > 0
      ? `${highPriority.length} urgent follow-up${highPriority.length > 1 ? 's' : ''}`
      : `${reminders.length} follow-up reminder${reminders.length > 1 ? 's' : ''}`;

    const lines: string[] = [];

    // Group by type
    const byType = {
      email: reminders.filter((r) => r.type === 'email'),
      contact: reminders.filter((r) => r.type === 'contact'),
      task: reminders.filter((r) => r.type === 'task'),
    };

    if (byType.email.length > 0) {
      lines.push(`📧 ${byType.email.length} email${byType.email.length > 1 ? 's' : ''} need response:`);
      byType.email.slice(0, 2).forEach((r) => {
        lines.push(`  • ${r.title}`);
      });
    }

    if (byType.contact.length > 0) {
      lines.push(`👤 ${byType.contact.length} contact follow-up${byType.contact.length > 1 ? 's' : ''}:`);
      byType.contact.slice(0, 2).forEach((r) => {
        lines.push(`  • ${r.title}`);
      });
    }

    if (byType.task.length > 0) {
      lines.push(`✅ ${byType.task.length} task${byType.task.length > 1 ? 's' : ''} due soon:`);
      byType.task.slice(0, 2).forEach((r) => {
        lines.push(`  • ${r.title}`);
      });
    }

    await notificationService.send({
      userId,
      type: 'FOLLOW_UP_REMINDER',
      title,
      body: lines.join('\n'),
      data: {
        totalReminders: reminders.length,
        highPriorityCount: highPriority.length,
        reminders: reminders.slice(0, 10).map((r) => ({
          type: r.type,
          id: r.id,
          title: r.title,
          priority: r.priority,
        })),
      },
      priority: highPriority.length > 0 ? 'HIGH' : 'NORMAL',
    });
  }

  /**
   * Convert email priority score to reminder priority
   */
  private getPriorityFromScore(score: number | null): 'low' | 'medium' | 'high' {
    if (!score) return 'medium';
    if (score >= 8) return 'high';
    if (score >= 5) return 'medium';
    return 'low';
  }

  /**
   * Convert contact importance to reminder priority
   */
  private getPriorityFromImportance(
    importance: number | null
  ): 'low' | 'medium' | 'high' {
    if (!importance) return 'medium';
    if (importance >= 80) return 'high';
    if (importance >= 50) return 'medium';
    return 'low';
  }

  /**
   * Map task priority to reminder priority
   */
  private mapTaskPriority(priority: string): 'low' | 'medium' | 'high' {
    switch (priority) {
      case 'URGENT':
      case 'HIGH':
        return 'high';
      case 'MEDIUM':
        return 'medium';
      default:
        return 'low';
    }
  }

  protected async updateMetrics(
    context: JobExecutionContext,
    result: FollowUpReminderResult
  ): Promise<void> {
    // Follow-up reminders don't directly update success metrics
  }
}

export const followUpReminderWorker = new FollowUpReminderWorker();
