/**
 * GmailSyncWorker
 * Background sync worker for Gmail data
 */

import { prisma } from '../../database/client.js';
import { syncManager, type SyncResult, type SyncError } from '../common/SyncManager.js';
import { createGmailClientForUser, type GmailMessage } from './GmailClient.js';
import { emailQueue } from '../../jobs/queue.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

interface EmailCreateData {
  externalId: string;
  userId: string;
  threadId: string;
  subject: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses: string[];
  snippet: string;
  bodyText?: string;
  bodyHtml?: string;
  receivedAt: Date;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  attachments: Array<{ filename: string; mimeType: string; size: number }>;
}

// ============================================================================
// GmailSyncWorker Class
// ============================================================================

class GmailSyncWorkerImpl {
  /**
   * Perform full sync of emails (last 30 days)
   */
  async performFullSync(userId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: SyncError[] = [];
    let itemsSynced = 0;

    const syncConfig = {
      provider: 'GMAIL' as const,
      userId,
      syncType: 'full' as const,
    };

    const syncId = await syncManager.startSync(syncConfig);

    try {
      const client = await createGmailClientForUser(userId);
      if (!client) {
        throw new Error('Gmail client not available for user');
      }

      // Calculate 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const query = `after:${Math.floor(thirtyDaysAgo.getTime() / 1000)}`;

      let pageToken: string | undefined;
      let processedCount = 0;

      do {
        await syncManager.updateSyncProgress(syncId, {
          currentPhase: 'fetching messages',
          itemsProcessed: processedCount,
        });

        const listResult = await client.listMessages({
          q: query,
          maxResults: 100,
          pageToken,
        });

        // Fetch full message details in batches
        const batch = listResult.messages.slice(0, 50); // Process 50 at a time
        for (const msg of batch) {
          try {
            const fullMessage = await client.getMessage(msg.id);
            await this.upsertEmail(userId, fullMessage);
            itemsSynced++;
            processedCount++;
          } catch (error) {
            errors.push({
              item: msg.id,
              message: error instanceof Error ? error.message : 'Unknown error',
              retryable: true,
            });
          }
        }

        pageToken = listResult.nextPageToken;
      } while (pageToken);

      // Get the latest history ID for incremental syncs
      const latestMessages = await client.listMessages({ maxResults: 1 });
      if (latestMessages.messages.length > 0) {
        const latestMessage = await client.getMessage(latestMessages.messages[0].id);
        if (latestMessage.historyId) {
          await syncManager.recordSyncToken(userId, 'GMAIL', latestMessage.historyId);
        }
      }

      // Trigger immediate categorization for newly synced emails
      if (itemsSynced > 0) {
        await emailQueue.add('categorize-after-sync', {
          targetUserId: userId,
          maxEmailsPerUser: itemsSynced,
          triggeredAt: new Date().toISOString(),
        }, { priority: 1, removeOnComplete: true, removeOnFail: 100 });
        logger.info('Enqueued categorization after full sync', { userId, count: itemsSynced });
      }

      const result: SyncResult = {
        success: errors.length === 0,
        itemsSynced,
        errors,
        duration: Date.now() - startTime,
      };

      await syncManager.completeSync(syncId, syncConfig, result);
      return result;

    } catch (error) {
      logger.error('Gmail full sync failed', { userId, error });

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
   * Perform incremental sync using History API
   */
  async performIncrementalSync(userId: string, startHistoryId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: SyncError[] = [];
    let itemsSynced = 0;

    const syncConfig = {
      provider: 'GMAIL' as const,
      userId,
      syncType: 'incremental' as const,
      syncToken: startHistoryId,
    };

    const syncId = await syncManager.startSync(syncConfig);

    try {
      const client = await createGmailClientForUser(userId);
      if (!client) {
        throw new Error('Gmail client not available for user');
      }

      let pageToken: string | undefined;
      let latestHistoryId = startHistoryId;

      do {
        const historyResult = await client.getHistoryList(startHistoryId, pageToken);
        latestHistoryId = historyResult.historyId;

        for (const history of historyResult.history) {
          // Handle added messages
          if (history.messagesAdded) {
            for (const added of history.messagesAdded) {
              if (added.message?.id) {
                try {
                  const fullMessage = await client.getMessage(added.message.id);
                  await this.upsertEmail(userId, fullMessage);
                  itemsSynced++;
                } catch (error) {
                  errors.push({
                    item: added.message.id,
                    message: error instanceof Error ? error.message : 'Failed to sync added message',
                    retryable: true,
                  });
                }
              }
            }
          }

          // Handle deleted messages
          if (history.messagesDeleted) {
            for (const deleted of history.messagesDeleted) {
              if (deleted.message?.id) {
                try {
                  await this.deleteEmail(userId, deleted.message.id);
                  itemsSynced++;
                } catch (error) {
                  // Ignore errors for deletes - message might not exist locally
                }
              }
            }
          }

          // Handle label changes
          if (history.labelsAdded || history.labelsRemoved) {
            const messageIds = new Set<string>();

            history.labelsAdded?.forEach(item => {
              if (item.message?.id) messageIds.add(item.message.id);
            });

            history.labelsRemoved?.forEach(item => {
              if (item.message?.id) messageIds.add(item.message.id);
            });

            for (const messageId of messageIds) {
              try {
                const fullMessage = await client.getMessage(messageId);
                await this.upsertEmail(userId, fullMessage);
                itemsSynced++;
              } catch (error) {
                // Message might have been deleted
              }
            }
          }
        }

        pageToken = historyResult.nextPageToken;
      } while (pageToken);

      // Update sync token
      await syncManager.recordSyncToken(userId, 'GMAIL', latestHistoryId);

      // Trigger immediate categorization for newly synced emails
      if (itemsSynced > 0) {
        await emailQueue.add('categorize-after-sync', {
          targetUserId: userId,
          maxEmailsPerUser: itemsSynced,
          triggeredAt: new Date().toISOString(),
        }, { priority: 1, removeOnComplete: true, removeOnFail: 100 });
        logger.info('Enqueued categorization after incremental sync', { userId, count: itemsSynced });
      }

      const result: SyncResult = {
        success: true,
        itemsSynced,
        newSyncToken: latestHistoryId,
        errors,
        duration: Date.now() - startTime,
      };

      await syncManager.completeSync(syncId, syncConfig, result);
      return result;

    } catch (error) {
      logger.error('Gmail incremental sync failed', { userId, error });

      // If history ID is invalid, trigger full sync
      if (error instanceof Error && error.message.includes('historyId')) {
        logger.info('History ID invalid, triggering full sync', { userId });
        await syncManager.updateSyncStatus(userId, 'GMAIL', 'PENDING');
        return this.performFullSync(userId);
      }

      const result: SyncResult = {
        success: false,
        itemsSynced,
        errors: [
          ...errors,
          {
            message: error instanceof Error ? error.message : 'Incremental sync failed',
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
   * Set up Gmail watch for real-time notifications
   */
  async setupWatch(userId: string, topicName: string): Promise<{ historyId: string; expiration: Date }> {
    const client = await createGmailClientForUser(userId);
    if (!client) {
      throw new Error('Gmail client not available for user');
    }

    const result = await client.watchMailbox(topicName);

    // Store watch info in integration metadata
    const integration = await prisma.userIntegration.findUnique({
      where: { userId_provider: { userId, provider: 'GMAIL' } },
    });

    const metadata = (integration?.metadata as Record<string, unknown>) || {};
    await prisma.userIntegration.update({
      where: { userId_provider: { userId, provider: 'GMAIL' } },
      data: {
        metadata: {
          ...metadata,
          watchHistoryId: result.historyId,
          watchExpiration: result.expiration,
        },
      },
    });

    return {
      historyId: result.historyId,
      expiration: new Date(parseInt(result.expiration)),
    };
  }

  /**
   * Stop Gmail watch
   */
  async stopWatch(userId: string): Promise<void> {
    const client = await createGmailClientForUser(userId);
    if (!client) {
      throw new Error('Gmail client not available for user');
    }

    await client.stopWatch();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async upsertEmail(userId: string, message: GmailMessage): Promise<void> {
    const emailData = this.parseMessage(userId, message);

    await prisma.email.upsert({
      where: {
        userId_externalId: {
          externalId: emailData.externalId,
          userId: emailData.userId,
        },
      },
      update: {
        isRead: emailData.isRead,
        isStarred: emailData.isStarred,
        labels: emailData.labels,
      },
      create: emailData,
    });
  }

  private async deleteEmail(userId: string, externalId: string): Promise<void> {
    await prisma.email.deleteMany({
      where: {
        userId,
        externalId,
      },
    });
  }

  private parseMessage(userId: string, message: GmailMessage): EmailCreateData {
    const headers = new Map(
      message.payload.headers.map(h => [h.name.toLowerCase(), h.value])
    );

    const from = headers.get('from') || '';
    const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/) || [, , from];
    const fromName = fromMatch[1]?.trim().replace(/^"|"$/g, '');
    const fromAddress = fromMatch[2] || from;

    const parseAddressList = (value: string | undefined): string[] => {
      if (!value) return [];
      return value.split(',').map(addr => {
        const match = addr.match(/<(.+?)>/);
        return match ? match[1] : addr.trim();
      }).filter((s): s is string => Boolean(s));
    };

    const body = this.extractBody(message);

    return {
      externalId: message.id,
      userId,
      threadId: message.threadId,
      subject: headers.get('subject') || '(no subject)',
      fromAddress,
      fromName,
      toAddresses: parseAddressList(headers.get('to')),
      ccAddresses: parseAddressList(headers.get('cc')),
      snippet: message.snippet,
      bodyText: body.text,
      bodyHtml: body.html,
      receivedAt: new Date(parseInt(message.internalDate)),
      isRead: !message.labelIds.includes('UNREAD'),
      isStarred: message.labelIds.includes('STARRED'),
      labels: message.labelIds,
      attachments: this.extractAttachments(message),
    };
  }

  private extractBody(message: GmailMessage): { text?: string; html?: string } {
    const result: { text?: string; html?: string } = {};

    const extractFromParts = (parts: typeof message.payload.parts): void => {
      if (!parts) return;

      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          result.text = Buffer.from(part.body.data, 'base64').toString('utf8');
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          result.html = Buffer.from(part.body.data, 'base64').toString('utf8');
        } else if (part.parts) {
          extractFromParts(part.parts);
        }
      }
    };

    // Check body directly
    if (message.payload.body?.data) {
      if (message.payload.mimeType === 'text/plain') {
        result.text = Buffer.from(message.payload.body.data, 'base64').toString('utf8');
      } else if (message.payload.mimeType === 'text/html') {
        result.html = Buffer.from(message.payload.body.data, 'base64').toString('utf8');
      }
    }

    // Check parts
    extractFromParts(message.payload.parts);

    return result;
  }

  private extractAttachments(message: GmailMessage): Array<{ filename: string; mimeType: string; size: number }> {
    const attachments: Array<{ filename: string; mimeType: string; size: number }> = [];

    const checkParts = (parts: typeof message.payload.parts): void => {
      if (!parts) return;

      for (const part of parts) {
        if (part.filename && part.body && part.body.size > 0) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size,
          });
        }
        if (part.parts) {
          checkParts(part.parts);
        }
      }
    };

    checkParts(message.payload.parts);
    return attachments;
  }
}

export const gmailSyncWorker = new GmailSyncWorkerImpl();
export default gmailSyncWorker;
