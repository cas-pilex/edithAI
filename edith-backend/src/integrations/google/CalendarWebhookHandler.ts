/**
 * CalendarWebhookHandler
 * Handles Google Calendar push notification webhooks
 */

import { prisma } from '../../database/client.js';
import { webhookManager } from '../common/WebhookManager.js';
import { syncManager } from '../common/SyncManager.js';
import { calendarSyncWorker } from './CalendarSyncWorker.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface CalendarWebhookHeaders {
  'x-goog-channel-id': string;
  'x-goog-resource-id': string;
  'x-goog-resource-state': 'sync' | 'exists' | 'not_exists';
  'x-goog-resource-uri': string;
  'x-goog-channel-expiration'?: string;
  'x-goog-message-number'?: string;
}

// ============================================================================
// CalendarWebhookHandler Class
// ============================================================================

class CalendarWebhookHandlerImpl {
  /**
   * Handle incoming calendar push notification
   */
  async handlePushNotification(
    headers: CalendarWebhookHeaders
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const channelId = headers['x-goog-channel-id'];
      const resourceId = headers['x-goog-resource-id'];
      const resourceState = headers['x-goog-resource-state'];
      const resourceUri = headers['x-goog-resource-uri'];

      logger.info('Calendar push notification received', {
        channelId,
        resourceId,
        resourceState,
      });

      // Handle sync state (initial verification)
      if (resourceState === 'sync') {
        logger.debug('Calendar watch sync confirmation received');
        return { success: true };
      }

      // Find the calendar and user for this notification
      const calendarInfo = await this.findCalendarByChannelId(channelId);

      if (!calendarInfo) {
        logger.warn('Unknown calendar channel', { channelId });
        return { success: false, error: 'Unknown channel' };
      }

      // Queue sync for the calendar
      await this.queueCalendarSync(calendarInfo.userId, calendarInfo.calendarId);

      return { success: true };
    } catch (error) {
      logger.error('Calendar webhook handling failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find calendar info by channel ID
   * Note: This requires storing channel ID when setting up watches
   */
  private async findCalendarByChannelId(
    channelId: string
  ): Promise<{ userId: string; calendarId: string } | null> {
    // The channel ID contains userId and calendarId (from our generation function)
    // In a real implementation, you'd store the channel mapping

    // For now, search through active integrations
    const integrations = await prisma.userIntegration.findMany({
      where: {
        provider: 'GOOGLE_CALENDAR',
        isActive: true,
      },
      select: { userId: true },
    });

    // Try to find the calendar that matches this channel
    for (const integration of integrations) {
      const calendars = await prisma.calendarSync.findMany({
        where: { userId: integration.userId },
      });

      for (const calendar of calendars) {
        const expectedChannelId = webhookManager.generateCalendarChannelId(
          integration.userId,
          calendar.calendarId
        );

        // Check if this channel matches (might need partial match due to timing)
        if (channelId.startsWith(expectedChannelId.substring(0, 16))) {
          return {
            userId: integration.userId,
            calendarId: calendar.calendarId,
          };
        }
      }
    }

    return null;
  }

  /**
   * Queue a calendar sync
   */
  private async queueCalendarSync(userId: string, calendarId: string): Promise<void> {
    try {
      // Check if sync is already in progress
      const status = await syncManager.getSyncStatus(userId, 'GOOGLE_CALENDAR');
      if (status?.status === 'SYNCING') {
        logger.debug('Calendar sync already in progress', { userId });
        return;
      }

      // Perform incremental sync for the specific calendar
      await calendarSyncWorker.syncCalendar(userId, calendarId);
    } catch (error) {
      logger.error('Failed to queue calendar sync', { userId, calendarId, error });
    }
  }

  /**
   * Verify the push notification is from Google
   * Google Calendar doesn't use signatures, but we verify the channel ID
   */
  verifyNotification(
    channelId: string,
    resourceId: string,
    expectedChannelIdPrefix: string
  ): { valid: boolean; error?: string } {
    const verification = webhookManager.verifyGoogleCalendarPush(
      channelId,
      resourceId,
      expectedChannelIdPrefix
    );

    return {
      valid: verification.valid,
      error: verification.error,
    };
  }

  /**
   * Acknowledge push notification (return 200)
   */
  acknowledgeNotification(): { status: number } {
    return { status: 200 };
  }

  /**
   * Get calendars that need watch renewal (expires in less than 1 day)
   */
  async getCalendarsNeedingWatchRenewal(): Promise<Array<{
    userId: string;
    calendarId: string;
  }>> {
    // In a full implementation, you'd store watch expiration times
    // and query for those expiring soon

    // For now, return all active calendars that should have watches
    const calendars = await prisma.calendarSync.findMany({
      include: {
        user: {
          include: {
            integrations: {
              where: {
                provider: 'GOOGLE_CALENDAR',
                isActive: true,
              },
            },
          },
        },
      },
    });

    return calendars
      .filter(c => c.user.integrations.length > 0)
      .map(c => ({
        userId: c.userId,
        calendarId: c.calendarId,
      }));
  }

  /**
   * Renew watch for a calendar
   */
  async renewWatch(userId: string, calendarId: string): Promise<void> {
    try {
      // This would use the CalendarSyncWorker to set up a new watch
      // For now, log the renewal attempt
      logger.info('Renewing calendar watch', { userId, calendarId });

      // The actual renewal would happen in CalendarSyncWorker.setupWatches
    } catch (error) {
      logger.error('Failed to renew calendar watch', { userId, calendarId, error });
      throw error;
    }
  }

  /**
   * Handle watch expiration
   */
  async handleWatchExpiration(channelId: string): Promise<void> {
    const calendarInfo = await this.findCalendarByChannelId(channelId);

    if (calendarInfo) {
      await this.renewWatch(calendarInfo.userId, calendarInfo.calendarId);
    }
  }
}

export const calendarWebhookHandler = new CalendarWebhookHandlerImpl();
export default calendarWebhookHandler;
