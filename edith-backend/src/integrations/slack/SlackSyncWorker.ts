/**
 * SlackSyncWorker
 * Background sync worker for Slack workspace data
 */

import { prisma } from '../../database/client.js';
import { syncManager, type SyncResult, type SyncError } from '../common/SyncManager.js';
import { createSlackClient, type SlackChannel, type SlackUser, type SlackMessage } from './SlackClient.js';
import { slackOAuthClient } from './SlackOAuthClient.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

interface SlackSyncOptions {
  syncChannels?: boolean;
  syncUsers?: boolean;
  syncMessages?: boolean;
  messageLimit?: number;
  channelIds?: string[];
}

interface SyncedWorkspaceData {
  channels: SlackChannel[];
  users: SlackUser[];
  messages: Map<string, SlackMessage[]>;
}

// ============================================================================
// SlackSyncWorker Class
// ============================================================================

class SlackSyncWorkerImpl {
  /**
   * Perform full workspace sync
   */
  async performFullSync(userId: string, options?: SlackSyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: SyncError[] = [];
    let itemsSynced = 0;

    const syncConfig = {
      provider: 'SLACK' as const,
      userId,
      syncType: 'full' as const,
    };

    const syncId = await syncManager.startSync(syncConfig);

    try {
      const client = await createSlackClient(userId);
      if (!client) {
        throw new Error('Slack client not available for user');
      }

      await syncManager.updateSyncProgress(syncId, {
        currentPhase: 'initializing',
        totalItems: 0,
      });

      const syncedData: SyncedWorkspaceData = {
        channels: [],
        users: [],
        messages: new Map(),
      };

      // Sync channels
      if (options?.syncChannels !== false) {
        try {
          await syncManager.updateSyncProgress(syncId, {
            currentPhase: 'syncing channels',
          });

          syncedData.channels = await client.getChannels();
          await this.storeChannels(userId, syncedData.channels);
          itemsSynced += syncedData.channels.length;

          logger.info('Slack channels synced', {
            userId,
            count: syncedData.channels.length,
          });
        } catch (error) {
          errors.push({
            item: 'channels',
            message: error instanceof Error ? error.message : 'Failed to sync channels',
            retryable: true,
          });
        }
      }

      // Sync users
      if (options?.syncUsers !== false) {
        try {
          await syncManager.updateSyncProgress(syncId, {
            currentPhase: 'syncing users',
          });

          syncedData.users = await client.getUsers();
          await this.storeUsers(userId, syncedData.users);
          itemsSynced += syncedData.users.length;

          logger.info('Slack users synced', {
            userId,
            count: syncedData.users.length,
          });
        } catch (error) {
          errors.push({
            item: 'users',
            message: error instanceof Error ? error.message : 'Failed to sync users',
            retryable: true,
          });
        }
      }

      // Sync recent messages (optional, can be expensive)
      if (options?.syncMessages) {
        const channelsToSync = options.channelIds ||
          syncedData.channels.filter(c => c.isMember).slice(0, 10).map(c => c.id);

        for (const channelId of channelsToSync) {
          try {
            await syncManager.updateSyncProgress(syncId, {
              currentPhase: `syncing messages for ${channelId}`,
            });

            const messages = await client.getMessages(channelId, options.messageLimit || 100);
            syncedData.messages.set(channelId, messages);
            await this.storeMessages(userId, channelId, messages);
            itemsSynced += messages.length;
          } catch (error) {
            errors.push({
              item: `messages:${channelId}`,
              message: error instanceof Error ? error.message : 'Failed to sync messages',
              retryable: true,
            });
          }
        }
      }

      // Update last sync time
      await prisma.userIntegration.update({
        where: { userId_provider: { userId, provider: 'SLACK' } },
        data: { lastSyncAt: new Date() },
      });

      const result: SyncResult = {
        success: errors.length === 0,
        itemsSynced,
        errors,
        duration: Date.now() - startTime,
      };

      await syncManager.completeSync(syncId, syncConfig, result);
      return result;

    } catch (error) {
      logger.error('Slack sync failed', { userId, error });

      const result: SyncResult = {
        success: false,
        itemsSynced,
        errors: [
          ...errors,
          {
            message: error instanceof Error ? error.message : 'Sync failed',
            retryable: true,
          },
        ],
        duration: Date.now() - startTime,
      };

      await syncManager.completeSync(syncId, syncConfig, result);
      return result;
    }
  }

