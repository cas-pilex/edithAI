/**
 * WhatsAppNotifications
 * Outbound notification service for WhatsApp
 */

import { getWhatsAppClientForUser, type IWhatsAppClient } from './WhatsAppClient.js';
import { TEMPLATES, WhatsAppTemplatesHelper } from './WhatsAppTemplates.js';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface DailyBriefingData {
  name: string;
  date: Date;
  eventCount: number;
  taskCount: number;
  emailCount: number;
}

export interface MeetingReminderData {
  title: string;
  time: Date;
  location?: string;
  attendees: string[];
  meetingUrl?: string;
}

export interface EmailAlertData {
  from: string;
  subject: string;
  snippet: string;
  isImportant: boolean;
}

export interface ApprovalRequestData {
  id: string;
  type: string;
  title: string;
  requestedBy: string;
  deadline?: Date;
}

export interface TaskReminderData {
  id: string;
  title: string;
  dueDate: Date;
  priority: string;
}

export interface FlightUpdateData {
  flightNumber: string;
  status: string;
  departureTime: Date;
  gate?: string;
}

// ============================================================================
// WhatsAppNotifications Class
// ============================================================================

class WhatsAppNotificationsImpl {
  /**
   * Send daily briefing notification
   */
  async sendDailyBriefing(userId: string, data: DailyBriefingData): Promise<boolean> {
    const client = await this.getClientAndPhone(userId);
    if (!client) return false;

    try {
      // Check if we can send freeform (within 24h window)
      const canFreeform = await client.client.canSendFreeform(client.phoneNumber);

      if (canFreeform) {
        // Send rich freeform message
        const message = this.formatDailyBriefing(data);
        await client.client.sendMessage(client.phoneNumber, message);
      } else {
        // Use template
        const variables = WhatsAppTemplatesHelper.buildDailyBriefingVariables(data);
        const formatted = WhatsAppTemplatesHelper.formatVariablesForTwilio(
          TEMPLATES.DAILY_BRIEFING,
          variables
        );
        await client.client.sendTemplate(
          client.phoneNumber,
          TEMPLATES.DAILY_BRIEFING.sid,
          formatted
        );
      }

      logger.info('Daily briefing sent via WhatsApp', { userId });
      return true;
    } catch (error) {
      logger.error('Failed to send daily briefing', { userId, error });
      return false;
    }
  }

  /**
   * Send meeting reminder notification
   */
  async sendMeetingReminder(userId: string, data: MeetingReminderData): Promise<boolean> {
    const client = await this.getClientAndPhone(userId);
    if (!client) return false;

    try {
      const canFreeform = await client.client.canSendFreeform(client.phoneNumber);

      if (canFreeform) {
        const message = this.formatMeetingReminder(data);
        await client.client.sendMessage(client.phoneNumber, message);
      } else {
        const variables = WhatsAppTemplatesHelper.buildMeetingReminderVariables(data);
        const formatted = WhatsAppTemplatesHelper.formatVariablesForTwilio(
          TEMPLATES.MEETING_REMINDER,
          variables
        );
        await client.client.sendTemplate(
          client.phoneNumber,
          TEMPLATES.MEETING_REMINDER.sid,
          formatted
        );
      }

      logger.info('Meeting reminder sent via WhatsApp', { userId, meeting: data.title });
      return true;
    } catch (error) {
      logger.error('Failed to send meeting reminder', { userId, error });
      return false;
    }
  }

  /**
   * Send email alert notification
   */
  async sendEmailAlert(userId: string, data: EmailAlertData): Promise<boolean> {
    const client = await this.getClientAndPhone(userId);
    if (!client) return false;

    try {
      const canFreeform = await client.client.canSendFreeform(client.phoneNumber);

      if (canFreeform) {
        const message = this.formatEmailAlert(data);
        await client.client.sendMessage(client.phoneNumber, message);
      } else {
        const variables = WhatsAppTemplatesHelper.buildEmailAlertVariables(data);
        const formatted = WhatsAppTemplatesHelper.formatVariablesForTwilio(
          TEMPLATES.EMAIL_ALERT,
          variables
        );
        await client.client.sendTemplate(
          client.phoneNumber,
          TEMPLATES.EMAIL_ALERT.sid,
          formatted
        );
      }

      logger.info('Email alert sent via WhatsApp', { userId, from: data.from });
      return true;
    } catch (error) {
      logger.error('Failed to send email alert', { userId, error });
      return false;
    }
  }

