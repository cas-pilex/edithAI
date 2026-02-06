/**
 * SyncManager
 * Manages data synchronization between integrations and local database
 */

import { prisma } from '../../database/client.js';
import { getRedisClient } from '../../database/redis.js';
import { logger } from '../../utils/logger.js';
import type { IntegrationProvider } from '../../types/index.js';
import type { SyncStatus } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface SyncConfig {
  provider: IntegrationProvider;
  userId: string;
  syncType: 'full' | 'incremental';
  syncToken?: string;
}

export interface SyncResult {
  success: boolean;
  itemsSynced: number;
  newSyncToken?: string;
  errors: SyncError[];
  duration: number;
}

export interface SyncError {
  item?: string;
  message: string;
  code?: string;
  retryable: boolean;
}

export interface SyncProgress {
  status: SyncStatus;
  itemsProcessed: number;
  totalItems?: number;
  currentPhase?: string;
  startedAt: Date;
  lastUpdateAt: Date;
}

// ============================================================================
// SyncManager Class
// ============================================================================

class SyncManagerImpl {
  /**
   * Start a sync operation
   */
  async startSync(config: SyncConfig): Promise<string> {
    const syncId = `sync_${config.provider}_${config.userId}_${Date.now()}`;

    try {
      // Update integration status to SYNCING
      await this.updateSyncStatus(config.userId, config.provider, 'SYNCING');

      // Store sync progress in Redis
      await this.setSyncProgress(syncId, {
        status: 'SYNCING',
        itemsProcessed: 0,
        currentPhase: 'initializing',
        startedAt: new Date(),
        lastUpdateAt: new Date(),
      });

      logger.info('Sync started', {
        syncId,
        provider: config.provider,
        userId: config.userId,
        syncType: config.syncType,
      });

      return syncId;
    } catch (error) {
      logger.error('Failed to start sync', { config, error });
      await this.updateSyncStatus(config.userId, config.provider, 'FAILED');
      throw error;
    }
  }

  /**
   * Update sync status in database
   */
  async updateSyncStatus(
    userId: string,
    provider: IntegrationProvider,
    status: SyncStatus
  ): Promise<void> {
    try {
      await prisma.userIntegration.update({
        where: {
          userId_provider: { userId, provider },
        },
        data: {
          syncStatus: status,
          ...(status === 'COMPLETED' ? { lastSyncAt: new Date() } : {}),
        },
      });
    } catch (error) {
      logger.error('Failed to update sync status', { userId, provider, status, error });
      throw error;
    }
  }

  /**
   * Get sync status from database
   */
  async getSyncStatus(userId: string, provider: IntegrationProvider): Promise<{
    status: SyncStatus;
    lastSyncAt?: Date;
    syncToken?: string;
  } | null> {
    try {
      const integration = await prisma.userIntegration.findUnique({
        where: {
          userId_provider: { userId, provider },
        },
        select: {
          syncStatus: true,
          lastSyncAt: true,
          metadata: true,
        },
      });

      if (!integration) {
        return null;
      }

      const metadata = integration.metadata as Record<string, unknown> || {};

      return {
        status: integration.syncStatus,
        lastSyncAt: integration.lastSyncAt || undefined,
        syncToken: metadata.syncToken as string | undefined,
      };
    } catch (error) {
      logger.error('Failed to get sync status', { userId, provider, error });
      throw error;
    }
  }

  /**
   * Record sync token for incremental sync
   */
  async recordSyncToken(
    userId: string,
    provider: IntegrationProvider,
    token: string
  ): Promise<void> {
    try {
      const integration = await prisma.userIntegration.findUnique({
        where: {
          userId_provider: { userId, provider },
        },
        select: { metadata: true },
      });

      const existingMetadata = (integration?.metadata as Record<string, unknown>) || {};

      await prisma.userIntegration.update({
        where: {
          userId_provider: { userId, provider },
        },
        data: {
          metadata: {
            ...existingMetadata,
            syncToken: token,
            syncTokenUpdatedAt: new Date().toISOString(),
          },
        },
      });

      logger.debug('Sync token recorded', { userId, provider });
    } catch (error) {
      logger.error('Failed to record sync token', { userId, provider, error });
      throw error;
    }
  }

  /**
   * Get sync token for incremental sync
   */
  async getSyncToken(userId: string, provider: IntegrationProvider): Promise<string | null> {
    try {
      const integration = await prisma.userIntegration.findUnique({
        where: {
          userId_provider: { userId, provider },
        },
        select: { metadata: true },
      });

      const metadata = (integration?.metadata as Record<string, unknown>) || {};
      return (metadata.syncToken as string) || null;
    } catch (error) {
      logger.error('Failed to get sync token', { userId, provider, error });
      throw error;
    }
  }

  /**
   * Complete a sync operation
   */
  async completeSync(
    syncId: string,
    config: SyncConfig,
    result: SyncResult
  ): Promise<void> {
    try {
      // Update integration status
      await this.updateSyncStatus(
        config.userId,
        config.provider,
        result.success ? 'COMPLETED' : 'FAILED'
      );

      // Store sync token if provided
      if (result.newSyncToken) {
        await this.recordSyncToken(config.userId, config.provider, result.newSyncToken);
      }

      // Clear sync progress from Redis
      await this.clearSyncProgress(syncId);

      logger.info('Sync completed', {
        syncId,
        provider: config.provider,
        userId: config.userId,
        success: result.success,
        itemsSynced: result.itemsSynced,
        errors: result.errors.length,
        duration: result.duration,
      });
    } catch (error) {
      logger.error('Failed to complete sync', { syncId, config, error });
      throw error;
    }
  }