  /**
   * Sync only channels
   */
  async syncChannels(userId: string): Promise<SyncResult> {
    return this.performFullSync(userId, {
      syncChannels: true,
      syncUsers: false,
      syncMessages: false,
    });
  }

  /**
   * Sync only users
   */
  async syncUsers(userId: string): Promise<SyncResult> {
    return this.performFullSync(userId, {
      syncChannels: false,
      syncUsers: true,
      syncMessages: false,
    });
  }

  /**
   * Sync messages for specific channels
   */
  async syncMessages(userId: string, channelIds: string[], limit?: number): Promise<SyncResult> {
    return this.performFullSync(userId, {
      syncChannels: false,
      syncUsers: false,
      syncMessages: true,
      channelIds,
      messageLimit: limit,
    });
  }

  /**
   * Get workspace summary
   */
  async getWorkspaceSummary(userId: string): Promise<{
    teamId: string;
    teamName: string;
    channelCount: number;
    userCount: number;
    lastSyncAt: Date | null;
  } | null> {
    const credentials = await slackOAuthClient.getCredentials(userId);
    if (!credentials) {
      return null;
    }

    const integration = await prisma.userIntegration.findUnique({
      where: { userId_provider: { userId, provider: 'SLACK' } },
      select: { lastSyncAt: true, metadata: true },
    });

    const metadata = integration?.metadata as Record<string, unknown> | null;

    // Get counts from local storage
    const channelCount = await prisma.slackChannel.count({
      where: { userId },
    });

    const userCount = await prisma.slackMember.count({
      where: { userId },
    });

    return {
      teamId: credentials.teamId,
      teamName: credentials.teamName,
      channelCount,
      userCount,
      lastSyncAt: integration?.lastSyncAt || null,
    };
  }

  // ============================================================================
  // Private Storage Methods
  // ============================================================================

  private async storeChannels(userId: string, channels: SlackChannel[]): Promise<void> {
    // Use transaction for atomic updates
    await prisma.$transaction(async (tx) => {
      for (const channel of channels) {
        await tx.slackChannel.upsert({
          where: {
            externalId_userId: {
              externalId: channel.id,
              userId,
            },
          },
          update: {
            channelId: channel.id,
            name: channel.name,
            isPrivate: channel.isPrivate,
            isArchived: channel.isArchived,
            isMember: channel.isMember,
            topic: channel.topic,
            purpose: channel.purpose,
            memberCount: channel.memberCount,
          },
          create: {
            externalId: channel.id,
            channelId: channel.id,
            userId,
            name: channel.name,
            isPrivate: channel.isPrivate,
            isArchived: channel.isArchived,
            isMember: channel.isMember,
            topic: channel.topic,
            purpose: channel.purpose,
            memberCount: channel.memberCount,
          },
        });
      }
    });
  }

  private async storeUsers(userId: string, users: SlackUser[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      for (const user of users) {
        await tx.slackMember.upsert({
          where: {
            externalId_userId: {
              externalId: user.id,
              userId,
            },
          },
          update: {
            memberId: user.id,
            name: user.name,
            realName: user.realName,
            email: user.email,
            isBot: user.isBot,
            isAdmin: user.isAdmin,
            statusText: user.status?.text,
            statusEmoji: user.status?.emoji,
            displayName: user.profile?.title,
            avatarUrl: user.profile?.image,
          },
          create: {
            externalId: user.id,
            memberId: user.id,
            userId,
            name: user.name,
            realName: user.realName,
            email: user.email,
            isBot: user.isBot,
            isAdmin: user.isAdmin,
            statusText: user.status?.text,
            statusEmoji: user.status?.emoji,
            displayName: user.profile?.title,
            avatarUrl: user.profile?.image,
          },
        });
      }
    });
  }

  private async storeMessages(
    userId: string,
    channelId: string,
    messages: SlackMessage[]
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      for (const message of messages) {
        await tx.slackMessage.upsert({
          where: {
            externalId_userId: {
              externalId: `${channelId}:${message.ts}`,
              userId,
            },
          },
          update: {
            text: message.text,
          },
          create: {
            externalId: `${channelId}:${message.ts}`,
            userId,
            channelId,
            senderId: message.userId,
            text: message.text,
            messageTs: message.ts,
            threadTs: message.threadTs,
          },
        });
      }
    });
  }
}

export const slackSyncWorker = new SlackSyncWorkerImpl();
export default slackSyncWorker;
