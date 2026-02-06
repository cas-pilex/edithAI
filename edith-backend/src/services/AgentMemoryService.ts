/**
 * AgentMemoryService
 * Manages short-term (Redis) and long-term (PostgreSQL) memory for agents
 */

import { prisma } from '../database/client.js';
import {
  storeRecentAction,
  getRecentActions,
  clearAgentMemory,
  cacheGet,
  cacheSet,
} from '../database/redis.js';
import { logger } from '../utils/logger.js';
import type {
  AgentDomain,
  RecentAction,
  UserPatternData,
  EnhancedAgentContext,
} from '../types/agent.types.js';
import type { AIAgentContext } from '../types/index.js';
import type { ActionStatus } from '@prisma/client';

export interface AgentContextData {
  recentActions: RecentAction[];
  patterns: UserPatternData[];
  sessionContext?: Record<string, unknown>;
}

export interface ActionLogInput {
  userId: string;
  agentType: string;
  action: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  success: boolean;
  error?: string;
  duration?: number;
  sessionId?: string;
  domain?: AgentDomain;
  reasoning?: string;
  confidence?: number;
}

class AgentMemoryServiceImpl {
  /**
   * Get recent actions for a user in a specific domain
   */
  async getRecentActions(
    userId: string,
    domain: AgentDomain,
    limit: number = 20
  ): Promise<RecentAction[]> {
    return getRecentActions<RecentAction>(userId, domain, limit);
  }

  /**
   * Store an action in memory
   */
  async storeAction(input: ActionLogInput): Promise<void> {
    const status: ActionStatus = input.success ? 'SUCCESS' : 'FAILURE';

    const actionRecord: RecentAction = {
      id: crypto.randomUUID(),
      agentType: input.agentType,
      action: input.action,
      summary: `${input.action} - ${input.success ? 'succeeded' : 'failed'}`,
      input: input.input,
      output: input.output,
      timestamp: new Date(),
      status: input.success ? 'SUCCESS' : 'FAILURE',
      confidence: input.confidence,
    };

    // Store in Redis for quick access (if domain provided)
    if (input.domain) {
      await storeRecentAction(input.userId, input.domain, actionRecord);
    }

    // Store in PostgreSQL for long-term learning
    await prisma.actionLog.create({
      data: {
        userId: input.userId,
        agentType: input.agentType,
        action: input.action,
        input: input.input as object,
        output: (input.output || {}) as object,
        status,
        confidence: input.confidence,
        duration: input.duration,
      },
    });

    logger.debug('Action stored in memory', {
      userId: input.userId,
      domain: input.domain,
      action: input.action,
    });
  }

