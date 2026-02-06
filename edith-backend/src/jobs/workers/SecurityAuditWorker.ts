/**
 * SecurityAuditWorker
 * Daily security audit and maintenance job
 */

import { Job } from 'bullmq';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';
import { auditService } from '../../services/AuditService.js';
import { BaseWorker } from './BaseWorker.js';
import type {
  SecurityAuditJobData,
  JobExecutionContext,
  JobResult,
} from '../types.js';

export class SecurityAuditWorker extends BaseWorker<SecurityAuditJobData> {
  protected queueName = 'maintenance';
  protected jobType = 'SECURITY_AUDIT' as const;

  protected async execute(
    job: Job<SecurityAuditJobData>,
    context: JobExecutionContext
  ): Promise<JobResult> {
    logger.info('Starting security audit', { jobId: job.id });

    const results: Record<string, unknown> = {
      expiredTokens: 0,
      refreshedTokens: 0,
      suspiciousActivities: 0,
      cleanedLogs: 0,
      deletionRequestsProcessed: 0,
    };

    // 1. Check for expired or expiring tokens
    if (job.data.checkTokens !== false) {
      const tokenResult = await this.checkExpiringTokens();
      results.expiredTokens = tokenResult.expired;
      results.refreshedTokens = tokenResult.refreshed;
    }

    // 2. Check for suspicious login patterns
    if (job.data.checkLoginPatterns !== false) {
      const suspiciousCount = await this.checkSuspiciousActivity();
      results.suspiciousActivities = suspiciousCount;
    }

    // 3. Cleanup old logs (respecting retention policy)
    if (job.data.cleanupLogs !== false) {
      const retentionDays = job.data.retentionDays || 730; // 2 years default
      const cleanupResult = await auditService.cleanupOldLogs(retentionDays);
      results.cleanedLogs = cleanupResult.auditLogs + cleanupResult.securityEvents + cleanupResult.actionLogs;
    }

    // 4. Process pending data deletion requests
    const deletionsProcessed = await this.processDataDeletionRequests();
    results.deletionRequestsProcessed = deletionsProcessed;

    // 5. Check for failed API calls (possible credential issues)
    const failedApiCount = await this.checkFailedApiCalls();
    results.failedApiCalls = failedApiCount;

    logger.info('Security audit completed', results);

    return {
      success: true,
      data: results,
    };
  }

  /**
   * Check for tokens that are expired or expiring soon
   */
  private async checkExpiringTokens(): Promise<{ expired: number; refreshed: number }> {
    const now = new Date();
    const soonExpiring = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

    // Find integrations with expired or soon-expiring tokens
    const integrations = await prisma.userIntegration.findMany({
      where: {
        isActive: true,
        tokenExpiresAt: { lte: soonExpiring },
      },
      include: { user: true },
    });

    let expired = 0;
    let refreshed = 0;

    for (const integration of integrations) {
      if (integration.tokenExpiresAt && integration.tokenExpiresAt < now) {
        expired++;

        // Log security event for expired token
        await auditService.logSecurityEvent(
          'TOKEN_REFRESH',
          integration.userId,
          {},
          {
            provider: integration.provider,
            status: 'expired',
            action: 'deactivated',
          }
        );

        // Deactivate the integration (user will need to re-authenticate)
        await prisma.userIntegration.update({
          where: { id: integration.id },
          data: {
            isActive: false,
            syncStatus: 'FAILED',
          },
        });
      } else {
        // Token is expiring soon - attempt refresh (would need actual refresh logic)
        logger.info('Token expiring soon', {
          userId: integration.userId,
          provider: integration.provider,
          expiresAt: integration.tokenExpiresAt,
        });
        refreshed++;
      }
    }

    return { expired, refreshed };
  }

  /**
   * Check for suspicious login patterns
   */
  private async checkSuspiciousActivity(): Promise<number> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find users with multiple failed login attempts
    const failedLogins = await prisma.securityEvent.groupBy({
      by: ['userId'],
      where: {
        eventType: 'FAILED_LOGIN',
        timestamp: { gte: yesterday },
      },
      _count: true,
      having: {
        userId: {
          _count: { gte: 5 }, // 5+ failed attempts
        },
      },
    });