  /**
   * Send approval request notification
   */
  async sendApprovalRequest(userId: string, data: ApprovalRequestData): Promise<boolean> {
    const client = await this.getClientAndPhone(userId);
    if (!client) return false;

    try {
      const canFreeform = await client.client.canSendFreeform(client.phoneNumber);

      if (canFreeform) {
        const message = this.formatApprovalRequest(data);
        await client.client.sendMessage(client.phoneNumber, message);
      } else {
        const variables = WhatsAppTemplatesHelper.buildApprovalRequestVariables(data);
        const formatted = WhatsAppTemplatesHelper.formatVariablesForTwilio(
          TEMPLATES.APPROVAL_REQUEST,
          variables
        );
        await client.client.sendTemplate(
          client.phoneNumber,
          TEMPLATES.APPROVAL_REQUEST.sid,
          formatted
        );
      }

      logger.info('Approval request sent via WhatsApp', { userId, approval: data.id });
      return true;
    } catch (error) {
      logger.error('Failed to send approval request', { userId, error });
      return false;
    }
  }

  /**
   * Send task reminder notification
   */
  async sendTaskReminder(userId: string, data: TaskReminderData): Promise<boolean> {
    const client = await this.getClientAndPhone(userId);
    if (!client) return false;

    try {
      const canFreeform = await client.client.canSendFreeform(client.phoneNumber);

      if (canFreeform) {
        const message = this.formatTaskReminder(data);
        await client.client.sendMessage(client.phoneNumber, message);
      } else {
        const variables = WhatsAppTemplatesHelper.buildTaskReminderVariables(data);
        const formatted = WhatsAppTemplatesHelper.formatVariablesForTwilio(
          TEMPLATES.TASK_REMINDER,
          variables
        );
        await client.client.sendTemplate(
          client.phoneNumber,
          TEMPLATES.TASK_REMINDER.sid,
          formatted
        );
      }

      logger.info('Task reminder sent via WhatsApp', { userId, task: data.id });
      return true;
    } catch (error) {
      logger.error('Failed to send task reminder', { userId, error });
      return false;
    }
  }

  /**
   * Send flight update notification
   */
  async sendFlightUpdate(userId: string, data: FlightUpdateData): Promise<boolean> {
    const client = await this.getClientAndPhone(userId);
    if (!client) return false;

    try {
      const canFreeform = await client.client.canSendFreeform(client.phoneNumber);

      if (canFreeform) {
        const message = this.formatFlightUpdate(data);
        await client.client.sendMessage(client.phoneNumber, message);
      } else {
        const variables = WhatsAppTemplatesHelper.buildFlightUpdateVariables(data);
        const formatted = WhatsAppTemplatesHelper.formatVariablesForTwilio(
          TEMPLATES.FLIGHT_UPDATE,
          variables
        );
        await client.client.sendTemplate(
          client.phoneNumber,
          TEMPLATES.FLIGHT_UPDATE.sid,
          formatted
        );
      }

      logger.info('Flight update sent via WhatsApp', { userId, flight: data.flightNumber });
      return true;
    } catch (error) {
      logger.error('Failed to send flight update', { userId, error });
      return false;
    }
  }

  /**
   * Send welcome message to new user
   */
  async sendWelcomeMessage(userId: string, name: string): Promise<boolean> {
    const client = await this.getClientAndPhone(userId);
    if (!client) return false;

    try {
      const variables = WhatsAppTemplatesHelper.buildWelcomeVariables({ name });
      const formatted = WhatsAppTemplatesHelper.formatVariablesForTwilio(
        TEMPLATES.WELCOME,
        variables
      );

      await client.client.sendTemplate(
        client.phoneNumber,
        TEMPLATES.WELCOME.sid,
        formatted
      );

      logger.info('Welcome message sent via WhatsApp', { userId });
      return true;
    } catch (error) {
      logger.error('Failed to send welcome message', { userId, error });
      return false;
    }
  }

  /**
   * Send verification code
   */
  async sendVerificationCode(phoneNumber: string, code: string): Promise<boolean> {
    try {
      // This is a special case - we don't have a userId yet
      const { createWhatsAppClient } = await import('./WhatsAppClient.js');
      const client = createWhatsAppClient('system');

      const variables = WhatsAppTemplatesHelper.buildVerificationCodeVariables({ code });
      const formatted = WhatsAppTemplatesHelper.formatVariablesForTwilio(
        TEMPLATES.VERIFICATION_CODE,
        variables
      );

      await client.sendTemplate(phoneNumber, TEMPLATES.VERIFICATION_CODE.sid, formatted);

      logger.info('Verification code sent via WhatsApp', { phoneNumber: phoneNumber.substring(0, 5) + '***' });
      return true;
    } catch (error) {
      logger.error('Failed to send verification code', { error });
      return false;
    }
  }

