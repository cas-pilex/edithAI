import { prisma } from '../database/client.js';
import { logger, sanitizeForLogging } from '../utils/logger.js';
import type { AuditContext, AuditEntry } from '../types/index.js';
import type { SecurityEventType } from '@prisma/client';

class AuditService {
  /**
   * Log a general audit event
   */
  async log(entry: AuditEntry, context: AuditContext = {}): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: context.userId,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: sanitizeForLogging(entry.metadata || {}) as object,
        },
      });

      logger.debug('Audit log created', {
        action: entry.action,
        resource: entry.resource,
        userId: context.userId,
      });
    } catch (error) {
      // Don't throw - audit logging shouldn't break the main flow
      logger.error('Failed to create audit log', {
        error,
        entry: sanitizeForLogging(entry as unknown as Record<string, unknown>),
      });
    }
  }

  /**
   * Log data read access
   */
  async logRead(
    resource: string,
    resourceId: string | undefined,
    context: AuditContext,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log(
      {
        action: 'READ',
        resource,
        resourceId,
        metadata,
      },
      context
    );
  }

  /**
   * Log data creation
   */
  async logCreate(
    resource: string,
    resourceId: string,
    context: AuditContext,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log(
      {
        action: 'CREATE',
        resource,
        resourceId,
        metadata,
      },
      context
    );
  }

  /**
   * Log data update
   */
  async logUpdate(
    resource: string,
    resourceId: string,
    context: AuditContext,
    changes?: Record<string, unknown>
  ): Promise<void> {
    await this.log(
      {
        action: 'UPDATE',
        resource,
        resourceId,
        metadata: { changes },
      },
      context
    );
  }

  /**
   * Log data deletion
   */
  async logDelete(
    resource: string,
    resourceId: string,
    context: AuditContext,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log(
      {
        action: 'DELETE',
        resource,
        resourceId,
        metadata,
      },
      context
    );
  }

  /**
   * Log security events
   */
  async logSecurityEvent(
    eventType: SecurityEventType,
    userId: string | undefined,
    context: AuditContext,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      await prisma.securityEvent.create({
        data: {
          userId,
          eventType,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: sanitizeForLogging(metadata || {}) as object,
        },
      });

      const severity =
        eventType === 'SUSPICIOUS_ACTIVITY' || eventType === 'FAILED_LOGIN'
          ? 'warn'
          : 'info';

      logger.log(severity, `Security event: ${eventType}`, {
        userId,
        ipAddress: context.ipAddress,
      });
    } catch (error) {
      logger.error('Failed to log security event', { error, eventType });
    }
  }

  /**
   * Log AI agent action
   */
  async logAgentAction(
    userId: string,
    agentType: string,
    action: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    status: 'SUCCESS' | 'FAILURE' | 'PENDING_APPROVAL' | 'REJECTED',
    confidence?: number,
    duration?: number
  ): Promise<string> {
    const actionLog = await prisma.actionLog.create({
      data: {
        userId,
        agentType,
        action,
        input: sanitizeForLogging(input) as object,
        output: sanitizeForLogging(output) as object,
        status,
        confidence,
        duration,
      },
    });

    logger.info('AI agent action logged', {
      id: actionLog.id,
      agentType,
      action,
      status,
      userId,
    });

    return actionLog.id;
  }

  /**
   * Get audit logs for a user (GDPR export)
   */
  async getUserAuditLogs(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<unknown[]> {
    const where: {
      userId: string;
      timestamp?: { gte?: Date; lte?: Date };
    } = { userId };

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    return prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Get security events for a user
   */
  async getUserSecurityEvents(
    userId: string,
    limit: number = 100
  ): Promise<unknown[]> {
    return prisma.securityEvent.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Get AI agent actions for a user
   */
  async getUserAgentActions(
    userId: string,
    limit: number = 100
  ): Promise<unknown[]> {
    return prisma.actionLog.findMany({
      where: { userId },
      orderBy: { executedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Clean up old audit logs (data retention)
   */
  async cleanupOldLogs(retentionDays: number): Promise<{
    auditLogs: number;
    securityEvents: number;
    actionLogs: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Keep audit logs for 2 years minimum for GDPR compliance
    const minRetentionDate = new Date();
    minRetentionDate.setFullYear(minRetentionDate.getFullYear() - 2);

    const effectiveCutoff = cutoffDate < minRetentionDate ? minRetentionDate : cutoffDate;

    const [auditResult, securityResult, actionResult] = await Promise.all([
      prisma.auditLog.deleteMany({
        where: { timestamp: { lt: effectiveCutoff } },
      }),
      prisma.securityEvent.deleteMany({
        where: { timestamp: { lt: effectiveCutoff } },
      }),
      prisma.actionLog.deleteMany({
        where: { executedAt: { lt: effectiveCutoff } },
      }),
    ]);

    const result = {
      auditLogs: auditResult.count,
      securityEvents: securityResult.count,
      actionLogs: actionResult.count,
    };

    logger.info('Cleaned up old audit logs', result);

    return result;
  }

  /**
   * Export all audit data for compliance
   */
  async exportForCompliance(
    startDate: Date,
    endDate: Date
  ): Promise<{
    auditLogs: unknown[];
    securityEvents: unknown[];
    actionLogs: unknown[];
  }> {
    const [auditLogs, securityEvents, actionLogs] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          timestamp: { gte: startDate, lte: endDate },
        },
        orderBy: { timestamp: 'asc' },
      }),
      prisma.securityEvent.findMany({
        where: {
          timestamp: { gte: startDate, lte: endDate },
        },
        orderBy: { timestamp: 'asc' },
      }),
      prisma.actionLog.findMany({
        where: {
          executedAt: { gte: startDate, lte: endDate },
        },
        orderBy: { executedAt: 'asc' },
      }),
    ]);

    return { auditLogs, securityEvents, actionLogs };
  }
}

export const auditService = new AuditService();
export default auditService;
