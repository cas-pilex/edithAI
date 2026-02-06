/**
 * Agent API Routes
 * Provides endpoints for AI agent interactions, chat, and agent management
 */

import { Router } from 'express';
import type { Router as RouterType, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { sendSuccess, sendError } from '../../utils/helpers.js';
import { z } from 'zod';
import type { AuthenticatedRequest, AgentDomain } from '../../types/index.js';
import { orchestratorAgent, registerAllTools } from '../../agents/index.js';
import { agentMemoryService, approvalService, learningService } from '../../services/index.js';
import { userService } from '../../services/UserService.js';
import { logger } from '../../utils/logger.js';

const router: RouterType = Router();

// Register all agent tools on startup
registerAllTools().catch(err => {
  logger.error('Failed to register agent tools', { error: err });
});

// ============================================================================
// Validation Schemas
// ============================================================================

const chatMessageSchema = z.object({
  message: z.string().min(1).max(10000),
  sessionId: z.string().optional(),
  domain: z.enum(['inbox', 'calendar', 'crm', 'travel', 'tasks', 'meeting_prep']).optional(),
});

const feedbackSchema = z.object({
  actionId: z.string(),
  rating: z.enum(['positive', 'negative', 'neutral']),
  feedback: z.string().optional(),
  correction: z.record(z.unknown()).optional(),
});

// ============================================================================
// Middleware
// ============================================================================

// All routes require authentication
router.use(authenticate);

// ============================================================================
// Chat Routes
// ============================================================================

/**
 * POST /api/chat
 * Main chat endpoint - processes user message through orchestrator
 */
router.post(
  '/',
  validateBody(chatMessageSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const { message, sessionId, domain } = req.body;

      // Build enhanced context for the agent
      const user = await userService.getUserWithPreferences(req.userId);
      if (!user) {
        sendError(res, 'User not found', 404);
        return;
      }

      // Create context with memory
      const context = await agentMemoryService.createEnhancedContext(
        req.userId,
        (domain as AgentDomain) || 'orchestrator',
        sessionId
      );

      logger.info('Processing chat message', {
        userId: req.userId,
        sessionId,
        domain,
        messageLength: message.length,
      });

      // Process through orchestrator
      const result = await orchestratorAgent.process(context, message, sessionId);

      // Log action for learning
      if (result.success) {
        await agentMemoryService.storeAction({
          userId: req.userId,
          agentType: 'orchestrator',
          action: 'chat',
          input: { message, domain },
          output: { response: result.data },
          success: true,
          domain: (domain as AgentDomain) || 'orchestrator',
        });
      }

      sendSuccess(res, {
        response: result.data,
        success: result.success,
        requiresApproval: result.requiresApproval,
        approvalId: result.approvalId,
        confidence: result.confidence,
        toolsUsed: result.toolsUsed,
        sessionId: sessionId || context.sessionId,
      });
    } catch (error) {
      logger.error('Chat processing error', { error, userId: req.userId });
      sendError(res, error instanceof Error ? error.message : 'Failed to process message', 500);
    }
  }
);

/**
 * POST /api/chat/stream
 * Streaming chat endpoint - processes message with real-time streaming
 * Note: Uses non-streaming process with chunked response for now
 */
router.post(
  '/stream',
  validateBody(chatMessageSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const { message, sessionId, domain } = req.body;

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Create context
      const context = await agentMemoryService.createEnhancedContext(
        req.userId,
        (domain as AgentDomain) || 'orchestrator',
        sessionId
      );

      logger.info('Starting streaming chat', {
        userId: req.userId,
        sessionId,
        domain,
      });

      // Send initial connection event
      res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

      // Process through orchestrator (non-streaming for now)
      const result = await orchestratorAgent.process(context, message, sessionId);

      // Send text chunk
      res.write(`data: ${JSON.stringify({ type: 'text', content: result.data })}\n\n`);

      // Send final result
      res.write(`data: ${JSON.stringify({
        type: 'done',
        content: JSON.stringify({
          success: result.success,
          requiresApproval: result.requiresApproval,
          approvalId: result.approvalId,
          toolsUsed: result.toolsUsed,
        }),
      })}\n\n`);

      // Log action
      if (result.success) {
        await agentMemoryService.storeAction({
          userId: req.userId,
          agentType: 'orchestrator',
          action: 'chat_stream',
          input: { message, domain },
          output: { response: result.data },
          success: true,
          domain: (domain as AgentDomain) || 'orchestrator',
        });
      }

      res.end();
    } catch (error) {
      logger.error('Streaming chat error', { error, userId: req.userId });

      // Send error event if possible
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', content: 'Processing failed' })}\n\n`);
        res.end();
      } catch {
        // Response might already be closed
      }
    }
  }
);

// ============================================================================
// Agent Memory Routes
// ============================================================================

/**
 * GET /api/agents/:domain/actions
 * Get recent actions for a specific agent domain
 */
router.get(
  '/:domain/actions',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const domain = req.params.domain as AgentDomain;
      const validDomains: AgentDomain[] = ['inbox', 'calendar', 'crm', 'travel', 'tasks', 'meeting_prep', 'orchestrator'];

      if (!validDomains.includes(domain)) {
        sendError(res, 'Invalid agent domain', 400);
        return;
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const actions = await agentMemoryService.getRecentActions(req.userId, domain, Math.min(limit, 100));

      sendSuccess(res, { actions, domain, count: actions.length });
    } catch (error) {
      logger.error('Failed to get agent actions', { error, userId: req.userId });
      sendError(res, error instanceof Error ? error.message : 'Failed to get actions', 500);
    }
  }
);

/**
 * GET /api/agents/:domain/context
 * Get the current context for a specific agent domain
 */