  /**
   * Get full context for an agent
   */
  async getContextForAgent(
    userId: string,
    domain: AgentDomain,
    sessionId?: string
  ): Promise<AgentContextData> {
    // Get recent actions from Redis
    const recentActions = await this.getRecentActions(userId, domain);

    // Get learned patterns from database
    const patterns = await prisma.userPattern.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: { confidence: 'desc' },
      take: 10,
    });

    // Get session context if available
    let sessionContext: Record<string, unknown> | undefined;
    if (sessionId) {
      sessionContext = await cacheGet<Record<string, unknown>>(`session:context:${sessionId}`) || undefined;
    }

    return {
      recentActions,
      patterns: patterns.map(p => ({
        id: p.id,
        type: p.patternType,
        data: p.patternData as Record<string, unknown>,
        confidence: p.confidence,
        occurrences: p.occurrences,
      })),
      sessionContext,
    };
  }

  /**
   * Create an enhanced context from basic context
   */
  async createEnhancedContext(
    userId: string,
    domain: AgentDomain,
    sessionId?: string,
    requestId?: string
  ): Promise<EnhancedAgentContext> {
    // Get user preferences
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        timezone: true,
        preferences: true,
      },
    });

    const contextData = await this.getContextForAgent(
      userId,
      domain,
      sessionId
    );

    const basicContext: AIAgentContext = {
      userId,
      userEmail: user?.email || '',
      userName: user?.name || '',
      timezone: user?.timezone || 'UTC',
      preferences: (user?.preferences || {}) as Record<string, unknown>,
    };

    return {
      ...basicContext,
      sessionId: sessionId || crypto.randomUUID(),
      requestId: requestId || crypto.randomUUID(),
      domain,
      recentActions: contextData.recentActions,
      patterns: contextData.patterns,
    };
  }

  /**
   * Store session context
   */
  async setSessionContext(
    sessionId: string,
    context: Record<string, unknown>
  ): Promise<void> {
    await cacheSet(`session:context:${sessionId}`, context, 3600);
  }

  /**
   * Update session context
   */
  async updateSessionContext(
    sessionId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const existing = await cacheGet<Record<string, unknown>>(`session:context:${sessionId}`);
    const updated = { ...existing, ...updates };
    await cacheSet(`session:context:${sessionId}`, updated, 3600);
  }

  /**
   * Get session context
   */
  async getSessionContext(sessionId: string): Promise<Record<string, unknown> | null> {
    return cacheGet<Record<string, unknown>>(`session:context:${sessionId}`);
  }

  /**
   * Clear memory for a user (all domains)
   */
  async clearMemory(userId: string, domain?: AgentDomain): Promise<void> {
    await clearAgentMemory(userId, domain);
    logger.info('Agent memory cleared', { userId, domain });
  }

  /**
   * Clear all memory for a user
   */
  async clearAllMemory(userId: string): Promise<void> {
    const domains: AgentDomain[] = ['inbox', 'calendar', 'crm', 'travel', 'tasks', 'meeting_prep', 'orchestrator'];
    await Promise.all(domains.map(d => clearAgentMemory(userId, d)));
    logger.info('All agent memory cleared', { userId });
  }

  /**
   * Clear memory for a specific domain
   */
  async clearDomainMemory(userId: string, domain: AgentDomain): Promise<void> {
    await clearAgentMemory(userId, domain);
    logger.info('Domain memory cleared', { userId, domain });
  }

  /**
   * Get action history from database
   */
  async getActionHistory(
    userId: string,
    options: {
      domain?: AgentDomain;
      agentType?: string;
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      successOnly?: boolean;
    } = {}
  ): Promise<{
    actions: Array<{
      id: string;
      agentType: string;
      action: string;
      input: unknown;
      output: unknown;
      status: ActionStatus;
      duration: number | null;
      executedAt: Date;
    }>;
    total: number;
  }> {
    const { limit = 50, offset = 0, startDate, endDate, successOnly, agentType } = options;

    const where: Record<string, unknown> = { userId };

    if (agentType) {
      where.agentType = agentType;
    }

    if (successOnly !== undefined) {
      where.status = successOnly ? 'SUCCESS' : 'FAILURE';
    }

    if (startDate || endDate) {
      where.executedAt = {};
      if (startDate) {
        (where.executedAt as Record<string, Date>).gte = startDate;
      }
      if (endDate) {
        (where.executedAt as Record<string, Date>).lte = endDate;
      }
    }

    const [actions, total] = await Promise.all([
      prisma.actionLog.findMany({
        where,
        orderBy: { executedAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          agentType: true,
          action: true,
          input: true,
          output: true,
          status: true,
          duration: true,
          executedAt: true,
        },
      }),
      prisma.actionLog.count({ where }),
    ]);

    return { actions, total };
  }

  /**
   * Get action statistics for a user
   */
  async getActionStats(
    userId: string,
    options: {
      domain?: AgentDomain;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    averageDuration: number;
    actionsByAgent: Record<string, number>;
    actionsByType: Record<string, number>;
  }> {
    const { startDate, endDate } = options;

    const where: Record<string, unknown> = { userId };

    if (startDate || endDate) {
      where.executedAt = {};
      if (startDate) {
        (where.executedAt as Record<string, Date>).gte = startDate;
      }
      if (endDate) {
        (where.executedAt as Record<string, Date>).lte = endDate;
      }
    }

    const [total, successful, failed, actions] = await Promise.all([
      prisma.actionLog.count({ where }),
      prisma.actionLog.count({ where: { ...where, status: 'SUCCESS' } }),
      prisma.actionLog.count({ where: { ...where, status: 'FAILURE' } }),
      prisma.actionLog.findMany({
        where,
        select: {
          agentType: true,
          action: true,
          duration: true,
        },
      }),
    ]);

    // Calculate average duration
    const validDurations = actions.filter(a => a.duration !== null);
    const totalDuration = validDurations.reduce((sum, a) => sum + (a.duration || 0), 0);
    const averageDuration = validDurations.length > 0 ? totalDuration / validDurations.length : 0;

    // Group by agent type
    const actionsByAgent: Record<string, number> = {};
    for (const action of actions) {
      actionsByAgent[action.agentType] = (actionsByAgent[action.agentType] || 0) + 1;
    }

    // Group by action type
    const actionsByType: Record<string, number> = {};
    for (const action of actions) {
      actionsByType[action.action] = (actionsByType[action.action] || 0) + 1;
    }

    return {
      totalActions: total,
      successfulActions: successful,
      failedActions: failed,
      averageDuration,
      actionsByAgent,
      actionsByType,
    };
  }

  /**
   * Prune old action logs (for maintenance)
   */
  async pruneOldLogs(olderThanDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.actionLog.deleteMany({
      where: {
        executedAt: { lt: cutoffDate },
      },
    });

    logger.info('Pruned old action logs', {
      deletedCount: result.count,
      olderThan: cutoffDate.toISOString(),
    });

    return result.count;
  }
}

export const agentMemoryService = new AgentMemoryServiceImpl();
export default agentMemoryService;
