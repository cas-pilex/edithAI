/**
 * Tasks API Routes
 * Full CRUD operations for task management
 */

import { Router } from 'express';
import type { Router as RouterType, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody, validateUUID } from '../middleware/validation.middleware.js';
import { taskService } from '../../services/TaskService.js';
import { sendSuccess, sendPaginated, sendError } from '../../utils/helpers.js';
import { NotFoundError } from '../../utils/errors.js';
import {
  createTaskSchema,
  updateTaskSchema,
  bulkTasksSchema,
} from '../../utils/validation.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const router: RouterType = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * GET /tasks
 * List tasks with filters and pagination
 */
router.get(
  '/',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { page, limit, status, priority, tags, dueBefore, dueAfter, source } = req.query;

      const pageNum = Number(page) || 1;
      const limitNum = Math.min(Number(limit) || 20, 100);
      const offset = (pageNum - 1) * limitNum;

      // Parse filters
      const parsedFilters = {
        status: status as string | undefined,
        priority: priority as string | undefined,
        tags: tags ? String(tags).split(',') : undefined,
        dueBefore: dueBefore ? new Date(String(dueBefore)) : undefined,
        dueAfter: dueAfter ? new Date(String(dueAfter)) : undefined,
        source: source as string | undefined,
      };

      const { tasks, total } = await taskService.getTasks(
        userId,
        parsedFilters,
        { limit: limitNum, offset }
      );

      sendPaginated(res, tasks, pageNum, limitNum, total);
    } catch (error) {
      logger.error('Failed to get tasks', { error });
      sendError(res, 'Failed to retrieve tasks', 500);
    }
  }
);

/**
 * GET /tasks/stats
 * Get task statistics
 */
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { startDate, endDate } = req.query;

    const stats = await taskService.getStats(
      userId,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    sendSuccess(res, stats);
  } catch (error) {
    logger.error('Failed to get task stats', { error });
    sendError(res, 'Failed to retrieve task statistics', 500);
  }
});

/**
 * GET /tasks/overdue
 * Get overdue tasks
 */
router.get('/overdue', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const tasks = await taskService.getOverdueTasks(userId);
    sendSuccess(res, tasks);
  } catch (error) {
    logger.error('Failed to get overdue tasks', { error });
    sendError(res, 'Failed to retrieve overdue tasks', 500);
  }
});

/**
 * GET /tasks/today
 * Get tasks due today
 */
router.get('/today', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const tasks = await taskService.getTasksDueToday(userId);
    sendSuccess(res, tasks);
  } catch (error) {
    logger.error('Failed to get tasks due today', { error });
    sendError(res, 'Failed to retrieve tasks due today', 500);
  }
});

/**
 * GET /tasks/tags
 * Get all tags used by user
 */
router.get('/tags', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const tags = await taskService.getTags(userId);
    sendSuccess(res, tags);
  } catch (error) {
    logger.error('Failed to get task tags', { error });
    sendError(res, 'Failed to retrieve tags', 500);
  }
});

/**
 * GET /tasks/:id
 * Get a single task by ID
 */
router.get(
  '/:id',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      const task = await taskService.getTaskById(id, userId);

      if (!task) {
        throw new NotFoundError('Task');
      }

      sendSuccess(res, task);
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to get task', { error, taskId: req.params.id });
      sendError(res, 'Failed to retrieve task', 500);
    }
  }
);

/**
 * POST /tasks
 * Create a new task
 */
router.post(
  '/',
  validateBody(createTaskSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const data = req.body;

      const task = await taskService.createTask(userId, {
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      });

      sendSuccess(res, task, 'Task created successfully', 201);
    } catch (error) {
      logger.error('Failed to create task', { error });
      sendError(res, 'Failed to create task', 500);
    }
  }
);

/**
 * PATCH /tasks/:id
 * Update a task
 */