  /**
   * Set sync progress in Redis
   */
  async setSyncProgress(syncId: string, progress: SyncProgress): Promise<void> {
    const redis = getRedisClient();
    const key = `sync:progress:${syncId}`;
    await redis.setex(key, 3600, JSON.stringify(progress)); // 1 hour TTL
  }

  /**
   * Get sync progress from Redis
   */
  async getSyncProgress(syncId: string): Promise<SyncProgress | null> {
    const redis = getRedisClient();
    const key = `sync:progress:${syncId}`;
    const data = await redis.get(key);

    if (!data) {
      return null;
    }

    const progress = JSON.parse(data);
    return {
      ...progress,
      startedAt: new Date(progress.startedAt),
      lastUpdateAt: new Date(progress.lastUpdateAt),
    };
  }

  /**
   * Update sync progress
   */
  async updateSyncProgress(
    syncId: string,
    updates: Partial<SyncProgress>
  ): Promise<void> {
    const current = await this.getSyncProgress(syncId);
    if (!current) {
      return;
    }

    await this.setSyncProgress(syncId, {
      ...current,
      ...updates,
      lastUpdateAt: new Date(),
    });
  }

  /**
   * Clear sync progress from Redis
   */
  async clearSyncProgress(syncId: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`sync:progress:${syncId}`);
  }

  /**
   * Check if sync is needed based on last sync time
   */
  async isSyncNeeded(
    userId: string,
    provider: IntegrationProvider,
    maxAgeMs: number = 15 * 60 * 1000 // 15 minutes default
  ): Promise<boolean> {
    const status = await this.getSyncStatus(userId, provider);

    if (!status || !status.lastSyncAt) {
      return true;
    }

    const age = Date.now() - new Date(status.lastSyncAt).getTime();
    return age > maxAgeMs;
  }

  /**
   * Lock sync to prevent concurrent syncs
   */
  async acquireSyncLock(
    userId: string,
    provider: IntegrationProvider,
    ttlSeconds: number = 300
  ): Promise<boolean> {
    const redis = getRedisClient();
    const key = `sync:lock:${provider}:${userId}`;

    // Use SET NX to atomically acquire lock
    const result = await redis.set(key, Date.now().toString(), 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * Release sync lock
   */
  async releaseSyncLock(userId: string, provider: IntegrationProvider): Promise<void> {
    const redis = getRedisClient();
    const key = `sync:lock:${provider}:${userId}`;
    await redis.del(key);
  }

  /**
   * Execute sync with lock protection
   */
  async executeWithLock<T>(
    userId: string,
    provider: IntegrationProvider,
    syncFn: () => Promise<T>,
    ttlSeconds: number = 300
  ): Promise<T> {
    const lockAcquired = await this.acquireSyncLock(userId, provider, ttlSeconds);

    if (!lockAcquired) {
      throw new Error(`Sync already in progress for ${provider}`);
    }

    try {
      return await syncFn();
    } finally {
      await this.releaseSyncLock(userId, provider);
    }
  }

  /**
   * Schedule a delayed sync (using Redis)
   */
  async scheduleSync(
    userId: string,
    provider: IntegrationProvider,
    delayMs: number,
    syncType: 'full' | 'incremental' = 'incremental'
  ): Promise<void> {
    const redis = getRedisClient();
    const key = `sync:scheduled:${provider}:${userId}`;
    const scheduledAt = Date.now() + delayMs;

    await redis.set(key, JSON.stringify({
      userId,
      provider,
      syncType,
      scheduledAt,
    }), 'EX', Math.ceil(delayMs / 1000) + 60);

    logger.debug('Sync scheduled', { userId, provider, scheduledAt: new Date(scheduledAt) });
  }

  /**
   * Record calendar-specific sync token
   */
  async recordCalendarSyncToken(
    userId: string,
    calendarId: string,
    syncToken: string
  ): Promise<void> {
    try {
      await prisma.calendarSync.upsert({
        where: {
          userId_calendarId: { userId, calendarId },
        },
        update: {
          syncToken,
          lastSyncAt: new Date(),
        },
        create: {
          userId,
          calendarId,
          calendarName: calendarId, // Will be updated during sync
          syncToken,
          lastSyncAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to record calendar sync token', { userId, calendarId, error });
      throw error;
    }
  }

  /**
   * Get calendar-specific sync token
   */
  async getCalendarSyncToken(
    userId: string,
    calendarId: string
  ): Promise<string | null> {
    try {
      const sync = await prisma.calendarSync.findUnique({
        where: {
          userId_calendarId: { userId, calendarId },
        },
        select: { syncToken: true },
      });

      return sync?.syncToken || null;
    } catch (error) {
      logger.error('Failed to get calendar sync token', { userId, calendarId, error });
      return null;
    }
  }
}

export const syncManager = new SyncManagerImpl();
export default syncManager;
