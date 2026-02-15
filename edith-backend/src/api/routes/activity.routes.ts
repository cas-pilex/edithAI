/**
 * Activity Log Routes
 * Exposes AI agent action history and statistics
 */

import { Router } from 'express';
import type { Router as RouterType } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { agentMemoryService } from '../../services/AgentMemoryService.js';
import { logger } from '../../utils/logger.js';
import type { AuthenticatedRequest } from '../../types/index.js';

const router: RouterType = Router();

// All routes require authentication
router.use(authenticate as never);

/**
 * GET /api/activity/log
 * Get paginated action history with filters
 */
router.get('/log', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const {
      agentType,
      status,
      startDate,
      endDate,
      page = '1',
      limit = '20',
    } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(1, parseInt(page || '1', 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit || '20', 10)));
    const offset = (pageNum - 1) * limitNum;

    const result = await agentMemoryService.getActionHistory(userId, {
      agentType: agentType || undefined,
      status: status || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limitNum,
      offset,
    });

    res.json({
      data: result.actions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: result.total,
        totalPages: Math.ceil(result.total / limitNum),
      },
    });
  } catch (error) {
    logger.error('Failed to fetch activity log', { error });
    res.status(500).json({ error: 'Failed to fetch activity log' });
  }
});

/**
 * GET /api/activity/stats
 * Get aggregated action statistics
 */
router.get('/stats', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;

    const stats = await agentMemoryService.getActionStats(userId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.json({ data: stats });
  } catch (error) {
    logger.error('Failed to fetch activity stats', { error });
    res.status(500).json({ error: 'Failed to fetch activity stats' });
  }
});

export default router;