router.get(
  '/:domain/context',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const domain = req.params.domain as AgentDomain;
      const validDomains: AgentDomain[] = ['inbox', 'calendar', 'crm', 'travel', 'tasks', 'meeting_prep', 'orchestrator'];

      if (!validDomains.includes(domain)) {
        sendError(res, 'Invalid agent domain', 400);
        return;
      }

      const context = await agentMemoryService.getContextForAgent(req.userId, domain);

      sendSuccess(res, { context, domain });
    } catch (error) {
      logger.error('Failed to get agent context', { error, userId: req.userId });
      sendError(res, error instanceof Error ? error.message : 'Failed to get context', 500);
    }
  }
);

/**
 * DELETE /api/agents/:domain/memory
 * Clear memory for a specific agent domain (or all if domain is 'all')
 */
router.delete(
  '/:domain/memory',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const domain = req.params.domain;

      if (domain === 'all') {
        await agentMemoryService.clearAllMemory(req.userId);
        sendSuccess(res, null, 'All agent memory cleared');
      } else {
        const validDomains: AgentDomain[] = ['inbox', 'calendar', 'crm', 'travel', 'tasks', 'meeting_prep', 'orchestrator'];

        if (!validDomains.includes(domain as AgentDomain)) {
          sendError(res, 'Invalid agent domain', 400);
          return;
        }

        await agentMemoryService.clearDomainMemory(req.userId, domain as AgentDomain);
        sendSuccess(res, null, `Memory cleared for ${domain} agent`);
      }
    } catch (error) {
      logger.error('Failed to clear agent memory', { error, userId: req.userId });
      sendError(res, error instanceof Error ? error.message : 'Failed to clear memory', 500);
    }
  }
);

// ============================================================================
// Learning & Feedback Routes
// ============================================================================

/**
 * POST /api/agents/feedback
 * Submit feedback for an agent action
 */
router.post(
  '/feedback',
  validateBody(feedbackSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const { actionId, rating, feedback, correction } = req.body;

      // Record the feedback for learning
      if (correction) {
        await learningService.recordCorrection(req.userId, actionId, {}, correction);
      }

      // Process the feedback
      await learningService.processApprovalFeedback(
        req.userId,
        'feedback',
        'user_feedback',
        {
          requestId: actionId,
          approved: rating === 'positive' || rating === 'neutral',
          feedback,
        }
      );

      logger.info('Agent feedback recorded', { userId: req.userId, actionId, rating });

      sendSuccess(res, null, 'Feedback recorded successfully');
    } catch (error) {
      logger.error('Failed to record feedback', { error, userId: req.userId });
      sendError(res, error instanceof Error ? error.message : 'Failed to record feedback', 500);
    }
  }
);

/**
 * GET /api/agents/patterns
 * Get detected user patterns
 */
router.get(
  '/patterns',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const patterns = await learningService.getPatterns(req.userId);
      const communicationStyle = await learningService.inferCommunicationStyle(req.userId);
      const schedulingPrefs = await learningService.inferSchedulingPreferences(req.userId);

      sendSuccess(res, {
        patterns,
        inferences: {
          communicationStyle,
          schedulingPreferences: schedulingPrefs,
        },
      });
    } catch (error) {
      logger.error('Failed to get patterns', { error, userId: req.userId });
      sendError(res, error instanceof Error ? error.message : 'Failed to get patterns', 500);
    }
  }
);

/**
 * POST /api/agents/patterns/detect
 * Trigger pattern detection for the user
 */
router.post(
  '/patterns/detect',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const patterns = await learningService.detectPatterns(req.userId);

      logger.info('Pattern detection completed', { userId: req.userId, patternsFound: patterns.length });

      sendSuccess(res, { patterns, message: `Detected ${patterns.length} patterns` });
    } catch (error) {
      logger.error('Failed to detect patterns', { error, userId: req.userId });
      sendError(res, error instanceof Error ? error.message : 'Failed to detect patterns', 500);
    }
  }
);

// ============================================================================
// Agent Status Routes
// ============================================================================

/**
 * GET /api/agents/status
 * Get status of all agents
 */
router.get(
  '/status',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const agentDomains: AgentDomain[] = ['inbox', 'calendar', 'crm', 'travel', 'tasks', 'meeting_prep'];

      const status = await Promise.all(
        agentDomains.map(async (domain) => {
          const recentActions = await agentMemoryService.getRecentActions(req.userId!, domain, 1);
          return {
            domain,
            available: true,
            lastAction: recentActions[0]?.timestamp || null,
          };
        })
      );

      // Get pending approvals count
      const pendingApprovals = await approvalService.getPendingForUser(req.userId);

      sendSuccess(res, {
        agents: status,
        pendingApprovals: pendingApprovals.length,
        orchestratorReady: true,
      });
    } catch (error) {
      logger.error('Failed to get agent status', { error, userId: req.userId });
      sendError(res, error instanceof Error ? error.message : 'Failed to get status', 500);
    }
  }
);

/**
 * GET /api/agents/rate-limit
 * Get current rate limit status for AI calls
 */
router.get(
  '/rate-limit',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not authenticated', 401);
        return;
      }

      const { checkAIRateLimit } = await import('../../database/redis.js');
      const rateLimit = await checkAIRateLimit(req.userId);

      sendSuccess(res, {
        allowed: rateLimit.allowed,
        remaining: rateLimit.remaining,
        limit: 100,
        resetAt: rateLimit.resetAt,
        current: rateLimit.current,
      });
    } catch (error) {
      logger.error('Failed to get rate limit', { error, userId: req.userId });
      sendError(res, error instanceof Error ? error.message : 'Failed to get rate limit', 500);
    }
  }
);

export default router;
