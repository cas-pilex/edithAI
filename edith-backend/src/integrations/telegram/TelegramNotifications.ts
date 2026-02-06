/**
 * TelegramNotifications
 * Outbound notification service for Telegram
 */

import { Markup } from 'telegraf';
import { telegramBot } from './TelegramBot.js';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface DailyBriefingData {
  events: Array<{
    time: string;
    title: string;
    location?: string;
    meetingUrl?: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    priority: string;
    dueDate?: string;
  }>;
  emails: {
    unread: number;
    important: number;
    topSenders: string[];
  };
  weather?: {
    temp: number;
    condition: string;
    location: string;
  };
}

export interface EmailAlertData {
  from: string;
  subject: string;
  snippet: string;
  isImportant: boolean;
  messageId: string;
}

export interface MeetingReminderData {
  title: string;
  startTime: Date;
  location?: string;
  meetingUrl?: string;
  attendees: string[];
  minutesBefore: number;
}

export interface ApprovalRequestData {
  id: string;
  type: string;
  title: string;
  description: string;
  requestedBy: string;
  deadline?: Date;
}

export interface TaskReminderData {
  id: string;
  title: string;
  dueDate: Date;
  priority: string;
  project?: string;
}

// ============================================================================
// TelegramNotifications Class
// ============================================================================

class TelegramNotificationsImpl {
  /**
   * Send daily briefing
   */
  async sendDailyBriefing(userId: string, data: DailyBriefingData): Promise<boolean> {
    try {
      let message = `☀️ *Good morning!*\n\n`;

      // Weather (if available)
      if (data.weather) {
        message += `🌡️ ${data.weather.temp}°C, ${data.weather.condition} in ${data.weather.location}\n\n`;
      }

      // Calendar section
      message += `📅 *Today's Schedule*\n`;
      if (data.events.length === 0) {
        message += `No meetings today - enjoy the focus time!\n`;
      } else {
        for (const event of data.events.slice(0, 5)) {
          message += `• *${event.time}* - ${this.escapeMarkdown(event.title)}`;
          if (event.meetingUrl) message += ` 🔗`;
          message += `\n`;
        }
        if (data.events.length > 5) {
          message += `_...and ${data.events.length - 5} more meetings_\n`;
        }
      }
      message += `\n`;

      // Tasks section
      message += `✅ *Tasks Due Today* (${data.tasks.length})\n`;
      if (data.tasks.length === 0) {
        message += `No tasks due today!\n`;
      } else {
        const highPriority = data.tasks.filter(t => t.priority === 'HIGH');
        if (highPriority.length > 0) {
          message += `🔴 ${highPriority.length} high priority\n`;
        }
        for (const task of data.tasks.slice(0, 3)) {
          message += `• ${this.escapeMarkdown(task.title)}\n`;
        }
        if (data.tasks.length > 3) {
          message += `_...and ${data.tasks.length - 3} more_\n`;
        }
      }
      message += `\n`;

      // Email section
      message += `📧 *Inbox*\n`;
      message += `${data.emails.unread} unread`;
      if (data.emails.important > 0) {
        message += ` (${data.emails.important} important ⭐)`;
      }
      message += `\n`;

      return await telegramBot.sendMessage(userId, message, {
        parseMode: 'Markdown',
        replyMarkup: Markup.inlineKeyboard([
          [
            Markup.button.callback('📧 Inbox', 'view_inbox'),
            Markup.button.callback('📅 Schedule', 'view_schedule'),
          ],
          [
            Markup.button.callback('✅ Tasks', 'view_tasks'),
          ],
        ]).reply_markup,
      });
    } catch (error) {
      logger.error('Failed to send daily briefing', { userId, error });
      return false;
    }
  }

  /**
   * Send email alert for important messages
   */
  async sendEmailAlert(userId: string, data: EmailAlertData): Promise<boolean> {
    try {
      const importantIcon = data.isImportant ? '⭐ ' : '';
      const message =
        `${importantIcon}📧 *New Email*\n\n` +
        `*From:* ${this.escapeMarkdown(data.from)}\n` +
        `*Subject:* ${this.escapeMarkdown(data.subject)}\n\n` +
        `_${this.escapeMarkdown(data.snippet.substring(0, 200))}${data.snippet.length > 200 ? '...' : ''}_`;

      return await telegramBot.sendMessage(userId, message, {
        parseMode: 'Markdown',
        replyMarkup: Markup.inlineKeyboard([
          [
            Markup.button.callback('📖 Read', `email_read_${data.messageId}`),
            Markup.button.callback('📁 Archive', `email_archive_${data.messageId}`),
          ],
          [
            Markup.button.callback('↩️ Reply', `email_reply_${data.messageId}`),
          ],
        ]).reply_markup,
      });
    } catch (error) {
      logger.error('Failed to send email alert', { userId, error });
      return false;
    }
  }

  /**
   * Send meeting reminder
   */
  async sendMeetingReminder(userId: string, data: MeetingReminderData): Promise<boolean> {
    try {
      const timeUntil = data.minutesBefore === 1 ? '1 minute' :
                        data.minutesBefore < 60 ? `${data.minutesBefore} minutes` :
                        `${Math.round(data.minutesBefore / 60)} hour(s)`;

      let message =
        `🔔 *Meeting in ${timeUntil}*\n\n` +
        `*${this.escapeMarkdown(data.title)}*\n` +
        `⏰ ${this.formatTime(data.startTime)}\n`;

      if (data.location) {
        message += `📍 ${this.escapeMarkdown(data.location)}\n`;
      }

      if (data.attendees.length > 0) {
        message += `👥 ${data.attendees.slice(0, 3).join(', ')}`;
        if (data.attendees.length > 3) {
          message += ` +${data.attendees.length - 3} others`;
        }
        message += `\n`;
      }

      const buttons = [];
      if (data.meetingUrl) {
        buttons.push([Markup.button.url('🔗 Join Meeting', data.meetingUrl)]);
      }
      buttons.push([
        Markup.button.callback('⏰ Snooze 5m', `snooze_5_${data.title}`),
        Markup.button.callback('✓ Dismiss', `dismiss_reminder`),
      ]);

      return await telegramBot.sendMessage(userId, message, {
        parseMode: 'Markdown',
        replyMarkup: Markup.inlineKeyboard(buttons).reply_markup,
      });
    } catch (error) {
      logger.error('Failed to send meeting reminder', { userId, error });
      return false;
    }
  }

