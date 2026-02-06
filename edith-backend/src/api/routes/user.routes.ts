import { Router } from 'express';
import type { Router as RouterType, Response } from 'express';
import { userService } from '../../services/UserService.js';
import { authenticate, getAuditContext } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { auditSensitiveOperation } from '../middleware/audit.middleware.js';
import { updateProfileSchema, updatePreferencesSchema } from '../../utils/validation.js';
import { sendSuccess, sendError } from '../../utils/helpers.js';
import type { AuthenticatedRequest } from '../../types/index.js';

const router: RouterType = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/user/profile
 * Get current user profile
 */
router.get('/profile', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 'User not found', 404);
      return;
    }

    const user = await userService.getUserWithPreferences(req.userId);

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    sendSuccess(res, user);
  } catch (error) {
    sendError(res, error instanceof Error ? error.message : 'Failed to get profile', 500);
  }
});

/**
 * PATCH /api/user/profile
 * Update current user profile
 */
router.patch(
  '/profile',
  validateBody(updateProfileSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not found', 404);
        return;
      }

      const context = getAuditContext(req);
      const user = await userService.updateProfile(req.userId, req.body, context);

      sendSuccess(res, user, 'Profile updated successfully');
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Failed to update profile', 400);
    }
  }
);

/**
 * GET /api/user/preferences
 * Get user preferences
 */
router.get('/preferences', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 'User not found', 404);
      return;
    }

    const preferences = await userService.getPreferences(req.userId);

    if (!preferences) {
      sendError(res, 'Preferences not found', 404);
      return;
    }

    sendSuccess(res, preferences);
  } catch (error) {
    sendError(res, error instanceof Error ? error.message : 'Failed to get preferences', 500);
  }
});

/**
 * PATCH /api/user/preferences
 * Update user preferences
 */
router.patch(
  '/preferences',
  validateBody(updatePreferencesSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not found', 404);
        return;
      }

      const context = getAuditContext(req);
      const preferences = await userService.updatePreferences(req.userId, req.body, context);

      sendSuccess(res, preferences, 'Preferences updated successfully');
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Failed to update preferences', 400);
    }
  }
);

/**
 * GET /api/user/export
 * Export all user data (GDPR)
 */
router.get(
  '/export',
  auditSensitiveOperation('DATA_EXPORT'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not found', 404);
        return;
      }

      const context = getAuditContext(req);
      const data = await userService.exportUserData(req.userId, context);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="edith-data-export-${new Date().toISOString()}.json"`
      );

      res.json(data);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Failed to export data', 500);
    }
  }
);

/**
 * DELETE /api/user/account
 * Delete user account (GDPR - Right to be Forgotten)
 */
router.delete(
  '/account',
  auditSensitiveOperation('ACCOUNT_DELETION'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not found', 404);
        return;
      }

      const context = getAuditContext(req);
      await userService.deleteAccount(req.userId, context);

      sendSuccess(res, null, 'Account deleted successfully');
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Failed to delete account', 500);
    }
  }
);

export default router;
