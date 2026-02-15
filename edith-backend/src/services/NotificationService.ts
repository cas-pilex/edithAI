/**
 * NotificationService
 * Multi-channel notification routing with quiet hours support
 */

import { prisma } from '../database/client.js';
import { logger } from '../utils/logger.js';
import { telegramNotifications } from '../integrations/telegram/TelegramNotifications.js';
import { whatsappNotifications } from '../integrations/whatsapp/WhatsAppNotifications.js';
import { createSlackClient } from '../integrations/slack/SlackClient.js';
import type { NotificationChannel, NotificationPriority, UserPreferences } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  priority?: NotificationPriority;
  channel?: NotificationChannel;
  actions?: NotificationAction[];
  expiresAt?: Date;
}

export interface NotificationAction {
  type: 'button' | 'reply';
  label: string;
  action: string;
  data?: Record<string, unknown>;
}

interface UserWithPreferences {
  id: string;
  email: string;
  timezone: string;
  preferences: UserPreferences | null;
}

// ============================================================================
// NotificationService
// ============================================================================

class NotificationServiceImpl {
  /**
   * Send notification to user via their preferred channel
   */
  async send(payload: NotificationPayload): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { preferences: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check per-type notification preference
    const typePref = await prisma.notificationPreference.findUnique({
      where: { userId_type: { userId: payload.userId, type: payload.type } },
    });

    // Skip if disabled (except URGENT priority)
    if (typePref && !typePref.enabled && payload.priority !== 'URGENT') {
      logger.debug('Notification skipped (disabled by user preference)', {
        userId: payload.userId,
        type: payload.type,
      });
      return 'skipped';
    }

    // Check quiet hours for non-urgent notifications
    if (payload.priority !== 'URGENT') {
      const inQuietHours = await this.isInQuietHours(user);
      if (inQuietHours) {
        return this.queueForLater(payload, user);
      }
    }

    // Determine channel: explicit > per-type preference > user default > EMAIL
    const channel = payload.channel
      || typePref?.channel
      || user.preferences?.preferredChannel
      || 'EMAIL';

    // Create notification record
    const notification = await prisma.notification.create({
      data: {
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: (payload.data || {}) as object,
        channel,
        priority: payload.priority || 'NORMAL',
        status: 'PENDING',
        expiresAt: payload.expiresAt,
      },
    });

    // Send via appropriate channel with fallback
    try {
      const result = await this.sendViaChannel(channel, payload, user);

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: result.success ? 'SENT' : 'FAILED',
          sentAt: result.success ? new Date() : undefined,
          deliveryAttempts: 1,
          lastDeliveryAt: new Date(),
          externalMessageId: result.externalId,
          deliveryError: result.error,
        },
      });

      if (!result.success) {
        logger.warn('Notification delivery failed', {
          notificationId: notification.id,
          channel,
          error: result.error,
        });
      }

      return notification.id;
    } catch (error) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'FAILED',
          deliveryError: (error as Error).message,
          deliveryAttempts: 1,
          lastDeliveryAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Send notification via multiple channels for high priority
   */
  async sendMultiChannel(
    payload: NotificationPayload,
    channels: NotificationChannel[]
  ): Promise<string[]> {
    const results: string[] = [];

    for (const channel of channels) {
      try {
        const notificationId = await this.send({
          ...payload,
          channel,
        });
        results.push(notificationId);
      } catch (error) {
        logger.error('Failed to send via channel', {
          channel,
          error: (error as Error).message,
        });
      }
    }

    return results;
  }

  /**
   * Send via specific channel with fallback to alternatives
   */
  private async sendViaChannel(
    channel: NotificationChannel,
    payload: NotificationPayload,
    user: UserWithPreferences
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    const channelPriority = this.getChannelPriority(channel);

    for (const ch of channelPriority) {
      try {
        const result = await this.trySendViaChannel(ch, payload, user);
        if (result.success) {
          return result;
        }
      } catch (error) {
        logger.debug(`Failed to send via ${ch}, trying next`, {
          userId: user.id,
          error: (error as Error).message,
        });
      }
    }

    return { success: false, error: 'All channels failed' };
  }

  /**
   * Attempt to send via a specific channel
   */
  private async trySendViaChannel(
    channel: NotificationChannel,
    payload: NotificationPayload,
    user: UserWithPreferences
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    switch (channel) {
      case 'TELEGRAM':
        return this.sendTelegram(payload, user);

      case 'WHATSAPP':
        return this.sendWhatsApp(payload, user);

      case 'SLACK':
        return this.sendSlack(payload, user);

      case 'EMAIL':
        return this.sendEmail(payload, user);

      case 'IN_APP':
      default:
        // Just create the notification record (already done)
        return { success: true };
    }
  }

  /**
   * Send via Telegram
   */
  private async sendTelegram(
    payload: NotificationPayload,
    user: UserWithPreferences
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    try {
      // Get user's telegram info
      const integration = await prisma.userIntegration.findUnique({
        where: { userId_provider: { userId: user.id, provider: 'TELEGRAM' } },
      });

      if (!integration?.isActive) {
        return { success: false, error: 'Telegram not connected' };
      }

      const telegramId = (integration.metadata as Record<string, string>)?.telegramId;
      if (!telegramId) {
        return { success: false, error: 'Telegram ID not found' };
      }

      // Format message based on notification type
      const buttons = payload.actions?.map((a) => ({
        text: a.label,
        callbackData: a.action,
      }));

      const success = await telegramNotifications.sendNotification(
        user.id,
        payload.title,
        payload.body || '',
        buttons
      );

      return { success };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Send via WhatsApp
   */
  private async sendWhatsApp(
    payload: NotificationPayload,
    user: UserWithPreferences
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    try {
      // WhatsApp requires templates for most notification types
      switch (payload.type) {
        case 'DAILY_BRIEFING':
          await whatsappNotifications.sendDailyBriefing(user.id, payload.data as any);
          return { success: true };

        case 'MEETING_REMINDER':
          await whatsappNotifications.sendMeetingReminder(user.id, payload.data as any);
          return { success: true };

        case 'EMAIL_ALERT':
          await whatsappNotifications.sendEmailAlert(user.id, payload.data as any);
          return { success: true };

        case 'APPROVAL_REQUEST':
          await whatsappNotifications.sendApprovalRequest(user.id, payload.data as any);
          return { success: true };

        case 'TASK_REMINDER':
          await whatsappNotifications.sendTaskReminder(user.id, payload.data as any);
          return { success: true };

        default:
          // Generic messages not supported without template
          return { success: false, error: 'No WhatsApp template for this notification type' };
      }
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Send via Slack
   */
  private async sendSlack(
    payload: NotificationPayload,
    user: UserWithPreferences
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    try {
      const client = await createSlackClient(user.id);
      if (!client) {
        return { success: false, error: 'Slack not connected' };
      }

      // Get user's Slack user ID
      const integration = await prisma.userIntegration.findUnique({
        where: { userId_provider: { userId: user.id, provider: 'SLACK' } },
      });

      const slackUserId = (integration?.metadata as Record<string, string>)?.userId;
      if (!slackUserId) {
        return { success: false, error: 'Slack user ID not found' };
      }

      // Build Slack blocks
      const blocks = this.buildSlackBlocks(payload);

      await client.sendDM(slackUserId, payload.title);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Send via Email
   */
  private async sendEmail(
    payload: NotificationPayload,
    user: UserWithPreferences
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    // Email sending would integrate with SendGrid, SES, etc.
    // For now, log and return success
    logger.info('Email notification would be sent', {
      userId: user.id,
      type: payload.type,
      title: payload.title,
    });

    return { success: true };
  }

  /**
   * Build Slack blocks for notification
   */
  private buildSlackBlocks(payload: NotificationPayload): unknown[] {
    const blocks: unknown[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${payload.title}*${payload.body ? `\n${payload.body}` : ''}`,
        },
      },
    ];

    if (payload.actions?.length) {
      blocks.push({
        type: 'actions',
        elements: payload.actions.map((action) => ({
          type: 'button',
          text: { type: 'plain_text', text: action.label },
          action_id: action.action,
          value: JSON.stringify(action.data || {}),
        })),
      });
    }

    return blocks;
  }

  /**
   * Get ordered list of channels to try (preferred + fallbacks)
   */
  private getChannelPriority(preferred: NotificationChannel): NotificationChannel[] {
    const all: NotificationChannel[] = ['TELEGRAM', 'WHATSAPP', 'SLACK', 'EMAIL', 'IN_APP'];
    const idx = all.indexOf(preferred);
    if (idx === -1) return all;
    return [preferred, ...all.filter((c) => c !== preferred)];
  }

  /**
   * Check if user is in quiet hours
   */
  private async isInQuietHours(user: UserWithPreferences): Promise<boolean> {
    const prefs = user.preferences;
    if (!prefs?.quietHoursStart || !prefs?.quietHoursEnd) return false;

    const now = this.getUserLocalTime(user.timezone);
    const [startH, startM] = prefs.quietHoursStart.split(':').map(Number);
    const [endH, endM] = prefs.quietHoursEnd.split(':').map(Number);

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Quiet hours span midnight
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }

  /**
   * Get current time in user's timezone
   */
  private getUserLocalTime(timezone: string): Date {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    };

    const formatter = new Intl.DateTimeFormat('en-CA', options);
    const parts = formatter.formatToParts(now);

    const dateParts: Record<string, string> = {};
    for (const part of parts) {
      dateParts[part.type] = part.value;
    }

    return new Date(
      parseInt(dateParts.year),
      parseInt(dateParts.month) - 1,
      parseInt(dateParts.day),
      parseInt(dateParts.hour),
      parseInt(dateParts.minute),
      parseInt(dateParts.second)
    );
  }

  /**
   * Queue notification for later (after quiet hours)
   */
  private async queueForLater(
    payload: NotificationPayload,
    user: UserWithPreferences
  ): Promise<string> {
    const prefs = user.preferences!;
    const [endH, endM] = prefs.quietHoursEnd!.split(':').map(Number);

    // Calculate when quiet hours end in user's timezone
    const userNow = this.getUserLocalTime(user.timezone);
    const scheduledFor = new Date(userNow);
    scheduledFor.setHours(endH, endM, 0, 0);

    // If end time has passed today, schedule for tomorrow
    if (scheduledFor <= userNow) {
      scheduledFor.setDate(scheduledFor.getDate() + 1);
    }

    const notification = await prisma.notification.create({
      data: {
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: (payload.data || {}) as object,
        channel: user.preferences?.preferredChannel || 'EMAIL',
        priority: payload.priority || 'NORMAL',
        status: 'PENDING',
        scheduledFor,
        expiresAt: payload.expiresAt,
      },
    });

    logger.debug('Notification queued for after quiet hours', {
      notificationId: notification.id,
      scheduledFor,
    });

    return notification.id;
  }

  /**
   * Process scheduled notifications (called by a job)
   */
  async processScheduledNotifications(): Promise<number> {
    const now = new Date();

    const pendingNotifications = await prisma.notification.findMany({
      where: {
        status: 'PENDING',
        scheduledFor: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        user: { include: { preferences: true } },
      },
      take: 100,
    });

    let processed = 0;

    for (const notification of pendingNotifications) {
      try {
        // Check quiet hours again (they might have changed)
        if (await this.isInQuietHours(notification.user)) {
          continue;
        }

        const result = await this.sendViaChannel(
          notification.channel,
          {
            userId: notification.userId,
            type: notification.type,
            title: notification.title,
            body: notification.body || undefined,
            data: notification.data as Record<string, unknown>,
            priority: notification.priority,
          },
          notification.user
        );

        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: result.success ? 'SENT' : 'FAILED',
            sentAt: result.success ? new Date() : undefined,
            deliveryAttempts: { increment: 1 },
            lastDeliveryAt: new Date(),
            externalMessageId: result.externalId,
            deliveryError: result.error,
          },
        });

        processed++;
      } catch (error) {
        logger.error('Failed to process scheduled notification', {
          notificationId: notification.id,
          error: (error as Error).message,
        });
      }
    }

    return processed;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  /**
   * Get unread notifications for user
   */
  async getUnreadForUser(
    userId: string,
    options: { limit?: number; type?: string } = {}
  ): Promise<Array<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    createdAt: Date;
    priority: string;
  }>> {
    const where: Record<string, unknown> = {
      userId,
      status: { in: ['SENT', 'DELIVERED'] },
    };
    if (options.type) where.type = options.type;

    return prisma.notification.findMany({
      where,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        createdAt: true,
        priority: true,
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit || 50,
    });
  }

  /**
   * Expire old notifications
   */
  async expireOldNotifications(): Promise<number> {
    const now = new Date();

    const result = await prisma.notification.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: {
        status: 'FAILED',
        deliveryError: 'Notification expired',
      },
    });

    return result.count;
  }
}

export const notificationService = new NotificationServiceImpl();
export default notificationService;