  /**
   * Send approval request notification
   */
  async sendApprovalRequest(userId: string, data: ApprovalRequestData): Promise<boolean> {
    try {
      let message =
        `🔔 *Approval Required*\n\n` +
        `*${this.escapeMarkdown(data.title)}*\n` +
        `Type: ${data.type}\n` +
        `Requested by: ${this.escapeMarkdown(data.requestedBy)}\n\n` +
        `${this.escapeMarkdown(data.description)}`;

      if (data.deadline) {
        message += `\n\n⏰ Deadline: ${this.formatDate(data.deadline)}`;
      }

      return await telegramBot.sendMessage(userId, message, {
        parseMode: 'Markdown',
        replyMarkup: Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Approve', `approve_${data.id}`),
            Markup.button.callback('❌ Reject', `reject_${data.id}`),
          ],
          [
            Markup.button.callback('📝 Review Details', `review_${data.id}`),
          ],
        ]).reply_markup,
      });
    } catch (error) {
      logger.error('Failed to send approval request', { userId, error });
      return false;
    }
  }

  /**
   * Send task reminder
   */
  async sendTaskReminder(userId: string, data: TaskReminderData): Promise<boolean> {
    try {
      const priorityIcon = data.priority === 'HIGH' ? '🔴' : data.priority === 'MEDIUM' ? '🟡' : '🟢';

      let message =
        `${priorityIcon} *Task Reminder*\n\n` +
        `*${this.escapeMarkdown(data.title)}*\n` +
        `📅 Due: ${this.formatDate(data.dueDate)}`;

      if (data.project) {
        message += `\n📁 ${this.escapeMarkdown(data.project)}`;
      }

      return await telegramBot.sendMessage(userId, message, {
        parseMode: 'Markdown',
        replyMarkup: Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Complete', `task_complete_${data.id}`),
            Markup.button.callback('⏰ Snooze', `task_snooze_${data.id}`),
          ],
          [
            Markup.button.callback('📝 Edit', `task_edit_${data.id}`),
          ],
        ]).reply_markup,
      });
    } catch (error) {
      logger.error('Failed to send task reminder', { userId, error });
      return false;
    }
  }

  /**
   * Send a generic notification
   */
  async sendNotification(userId: string, title: string, body: string, buttons?: Array<{
    text: string;
    callbackData?: string;
    url?: string;
  }>): Promise<boolean> {
    try {
      const message = `🔔 *${this.escapeMarkdown(title)}*\n\n${this.escapeMarkdown(body)}`;

      let replyMarkup: ReturnType<typeof Markup.inlineKeyboard>['reply_markup'] | undefined;

      if (buttons && buttons.length > 0) {
        const inlineButtons = buttons.map(btn => {
          if (btn.url) {
            return [Markup.button.url(btn.text, btn.url)];
          }
          return [Markup.button.callback(btn.text, btn.callbackData || btn.text)];
        });
        replyMarkup = Markup.inlineKeyboard(inlineButtons).reply_markup;
      }

      return await telegramBot.sendMessage(userId, message, {
        parseMode: 'Markdown',
        replyMarkup,
      });
    } catch (error) {
      logger.error('Failed to send notification', { userId, error });
      return false;
    }
  }

  /**
   * Send daily briefings to all users who have it enabled
   */
  async sendScheduledBriefings(): Promise<void> {
    try {
      // Get all users with Telegram integration and daily briefing enabled
      const users = await prisma.userIntegration.findMany({
        where: {
          provider: 'TELEGRAM',
          isActive: true,
          // Check for briefing enabled in metadata
        },
        include: {
          user: {
            select: {
              id: true,
              preferences: true,
            },
          },
        },
      });

      logger.info('Sending scheduled briefings', { userCount: users.length });

      for (const integration of users) {
        try {
          // Check if user has briefings enabled and it's the right time
          const preferences = integration.user.preferences as Record<string, unknown> | null;
          const briefingEnabled = preferences?.dailyBriefingEnabled !== false;

          if (!briefingEnabled) continue;

          // Generate briefing data for user
          const briefingData = await this.generateBriefingData(integration.user.id);

          // Send briefing
          await this.sendDailyBriefing(integration.user.id, briefingData);

          logger.debug('Daily briefing sent', { userId: integration.user.id });
        } catch (error) {
          logger.error('Failed to send briefing to user', {
            userId: integration.user.id,
            error,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to send scheduled briefings', { error });
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private escapeMarkdown(text: string): string {
    // Escape Markdown special characters
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  private formatDate(date: Date): string {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    if (isToday) {
      return `Today at ${this.formatTime(date)}`;
    }
    if (isTomorrow) {
      return `Tomorrow at ${this.formatTime(date)}`;
    }

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private async generateBriefingData(userId: string): Promise<DailyBriefingData> {
    // In full implementation, fetch real data from services
    // For now, return placeholder data

    return {
      events: [],
      tasks: [],
      emails: {
        unread: 0,
        important: 0,
        topSenders: [],
      },
    };
  }
}

export const telegramNotifications = new TelegramNotificationsImpl();
export default telegramNotifications;