  // ============================================================================
  // Message Formatters (for freeform messages)
  // ============================================================================

  private formatDailyBriefing(data: DailyBriefingData): string {
    const dateStr = data.date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    return (
      `☀️ *Good morning, ${data.name}!*\n\n` +
      `📅 ${dateStr}\n\n` +
      `Here's your day at a glance:\n` +
      `• ${data.eventCount} meetings scheduled\n` +
      `• ${data.taskCount} tasks due\n` +
      `• ${data.emailCount} unread emails\n\n` +
      `Reply with "today" for details or "help" for more options.`
    );
  }

  private formatMeetingReminder(data: MeetingReminderData): string {
    const timeStr = data.time.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    let message =
      `🔔 *Meeting Reminder*\n\n` +
      `*${data.title}*\n` +
      `⏰ ${timeStr}\n`;

    if (data.location) {
      message += `📍 ${data.location}\n`;
    }

    if (data.attendees.length > 0) {
      const attendeeStr = data.attendees.slice(0, 3).join(', ');
      message += `👥 ${attendeeStr}`;
      if (data.attendees.length > 3) {
        message += ` +${data.attendees.length - 3} others`;
      }
      message += '\n';
    }

    if (data.meetingUrl) {
      message += `\n🔗 Join: ${data.meetingUrl}`;
    }

    return message;
  }

  private formatEmailAlert(data: EmailAlertData): string {
    const importantIcon = data.isImportant ? '⭐ ' : '';

    return (
      `${importantIcon}📧 *New Email*\n\n` +
      `*From:* ${data.from}\n` +
      `*Subject:* ${data.subject}\n\n` +
      `${data.snippet.substring(0, 200)}${data.snippet.length > 200 ? '...' : ''}\n\n` +
      `Reply "read" to see full email or "archive" to archive it.`
    );
  }

  private formatApprovalRequest(data: ApprovalRequestData): string {
    let message =
      `🔔 *Approval Required*\n\n` +
      `*${data.title}*\n` +
      `Type: ${data.type}\n` +
      `From: ${data.requestedBy}\n`;

    if (data.deadline) {
      message += `⏰ Deadline: ${data.deadline.toLocaleDateString('en-US')}\n`;
    }

    message += `\nReply "approve" or "reject"`;

    return message;
  }

  private formatTaskReminder(data: TaskReminderData): string {
    const priorityIcon =
      data.priority === 'HIGH' ? '🔴' :
      data.priority === 'MEDIUM' ? '🟡' : '🟢';

    return (
      `${priorityIcon} *Task Reminder*\n\n` +
      `*${data.title}*\n` +
      `📅 Due: ${data.dueDate.toLocaleDateString('en-US')}\n` +
      `Priority: ${data.priority}\n\n` +
      `Reply "done" to mark complete or "snooze" for later.`
    );
  }

  private formatFlightUpdate(data: FlightUpdateData): string {
    const timeStr = data.departureTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      `✈️ *Flight Update*\n\n` +
      `*Flight ${data.flightNumber}*\n` +
      `Status: ${data.status}\n` +
      `⏰ Departure: ${timeStr}\n` +
      (data.gate ? `🚪 Gate: ${data.gate}\n` : '')
    );
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async getClientAndPhone(userId: string): Promise<{
    client: IWhatsAppClient;
    phoneNumber: string;
  } | null> {
    const client = await getWhatsAppClientForUser(userId);
    if (!client) {
      logger.debug('WhatsApp client not available', { userId });
      return null;
    }

    // Get user's WhatsApp phone number
    const integration = await prisma.userIntegration.findUnique({
      where: { userId_provider: { userId, provider: 'WHATSAPP' } },
      select: { metadata: true },
    });

    const metadata = integration?.metadata as Record<string, unknown> | null;
    const phoneNumber = metadata?.phoneNumber as string | undefined;

    if (!phoneNumber) {
      logger.debug('No WhatsApp phone number for user', { userId });
      return null;
    }

    return { client, phoneNumber };
  }
}

export const whatsappNotifications = new WhatsAppNotificationsImpl();
export default whatsappNotifications;
