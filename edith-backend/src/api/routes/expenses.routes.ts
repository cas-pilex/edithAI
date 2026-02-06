/**
 * Expenses API Routes
 * Expense tracking and management
 */

import { Router } from 'express';
import type { Router as RouterType, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody, validateUUID } from '../middleware/validation.middleware.js';
import { expenseService } from '../../services/ExpenseService.js';
import { sendSuccess, sendPaginated, sendError } from '../../utils/helpers.js';
import { NotFoundError } from '../../utils/errors.js';
import {
  createExpenseSchema,
  updateExpenseSchema,
  expenseReportSchema,
} from '../../utils/validation.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const router: RouterType = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * GET /expenses
 * List expenses with filters and pagination
 */
router.get(
  '/',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { page, limit, category, status, startDate, endDate, minAmount, maxAmount, tripId } = req.query;

      const pageNum = Number(page) || 1;
      const limitNum = Math.min(Number(limit) || 20, 100);
      const offset = (pageNum - 1) * limitNum;

      // Parse filters
      const parsedFilters = {
        category: category as string | undefined,
        status: status as string | undefined,
        tripId: tripId as string | undefined,
        startDate: startDate ? new Date(String(startDate)) : undefined,
        endDate: endDate ? new Date(String(endDate)) : undefined,
        minAmount: minAmount ? Number(minAmount) : undefined,
        maxAmount: maxAmount ? Number(maxAmount) : undefined,
      };

      const { expenses, total } = await expenseService.getExpenses(
        userId,
        parsedFilters,
        { limit: limitNum, offset }
      );

      sendPaginated(res, expenses, pageNum, limitNum, total);
    } catch (error) {
      logger.error('Failed to get expenses', { error });
      sendError(res, 'Failed to retrieve expenses', 500);
    }
  }
);

/**
 * GET /expenses/summary
 * Get expense summary/statistics
 */
router.get('/summary', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { startDate, endDate } = req.query;

    const stats = await expenseService.getStats(
      userId,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    sendSuccess(res, stats);
  } catch (error) {
    logger.error('Failed to get expense summary', { error });
    sendError(res, 'Failed to retrieve expense summary', 500);
  }
});

/**
 * GET /expenses/categories
 * Get all expense categories used
 */
router.get('/categories', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const categories = await expenseService.getCategories(userId);
    sendSuccess(res, categories);
  } catch (error) {
    logger.error('Failed to get expense categories', { error });
    sendError(res, 'Failed to retrieve expense categories', 500);
  }
});

/**
 * POST /expenses/export
 * Export expenses as report
 */
router.post(
  '/export',
  validateBody(expenseReportSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { startDate, endDate, groupBy, format } = req.body;

      const report = await expenseService.generateReport(
        userId,
        new Date(startDate),
        new Date(endDate),
        { groupBy }
      );

      // TODO: Implement PDF/CSV generation based on format
      // For now, return JSON report
      sendSuccess(res, {
        ...report,
        format: format || 'json',
        exportedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to export expenses', { error });
      sendError(res, 'Failed to export expenses', 500);
    }
  }
);

/**
 * GET /expenses/:id
 * Get a single expense by ID
 */
router.get(
  '/:id',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      const expense = await expenseService.getExpenseById(id, userId);

      if (!expense) {
        throw new NotFoundError('Expense');
      }

      sendSuccess(res, expense);
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to get expense', { error, expenseId: req.params.id });
      sendError(res, 'Failed to retrieve expense', 500);
    }
  }
);

/**
 * POST /expenses
 * Create a new expense
 */
router.post(
  '/',
  validateBody(createExpenseSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const data = req.body;

      const expense = await expenseService.createExpense(userId, {
        ...data,
        date: new Date(data.date),
      });

      sendSuccess(res, expense, 'Expense created successfully', 201);
    } catch (error) {
      logger.error('Failed to create expense', { error });
      sendError(res, 'Failed to create expense', 500);
    }
  }
);

