/**
 * Approval API Routes
 * Provides endpoints for managing approval workflows
 */

import { Router } from 'express';
import type { Router as RouterType, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { sendSuccess, sendError } from '../../utils/helpers.js';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../types/index.js';
import { approvalService, learningService } from '../../services/index.js';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';

const router: RouterType = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const approveSchema = z.object({
  feedback: z.string().optional(),
  modifications: z.record(z.unknown()).optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(1).max(500),
  suggestedAlternative: z.string().optional(),
});

const bulkActionSchema = z.object({
  ids: z.array(z.string()).min(1).max(50),
  action: z.enum(['approve', 'reject']),
  feedback: z.string().optional(),
});

// ============================================================================
// Middleware
// ============================================================================

// All routes require authentication
router.use(authenticate);

// ============================================================================
// Approval List Routes
// ============================================================================

/**
 * GET /api/approvals/pending
 * Get all pending approvals for the current user
 */
router.get(
  '/pending',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const approvals = await approvalService.getPendingForUser(req.userId);

      // Sort by expiration date (most urgent first)
      const sorted = approvals.sort((a, b) => {
        const aExpires = new Date(a.expiresAt).getTime();
        const bExpires = new Date(b.expiresAt).getTime();
        return aExpires - bExpires;
      });

      sendSuccess(res, {
        approvals: sorted,
        count: sorted.length,
      });
    } catch (error) {
      logger.error('Failed to get pending approvals', { error, userId: req.userId });
      sendError(res, error instanceof Error ? error.message : 'Failed to get approvals', 500);
    }
  }
);

/**
 * GET /api/approvals/history
 * Get approval history for the current user
 */
router.get(
  '/history',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const status = req.query.status as string | undefined;

      const history = await approvalService.getHistory(req.userId, {
        limit: Math.min(limit, 100),
        status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | undefined,
      });

      sendSuccess(res, {
        approvals: history,
        total: history.length,
        limit,
      });
    } catch (error) {
      logger.error('Failed to get approval history', { error, userId: req.userId });
      sendError(res, error instanceof Error ? error.message : 'Failed to get history', 500);
    }
  }
);

/**
 * GET /api/approvals/stats
 * Get approval statistics for the current user
 */
router.get(
  '/stats',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const stats = await approvalService.getStats(req.userId);

      sendSuccess(res, stats);
    } catch (error) {
      logger.error('Failed to get approval stats', { error, userId: req.userId });
      sendError(res, error instanceof Error ? error.message : 'Failed to get stats', 500);
    }
  }
);

// ============================================================================
// Individual Approval Routes
// ============================================================================

/**
 * GET /api/approvals/:id
 * Get a specific approval request
 */
router.get(
  '/:id',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const id = req.params.id;
      if (Array.isArray(id)) {
        sendError(res, 'Invalid approval ID', 400);
        return;
      }

      const approval = await approvalService.getById(id, req.userId);

      if (!approval) {
        sendError(res, 'Approval request not found', 404);
        return;
      }

      sendSuccess(res, approval);
    } catch (error) {
      logger.error('Failed to get approval', { error, userId: req.userId, approvalId: req.params.id });
      sendError(res, error instanceof Error ? error.message : 'Failed to get approval', 500);
    }
  }
);

/**
 * POST /api/approvals/:id/approve
 * Approve a pending action
 */
router.post(
  '/:id/approve',
  validateBody(approveSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const id = req.params.id;
      if (Array.isArray(id)) {
        sendError(res, 'Invalid approval ID', 400);
        return;
      }

      const { feedback, modifications } = req.body;

      // Get the approval to verify ownership
      const approval = await approvalService.getById(id, req.userId);
      if (!approval) {
        sendError(res, 'Approval request not found', 404);
        return;
      }

      if (approval.approvalStatus !== 'PENDING') {
        sendError(res, `Approval is already ${approval.approvalStatus.toLowerCase()}`, 400);
        return;
      }

      // Execute the approval
      let result;
      if (modifications) {
        result = await approvalService.approveWithModifications(id, req.userId, modifications, feedback);
      } else {
        result = await approvalService.approve(id, req.userId, feedback);
      }

      // Record for learning
      await learningService.processApprovalFeedback(
        req.userId,
        approval.agentType,
        approval.action,
        {
          requestId: id,
          approved: true,
          feedback,
        }
      );

      logger.info('Approval granted', {
        userId: req.userId,
        approvalId: id,
        action: approval.action,
      });

      sendSuccess(res, {
        message: 'Action approved and executed',
        result,
      });
    } catch (error) {
      logger.error('Failed to approve action', { error, userId: req.userId, approvalId: req.params.id });
      sendError(res, error instanceof Error ? error.message : 'Failed to approve', 500);
    }
  }
);

/**
 * POST /api/approvals/:id/reject
 * Reject a pending action
 */