router.patch(
  '/:id',
  validateUUID('id'),
  validateBody(updateTaskSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const data = req.body;

      // Check if task exists
      const existing = await taskService.getTaskById(id, userId);
      if (!existing) {
        throw new NotFoundError('Task');
      }

      await taskService.updateTask(id, userId, {
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : data.dueDate,
      });

      // Fetch updated task
      const updated = await taskService.getTaskById(id, userId);
      sendSuccess(res, updated, 'Task updated successfully');
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to update task', { error, taskId: req.params.id });
      sendError(res, 'Failed to update task', 500);
    }
  }
);

/**
 * DELETE /tasks/:id
 * Delete a task
 */
router.delete(
  '/:id',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      await taskService.deleteTask(id, userId);
      sendSuccess(res, { deleted: true }, 'Task deleted successfully');
    } catch (error) {
      if (error instanceof Error && error.message === 'Task not found') {
        sendError(res, 'Task not found', 404);
        return;
      }
      logger.error('Failed to delete task', { error, taskId: req.params.id });
      sendError(res, 'Failed to delete task', 500);
    }
  }
);

/**
 * POST /tasks/:id/complete
 * Mark a task as complete
 */
router.post(
  '/:id/complete',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      const task = await taskService.completeTask(id, userId);
      sendSuccess(res, task, 'Task marked as complete');
    } catch (error) {
      if (error instanceof Error && error.message === 'Task not found') {
        sendError(res, 'Task not found', 404);
        return;
      }
      logger.error('Failed to complete task', { error, taskId: req.params.id });
      sendError(res, 'Failed to complete task', 500);
    }
  }
);

/**
 * POST /tasks/:id/reopen
 * Reopen a completed task
 */
router.post(
  '/:id/reopen',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      // Check if task exists
      const existing = await taskService.getTaskById(id, userId);
      if (!existing) {
        throw new NotFoundError('Task');
      }

      await taskService.updateTask(id, userId, { status: 'TODO' });

      const updated = await taskService.getTaskById(id, userId);
      sendSuccess(res, updated, 'Task reopened');
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to reopen task', { error, taskId: req.params.id });
      sendError(res, 'Failed to reopen task', 500);
    }
  }
);

/**
 * POST /tasks/bulk
 * Bulk operations on tasks
 */
router.post(
  '/bulk',
  validateBody(bulkTasksSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { action, taskIds, priority, tag } = req.body;

      let result: { count: number };

      switch (action) {
        case 'complete':
          // Complete each task
          for (const taskId of taskIds) {
            await taskService.completeTask(taskId, userId).catch(() => {
              // Skip tasks that don't exist or are already completed
            });
          }
          result = { count: taskIds.length };
          break;

        case 'delete':
          // Delete each task
          let deleteCount = 0;
          for (const taskId of taskIds) {
            try {
              await taskService.deleteTask(taskId, userId);
              deleteCount++;
            } catch {
              // Skip tasks that don't exist
            }
          }
          result = { count: deleteCount };
          break;

        case 'updatePriority':
          if (!priority) {
            sendError(res, 'Priority is required for updatePriority action', 400);
            return;
          }
          result = await taskService.bulkUpdatePriority(taskIds, userId, priority);
          break;

        case 'addTag':
          if (!tag) {
            sendError(res, 'Tag is required for addTag action', 400);
            return;
          }
          // Add tag to each task
          for (const taskId of taskIds) {
            const task = await taskService.getTaskById(taskId, userId);
            if (task) {
              const existingTags = task.tags as string[] || [];
              if (!existingTags.includes(tag)) {
                await taskService.updateTask(taskId, userId, {
                  tags: [...existingTags, tag],
                });
              }
            }
          }
          result = { count: taskIds.length };
          break;

        default:
          sendError(res, `Unknown action: ${action}`, 400);
          return;
      }

      sendSuccess(res, result, `Bulk ${action} completed`);
    } catch (error) {
      logger.error('Bulk task operation failed', { error });
      sendError(res, 'Bulk operation failed', 500);
    }
  }
);

export default router;