/**
 * PATCH /expenses/:id
 * Update an expense
 */
router.patch(
  '/:id',
  validateUUID('id'),
  validateBody(updateExpenseSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const data = req.body;

      // Check if expense exists
      const existing = await expenseService.getExpenseById(id, userId);
      if (!existing) {
        throw new NotFoundError('Expense');
      }

      await expenseService.updateExpense(id, userId, {
        ...data,
        date: data.date ? new Date(data.date) : undefined,
      });

      const updated = await expenseService.getExpenseById(id, userId);
      sendSuccess(res, updated, 'Expense updated successfully');
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to update expense', { error, expenseId: req.params.id });
      sendError(res, 'Failed to update expense', 500);
    }
  }
);

/**
 * DELETE /expenses/:id
 * Delete an expense
 */
router.delete(
  '/:id',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      await expenseService.deleteExpense(id, userId);
      sendSuccess(res, { deleted: true }, 'Expense deleted successfully');
    } catch (error) {
      if (error instanceof Error && error.message === 'Expense not found') {
        sendError(res, 'Expense not found', 404);
        return;
      }
      logger.error('Failed to delete expense', { error, expenseId: req.params.id });
      sendError(res, 'Failed to delete expense', 500);
    }
  }
);

/**
 * POST /expenses/:id/receipt
 * Upload receipt for an expense
 */
router.post(
  '/:id/receipt',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const { receiptUrl } = req.body;

      // Check if expense exists
      const existing = await expenseService.getExpenseById(id, userId);
      if (!existing) {
        throw new NotFoundError('Expense');
      }

      // TODO: Implement actual file upload handling
      // For now, accept a URL
      if (!receiptUrl) {
        sendError(res, 'Receipt URL is required', 400);
        return;
      }

      await expenseService.updateExpense(id, userId, { receiptUrl });

      const updated = await expenseService.getExpenseById(id, userId);
      sendSuccess(res, updated, 'Receipt uploaded successfully');
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to upload receipt', { error, expenseId: req.params.id });
      sendError(res, 'Failed to upload receipt', 500);
    }
  }
);

/**
 * POST /expenses/:id/categorize
 * Categorize an expense
 */
router.post(
  '/:id/categorize',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const { category } = req.body;

      if (!category) {
        sendError(res, 'Category is required', 400);
        return;
      }

      const result = await expenseService.categorizeExpense(id, userId, category);

      if (result.count === 0) {
        sendError(res, 'Expense not found or not in pending status', 404);
        return;
      }

      const updated = await expenseService.getExpenseById(id, userId);
      sendSuccess(res, updated, 'Expense categorized successfully');
    } catch (error) {
      logger.error('Failed to categorize expense', { error, expenseId: req.params.id });
      sendError(res, 'Failed to categorize expense', 500);
    }
  }
);

/**
 * POST /expenses/:id/approve
 * Approve an expense
 */
router.post(
  '/:id/approve',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      const expense = await expenseService.approveExpense(id, userId);
      sendSuccess(res, expense, 'Expense approved successfully');
    } catch (error) {
      logger.error('Failed to approve expense', { error, expenseId: req.params.id });
      sendError(res, 'Failed to approve expense', 500);
    }
  }
);

/**
 * POST /expenses/reimburse
 * Mark expenses as reimbursed
 */
router.post('/reimburse', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { expenseIds } = req.body;

    if (!expenseIds || !Array.isArray(expenseIds) || expenseIds.length === 0) {
      sendError(res, 'Expense IDs are required', 400);
      return;
    }

    const result = await expenseService.markReimbursed(expenseIds, userId);
    sendSuccess(res, result, 'Expenses marked as reimbursed');
  } catch (error) {
    logger.error('Failed to mark expenses as reimbursed', { error });
    sendError(res, 'Failed to mark expenses as reimbursed', 500);
  }
});

export default router;