router.post(
  '/:id/reject',
  validateBody(rejectSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const id = req.params.id;
      if (Array.isArray(id)) {
        sendError(res, 'Invalid approval ID', 400);
        return;
      }

      const { reason } = req.body;

      // Get the approval to verify ownership
      const approval = await approvalService.getById(id, req.userId);
      if (!approval) {
        sendError(res, 'Approval request not found', 404);
        return;
      }

      if (approval.approvalStatus !== 'PENDING') {
        sendError(res, `Approval is already ${approval.approvalStatus.toLowerCase()}`, 400);
        return;
      }

      // Execute the rejection
      await approvalService.reject(id, req.userId, reason);

      // Record for learning
      await learningService.processApprovalFeedback(
        req.userId,
        approval.agentType,
        approval.action,
        {
          requestId: id,
          approved: false,
          feedback: reason,
        }
      );

      logger.info('Approval rejected', {
        userId: req.userId,
        approvalId: id,
        action: approval.action,
        reason,
      });

      sendSuccess(res, { message: 'Action rejected' });
    } catch (error) {
      logger.error('Failed to reject action', { error, userId: req.userId, approvalId: req.params.id });
      sendError(res, error instanceof Error ? error.message : 'Failed to reject', 500);
    }
  }
);

/**
 * POST /api/approvals/:id/modify
 * Modify and approve a pending action
 */
router.post(
  '/:id/modify',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const id = req.params.id;
      if (Array.isArray(id)) {
        sendError(res, 'Invalid approval ID', 400);
        return;
      }

      const { modifications, feedback } = req.body;

      if (!modifications || typeof modifications !== 'object') {
        sendError(res, 'Modifications object is required', 400);
        return;
      }

      // Get the approval to verify ownership
      const approval = await approvalService.getById(id, req.userId);
      if (!approval) {
        sendError(res, 'Approval request not found', 404);
        return;
      }

      if (approval.approvalStatus !== 'PENDING') {
        sendError(res, `Approval is already ${approval.approvalStatus.toLowerCase()}`, 400);
        return;
      }

      // Execute the approval with modifications
      const result = await approvalService.approveWithModifications(id, req.userId, modifications, feedback);

      // Record the correction for learning
      const proposedAction = approval.details?.proposedAction || {};
      await learningService.recordCorrection(
        req.userId,
        id,
        proposedAction,
        { ...proposedAction, ...modifications }
      );

      logger.info('Approval modified and granted', {
        userId: req.userId,
        approvalId: id,
        action: approval.action,
        hasModifications: true,
      });

      sendSuccess(res, {
        message: 'Action modified and executed',
        result,
      });
    } catch (error) {
      logger.error('Failed to modify approval', { error, userId: req.userId, approvalId: req.params.id });
      sendError(res, error instanceof Error ? error.message : 'Failed to modify', 500);
    }
  }
);

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * POST /api/approvals/bulk
 * Perform bulk approve/reject operations
 */
router.post(
  '/bulk',
  validateBody(bulkActionSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const { ids, action, feedback } = req.body;

      const results = {
        successful: [] as string[],
        failed: [] as { id: string; error: string }[],
      };

      for (const id of ids) {
        try {
          // Verify ownership
          const approval = await approvalService.getById(id, req.userId);
          if (!approval) {
            results.failed.push({ id, error: 'Not found' });
            continue;
          }

          if (approval.approvalStatus !== 'PENDING') {
            results.failed.push({ id, error: `Already ${approval.approvalStatus.toLowerCase()}` });
            continue;
          }

          if (action === 'approve') {
            await approvalService.approve(id, req.userId, feedback);
          } else {
            await approvalService.reject(id, req.userId, feedback || 'Bulk rejection');
          }

          results.successful.push(id);

          // Record for learning
          await learningService.processApprovalFeedback(
            req.userId,
            approval.agentType,
            approval.action,
            {
              requestId: id,
              approved: action === 'approve',
              feedback,
            }
          );
        } catch (err) {
          results.failed.push({ id, error: err instanceof Error ? err.message : 'Unknown error' });
        }
      }

      logger.info('Bulk approval operation completed', {
        userId: req.userId,
        action,
        successful: results.successful.length,
        failed: results.failed.length,
      });

      sendSuccess(res, {
        message: `${action === 'approve' ? 'Approved' : 'Rejected'} ${results.successful.length} of ${ids.length} items`,
        results,
      });
    } catch (error) {
      logger.error('Failed bulk approval operation', { error, userId: req.userId });
      sendError(res, error instanceof Error ? error.message : 'Failed bulk operation', 500);
    }
  }
);

/**
 * GET /api/approvals/preferences
 * Get approval notification preferences
 */
router.get(
  '/preferences',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      // Get from user preferences
      const preferences = await prisma.userPreferences.findUnique({
        where: { userId: req.userId },
        select: {
          preferredChannel: true,
          quietHoursStart: true,
          quietHoursEnd: true,
        },
      });

      sendSuccess(res, {
        channels: preferences?.preferredChannel ? [preferences.preferredChannel.toLowerCase()] : ['in_app'],
        quietHours: preferences?.quietHoursStart && preferences?.quietHoursEnd
          ? {
              start: preferences.quietHoursStart,
              end: preferences.quietHoursEnd,
            }
          : null,
      });
    } catch (error) {
      logger.error('Failed to get approval preferences', { error, userId: req.userId });
      sendError(res, error instanceof Error ? error.message : 'Failed to get preferences', 500);
    }
  }
);

export default router;
