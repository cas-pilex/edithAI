import { Router } from 'express';
import type { Router as RouterType, Response } from 'express';
import { authService } from '../../services/AuthService.js';
import { authenticate, getAuditContext } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { authRateLimit, passwordResetRateLimit } from '../middleware/rateLimit.middleware.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../../utils/validation.js';
import { sendSuccess, sendError } from '../../utils/helpers.js';
import type { AuthenticatedRequest } from '../../types/index.js';

const router: RouterType = Router();

/**
 * POST /api/auth/register
 * Create a new user account
 */
router.post(
  '/register',
  authRateLimit,
  validateBody(registerSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const context = getAuditContext(req);
      const user = await authService.register(req.body, context);
      sendSuccess(res, user, 'Account created successfully', 201);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Registration failed', 400);
    }
  }
);

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post(
  '/login',
  authRateLimit,
  validateBody(loginSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { email, password } = req.body;
      const context = getAuditContext(req);
      const result = await authService.login(email, password, context);
      sendSuccess(res, result, 'Login successful');
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Login failed', 401);
    }
  }
);

/**
 * POST /api/auth/logout
 * Logout current session
 */
router.post(
  '/logout',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { refreshToken } = req.body;
      const context = getAuditContext(req);

      if (refreshToken && req.userId) {
        await authService.logout(req.userId, refreshToken, context);
      }

      sendSuccess(res, null, 'Logged out successfully');
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Logout failed', 400);
    }
  }
);

/**
 * POST /api/auth/logout-all
 * Logout from all sessions
 */
router.post(
  '/logout-all',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const context = getAuditContext(req);

      if (req.userId) {
        await authService.logoutAll(req.userId, context);
      }

      sendSuccess(res, null, 'Logged out from all sessions');
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Logout failed', 400);
    }
  }
);

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post(
  '/refresh',
  validateBody(refreshTokenSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { refreshToken } = req.body;
      const context = getAuditContext(req);
      const tokens = await authService.refreshToken(refreshToken, context);
      sendSuccess(res, tokens, 'Token refreshed successfully');
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Token refresh failed', 401);
    }
  }
);

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post(
  '/forgot-password',
  passwordResetRateLimit,
  validateBody(forgotPasswordSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { email } = req.body;
      const context = getAuditContext(req);
      const result = await authService.requestPasswordReset(email, context);
      sendSuccess(res, { message: result });
    } catch (error) {
      // Don't reveal if email exists
      sendSuccess(res, { message: 'If an account exists, a reset email will be sent' });
    }
  }
);

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post(
  '/reset-password',
  passwordResetRateLimit,
  validateBody(resetPasswordSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { token, password } = req.body;
      const context = getAuditContext(req);
      await authService.resetPassword(token, password, context);
      sendSuccess(res, null, 'Password reset successfully');
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Password reset failed', 400);
    }
  }
);

/**
 * GET /api/auth/me
 * Get current user
 */
router.get(
  '/me',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        sendError(res, 'User not found', 404);
        return;
      }

      const user = await authService.getCurrentUser(req.userId);

      if (!user) {
        sendError(res, 'User not found', 404);
        return;
      }

      sendSuccess(res, user);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Failed to get user', 500);
    }
  }
);

export default router;