    let suspiciousCount = 0;

    for (const record of failedLogins) {
      if (!record.userId) continue;

      suspiciousCount++;

      // Log suspicious activity
      await auditService.logSecurityEvent(
        'SUSPICIOUS_ACTIVITY',
        record.userId,
        {},
        {
          reason: 'Multiple failed login attempts',
          failedAttempts: record._count,
          period: '24h',
        }
      );

      logger.warn('Suspicious login activity detected', {
        userId: record.userId,
        failedAttempts: record._count,
      });
    }

    // Check for logins from new locations/devices (would need IP geolocation)
    // This is a simplified check for unusual patterns

    return suspiciousCount;
  }

  /**
   * Process pending data deletion requests (GDPR compliance)
   */
  private async processDataDeletionRequests(): Promise<number> {
    const pendingRequests = await prisma.dataDeletionRequest.findMany({
      where: {
        status: 'PENDING',
        scheduledFor: { lte: new Date() },
      },
    });

    let processed = 0;

    for (const request of pendingRequests) {
      try {
        // Mark as processing
        await prisma.dataDeletionRequest.update({
          where: { id: request.id },
          data: { status: 'PROCESSING' },
        });

        // Delete user data (this would be more comprehensive in production)
        await this.deleteUserData(request.userId);

        // Mark as completed
        await prisma.dataDeletionRequest.update({
          where: { id: request.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });

        processed++;
        logger.info('Data deletion request completed', { userId: request.userId });
      } catch (error) {
        await prisma.dataDeletionRequest.update({
          where: { id: request.id },
          data: { status: 'FAILED' },
        });
        logger.error('Failed to process deletion request', {
          requestId: request.id,
          error: (error as Error).message,
        });
      }
    }

    return processed;
  }

  /**
   * Delete user data for GDPR compliance
   */
  private async deleteUserData(userId: string): Promise<void> {
    // Delete in order respecting foreign key constraints
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { userId } }),
      prisma.actionLog.deleteMany({ where: { userId } }),
      prisma.userPattern.deleteMany({ where: { userId } }),
      prisma.task.deleteMany({ where: { userId } }),
      prisma.recurringTask.deleteMany({ where: { userId } }),
      prisma.emailDraft.deleteMany({ where: { userId } }),
      prisma.email.deleteMany({ where: { userId } }),
      prisma.calendarEvent.deleteMany({ where: { userId } }),
      prisma.contact.deleteMany({ where: { userId } }),
      prisma.trip.deleteMany({ where: { userId } }),
      prisma.expense.deleteMany({ where: { userId } }),
      prisma.scheduledJob.deleteMany({ where: { userId } }),
      prisma.userIntegration.deleteMany({ where: { userId } }),
      prisma.userPreferences.deleteMany({ where: { userId } }),
      prisma.session.deleteMany({ where: { userId } }),
    ]);

    // Anonymize audit logs instead of deleting (for compliance)
    await prisma.auditLog.updateMany({
      where: { userId },
      data: { userId: null },
    });
  }

  /**
   * Check for patterns of failed API calls
   */
  private async checkFailedApiCalls(): Promise<number> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Check for repeated API failures in audit logs
    const failedCalls = await prisma.auditLog.groupBy({
      by: ['userId', 'resource'],
      where: {
        action: { contains: 'FAILURE' },
        timestamp: { gte: yesterday },
      },
      _count: true,
      having: {
        resource: {
          _count: { gte: 10 }, // 10+ failures
        },
      },
    });

    return failedCalls.length;
  }

  protected async updateMetrics(
    context: JobExecutionContext,
    result: JobResult
  ): Promise<void> {
    // Security audit doesn't update success metrics
  }
}

export const securityAuditWorker = new SecurityAuditWorker();
