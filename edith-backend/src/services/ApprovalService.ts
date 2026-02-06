/**
 * ApprovalService
 * Handles the approval workflow for agent actions that require user confirmation
 * Uses Notification model with approval status stored in data field
 */

import { prisma } from '../database/client.js';
import { logger } from '../utils/logger.js';
import type { ApprovalCategory, ApprovalStatus, ApprovalDetails } from '../types/agent.types.js';

export interface CreateApprovalInput {
  userId: string;
  agentType: string;
  action: string;
  toolName: string;
  category: ApprovalCategory;
  confidence: number;
  description: string;
  details: ApprovalDetails;
  expiresInMinutes?: number;
}

export interface ApprovalWithDetails {
  id: string;
  userId: string;
  agentType: string;
  action: string;
  toolName: string;
  category: ApprovalCategory;
  confidence: number;
  description: string;
  details: ApprovalDetails;
  expiresAt: Date;
  approvalStatus: ApprovalStatus;
  createdAt: Date;
  decidedAt?: Date;
  decidedBy?: 'USER' | 'AUTO' | 'TIMEOUT';
  feedback?: string;
}

interface ApprovalDecisionResult {
  requestId: string;
  approved: boolean;
  feedback?: string;
  modifications?: Record<string, unknown>;
}

class ApprovalServiceImpl {
  /**
   * Create a new approval request
   */
  async createRequest(data: CreateApprovalInput): Promise<ApprovalWithDetails> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + (data.expiresInMinutes || 60));

    const notification = await prisma.notification.create({
      data: {
        userId: data.userId,
        type: 'APPROVAL_REQUEST',
        title: `Approval Required: ${data.action}`,
        body: data.description,
        data: {
          agentType: data.agentType,
          action: data.action,
          toolName: data.toolName,
          category: data.category,
          confidence: data.confidence,
          details: data.details,
          expiresAt: expiresAt.toISOString(),
          approvalStatus: 'PENDING',
        } as object,
        status: 'PENDING',
      },
    });

    logger.info('Approval request created', {
      approvalId: notification.id,
      userId: data.userId,
      agentType: data.agentType,
      action: data.action,
      category: data.category,
    });

    return {
      id: notification.id,
      userId: data.userId,
      agentType: data.agentType,
      action: data.action,
      toolName: data.toolName,
      category: data.category,
      confidence: data.confidence,
      description: data.description,
      details: data.details,
      expiresAt,
      approvalStatus: 'PENDING',
      createdAt: notification.createdAt,
    };
  }

  /**
   * Get all pending approvals for a user
   */
  async getPendingForUser(userId: string): Promise<ApprovalWithDetails[]> {
    const notifications = await prisma.notification.findMany({
      where: {
        userId,
        type: 'APPROVAL_REQUEST',
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter for those with PENDING approval status in data
    return notifications
      .map(n => this.notificationToApproval(n))
      .filter(a => a.approvalStatus === 'PENDING');
  }

  /**
   * Get a specific approval request
   */
  async getById(id: string, userId: string): Promise<ApprovalWithDetails | null> {
    const notification = await prisma.notification.findFirst({
      where: {
        id,
        userId,
        type: 'APPROVAL_REQUEST',
      },
    });

    if (!notification) return null;

    return this.notificationToApproval(notification);
  }

  /**
   * Approve an action
   */
  async approve(
    requestId: string,
    userId: string,
    feedback?: string
  ): Promise<ApprovalDecisionResult> {
    const notification = await prisma.notification.findFirst({
      where: {
        id: requestId,
        userId,
        type: 'APPROVAL_REQUEST',
        status: 'PENDING',
      },
    });

    if (!notification) {
      throw new Error('Approval request not found or already processed');
    }

    const data = notification.data as Record<string, unknown>;

    if (data.approvalStatus !== 'PENDING') {
      throw new Error('Approval request has already been processed');
    }

    const expiresAt = data.expiresAt ? new Date(data.expiresAt as string) : null;

    if (expiresAt && expiresAt < new Date()) {
      await this.markExpired(requestId, data);
      throw new Error('Approval request has expired');
    }

    await prisma.notification.update({
      where: { id: requestId },
      data: {
        status: 'READ',
        readAt: new Date(),
        data: {
          ...data,
          approvalStatus: 'APPROVED',
          decidedAt: new Date().toISOString(),
          decidedBy: 'USER',
          feedback,
        } as object,
      },
    });

    logger.info('Approval granted', {
      approvalId: requestId,
      userId,
      action: data.action,
    });

    return {
      requestId,
      approved: true,
      feedback,
    };
  }

  /**
   * Reject an action
   */
  async reject(
    requestId: string,
    userId: string,
    feedback?: string
  ): Promise<ApprovalDecisionResult> {
    const notification = await prisma.notification.findFirst({
      where: {
        id: requestId,
        userId,
        type: 'APPROVAL_REQUEST',
        status: 'PENDING',
      },
    });

    if (!notification) {
      throw new Error('Approval request not found or already processed');
    }

    const data = notification.data as Record<string, unknown>;

    if (data.approvalStatus !== 'PENDING') {
      throw new Error('Approval request has already been processed');
    }

    await prisma.notification.update({
      where: { id: requestId },
      data: {
        status: 'READ',
        readAt: new Date(),
        data: {
          ...data,
          approvalStatus: 'REJECTED',
          decidedAt: new Date().toISOString(),
          decidedBy: 'USER',
          feedback,
        } as object,
      },
    });

    logger.info('Approval rejected', {
      approvalId: requestId,
      userId,
      action: data.action,
      feedback,
    });

    return {
      requestId,
      approved: false,
      feedback,
    };
  }

  /**
   * Approve with modifications
   */
  async approveWithModifications(
    requestId: string,
    userId: string,
    modifications: Record<string, unknown>,
    feedback?: string
  ): Promise<ApprovalDecisionResult> {
    const notification = await prisma.notification.findFirst({
      where: {
        id: requestId,
        userId,
        type: 'APPROVAL_REQUEST',
        status: 'PENDING',
      },
    });

    if (!notification) {
      throw new Error('Approval request not found or already processed');
    }

    const data = notification.data as Record<string, unknown>;

    if (data.approvalStatus !== 'PENDING') {
      throw new Error('Approval request has already been processed');
    }

    await prisma.notification.update({
      where: { id: requestId },
      data: {
        status: 'READ',
        readAt: new Date(),
        data: {
          ...data,
          approvalStatus: 'APPROVED',
          decidedAt: new Date().toISOString(),
          decidedBy: 'USER',
          feedback,
          modifications,
        } as object,
      },
    });

    logger.info('Approval granted with modifications', {
      approvalId: requestId,
      userId,
      action: data.action,
    });

    return {
      requestId,
      approved: true,
      feedback,
      modifications,
    };
  }

  /**
   * Mark an approval as expired (internal helper)
   */
  private async markExpired(requestId: string, data: Record<string, unknown>): Promise<void> {
    await prisma.notification.update({
      where: { id: requestId },
      data: {
        status: 'READ',
        data: {
          ...data,
          approvalStatus: 'EXPIRED',
          decidedAt: new Date().toISOString(),
          decidedBy: 'TIMEOUT',
        } as object,
      },
    });
  }

  /**
   * Expire old approval requests (for cron job)
   */
  async expireOld(): Promise<number> {
    const now = new Date();

    // Find all pending approvals
    const pendingApprovals = await prisma.notification.findMany({
      where: {
        type: 'APPROVAL_REQUEST',
        status: 'PENDING',
      },
    });

    let expiredCount = 0;

    for (const approval of pendingApprovals) {
      const data = approval.data as Record<string, unknown>;

      if (data.approvalStatus !== 'PENDING') continue;

      const expiresAt = data.expiresAt ? new Date(data.expiresAt as string) : null;

      if (expiresAt && expiresAt < now) {
        await this.markExpired(approval.id, data);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      logger.info('Expired old approval requests', { count: expiredCount });
    }

    return expiredCount;
  }

  /**
   * Get approval statistics for a user
   */
  async getStats(userId: string): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    expired: number;
    total: number;
  }> {
    const approvals = await prisma.notification.findMany({
      where: {
        userId,
        type: 'APPROVAL_REQUEST',
      },
    });

    let pending = 0, approved = 0, rejected = 0, expired = 0;

    for (const approval of approvals) {
      const data = approval.data as Record<string, unknown>;
      const status = data.approvalStatus as string;

      switch (status) {
        case 'PENDING': pending++; break;
        case 'APPROVED': approved++; break;
        case 'REJECTED': rejected++; break;
        case 'EXPIRED': expired++; break;
      }
    }

    return {
      pending,
      approved,
      rejected,
      expired,
      total: pending + approved + rejected + expired,
    };
  }

  /**
   * Get recent approval history for a user
   */
  async getHistory(
    userId: string,
    options: {
      limit?: number;
      status?: ApprovalStatus;
      agentType?: string;
    } = {}
  ): Promise<ApprovalWithDetails[]> {
    const { limit = 50, status, agentType } = options;

    const notifications = await prisma.notification.findMany({
      where: {
        userId,
        type: 'APPROVAL_REQUEST',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    let results = notifications.map(n => this.notificationToApproval(n));

    // Filter by approval status if specified
    if (status) {
      results = results.filter(a => a.approvalStatus === status);
    }

    // Filter by agent type if specified
    if (agentType) {
      results = results.filter(a => a.agentType === agentType);
    }

    return results;
  }

  /**
   * Execute a pending approval (call the original action)
   */
  async executeApproved(
    requestId: string,
    userId: string
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const approval = await this.getById(requestId, userId);

    if (!approval) {
      return { success: false, error: 'Approval not found' };
    }

    if (approval.approvalStatus !== 'APPROVED') {
      return { success: false, error: 'Approval is not in approved state' };
    }

    // The actual execution would be handled by the agent system
    // This method is just for checking if execution is allowed
    logger.info('Executing approved action', {
      approvalId: requestId,
      userId,
      action: approval.action,
    });

    return { success: true };
  }

  /**
   * Convert a notification to an ApprovalWithDetails object
   */
  private notificationToApproval(notification: {
    id: string;
    userId: string;
    type: string;
    title: string;
    body: string | null;
    data: unknown;
    status: string;
    createdAt: Date;
  }): ApprovalWithDetails {
    const data = notification.data as Record<string, unknown>;
    const details = (data.details as ApprovalDetails) || {
      proposedAction: {},
      reasoning: '',
      impact: { type: 'LOW', affectedAreas: [] },
      isReversible: true,
      relatedEntities: [],
    };

    return {
      id: notification.id,
      userId: notification.userId,
      agentType: (data.agentType as string) || 'unknown',
      action: (data.action as string) || 'unknown',
      toolName: (data.toolName as string) || 'unknown',
      category: (data.category as ApprovalCategory) || 'REQUEST_APPROVAL',
      confidence: (data.confidence as number) || 0.5,
      description: notification.body || '',
      details,
      expiresAt: data.expiresAt ? new Date(data.expiresAt as string) : new Date(),
      approvalStatus: (data.approvalStatus as ApprovalStatus) || 'PENDING',
      createdAt: notification.createdAt,
      decidedAt: data.decidedAt ? new Date(data.decidedAt as string) : undefined,
      decidedBy: data.decidedBy as 'USER' | 'AUTO' | 'TIMEOUT' | undefined,
      feedback: data.feedback as string | undefined,
    };
  }
}

export const approvalService = new ApprovalServiceImpl();
export default approvalService;
