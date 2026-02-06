/**
 * GmailWebhookHandler
 * Handles Gmail Pub/Sub webhook notifications
 */

import { prisma } from '../../database/client.js';
import { webhookManager, type GooglePubSubMessage } from '../common/WebhookManager.js';
import { syncManager } from '../common/SyncManager.js';
import { gmailSyncWorker } from './GmailSyncWorker.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

interface GmailPushNotification {
  emailAddress: string;
  historyId: string;
}

// ============================================================================
// GmailWebhookHandler Class
// ============================================================================

class GmailWebhookHandlerImpl {
  /**
   * Handle incoming Pub/Sub notification
   */
  async handlePubSubNotification(
    message: GooglePubSubMessage,
    authorizationHeader: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Verify the message is from Google
      const verification = await webhookManager.verifyGooglePubSub(
        authorizationHeader,
        process.env.GOOGLE_PUBSUB_AUDIENCE || ''
      );

      if (!verification.valid) {
        logger.warn('Invalid Gmail webhook signature', { error: verification.error });
        return { success: false, error: verification.error };
      }

      // Parse the notification data
      const notification = webhookManager.parseGooglePubSubMessage<GmailPushNotification>(message);

      if (!notification) {
        logger.warn('Failed to parse Gmail notification');
        return { success: false, error: 'Invalid notification format' };
      }

      logger.info('Gmail push notification received', {
        email: notification.emailAddress,
        historyId: notification.historyId,
      });

      // Find user by email
      const user = await this.findUserByGmailEmail(notification.emailAddress);

      if (!user) {
        logger.warn('No user found for Gmail notification', { email: notification.emailAddress });
        return { success: false, error: 'User not found' };
      }

      // Queue incremental sync
      await this.queueIncrementalSync(user.userId, notification.historyId);

      return { success: true };
    } catch (error) {
      logger.error('Gmail webhook handling failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find user by their Gmail email address
   */
  private async findUserByGmailEmail(email: string): Promise<{ userId: string } | null> {
    const integration = await prisma.userIntegration.findFirst({
      where: {
        provider: 'GMAIL',
        isActive: true,
        metadata: {
          path: ['email'],
          equals: email,
        },
      },
      select: { userId: true },
    });

    return integration;
  }

  /**
   * Queue an incremental sync for the user
   */
  private async queueIncrementalSync(userId: string, historyId: string): Promise<void> {
    try {
      // Check if sync is already in progress
      const status = await syncManager.getSyncStatus(userId, 'GMAIL');
      if (status?.status === 'SYNCING') {
        logger.debug('Gmail sync already in progress', { userId });
        return;
      }

      // Get stored history ID
      const storedHistoryId = await syncManager.getSyncToken(userId, 'GMAIL');

      if (!storedHistoryId) {
        // No history ID stored, need full sync
        logger.info('No stored history ID, performing full sync', { userId });
        await gmailSyncWorker.performFullSync(userId);
        return;
      }

      // Perform incremental sync from stored history ID
      // (not the one from the notification, as we might have missed notifications)
      await gmailSyncWorker.performIncrementalSync(userId, storedHistoryId);
    } catch (error) {
      logger.error('Failed to queue Gmail sync', { userId, error });
    }
  }

  /**
   * Acknowledge a Pub/Sub message (return 200 to prevent redelivery)
   */
  acknowledgeMessage(): { status: number } {
    return { status: 200 };
  }

  /**
   * Refresh Gmail watch for a user (call before watch expires)
   */
  async refreshWatch(userId: string, topicName: string): Promise<void> {
    try {
      const result = await gmailSyncWorker.setupWatch(userId, topicName);
      logger.info('Gmail watch refreshed', {
        userId,
        expiration: result.expiration,
      });
    } catch (error) {
      logger.error('Failed to refresh Gmail watch', { userId, error });
      throw error;
    }
  }

  /**
   * Get watch expiration for a user
   */
  async getWatchExpiration(userId: string): Promise<Date | null> {
    const integration = await prisma.userIntegration.findUnique({
      where: { userId_provider: { userId, provider: 'GMAIL' } },
      select: { metadata: true },
    });

    const metadata = integration?.metadata as Record<string, unknown> | null;
    const expiration = metadata?.watchExpiration as string | undefined;

    if (!expiration) {
      return null;
    }

    return new Date(parseInt(expiration));
  }

  /**
   * Check if watch needs renewal (expires in less than 1 day)
   */
  async watchNeedsRenewal(userId: string): Promise<boolean> {
    const expiration = await this.getWatchExpiration(userId);

    if (!expiration) {
      return true;
    }

    const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return expiration < oneDayFromNow;
  }

  /**
   * Get all users with Gmail watches that need renewal
   */
  async getUsersNeedingWatchRenewal(): Promise<string[]> {
    const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const integrations = await prisma.userIntegration.findMany({
      where: {
        provider: 'GMAIL',
        isActive: true,
      },
      select: {
        userId: true,
        metadata: true,
      },
    });

    return integrations
      .filter(int => {
        const metadata = int.metadata as Record<string, unknown> | null;
        const expiration = metadata?.watchExpiration as string | undefined;

        if (!expiration) return true;

        return new Date(parseInt(expiration)) < oneDayFromNow;
      })
      .map(int => int.userId);
  }
}

export const gmailWebhookHandler = new GmailWebhookHandlerImpl();
export default gmailWebhookHandler;
