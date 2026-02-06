import type { Response, NextFunction } from 'express';
import { authService } from '../../services/AuthService.js';
import { sendError } from '../../utils/helpers.js';
import type { AuthenticatedRequest, JWTPayload } from '../../types/index.js';

/**
 * Authenticate request with JWT token
 */
export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      sendError(res, 'Authorization header is required', 401);
      return;
    }

    if (!authHeader.startsWith('Bearer ')) {
      sendError(res, 'Invalid authorization format. Use: Bearer <token>', 401);
      return;
    }

    const token = authHeader.substring(7);

    if (!token) {
      sendError(res, 'Access token is required', 401);
      return;
    }

    const payload = authService.verifyAccessToken(token);
    req.user = payload;
    req.userId = payload.userId;

    next();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        sendError(res, 'Access token has expired', 401);
        return;
      }
      sendError(res, error.message, 401);
      return;
    }
    sendError(res, 'Authentication failed', 401);
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    if (!token) {
      next();
      return;
    }

    const payload = authService.verifyAccessToken(token);
    req.user = payload;
    req.userId = payload.userId;
  } catch {
    // Ignore errors for optional auth
  }

  next();
}

/**
 * Require specific role(s)
 */
export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Authentication required', 401);
      return;
    }

    if (!roles.includes(req.user.role)) {
      sendError(res, 'Insufficient permissions', 403);
      return;
    }

    next();
  };
}

/**
 * Require admin role
 */
export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    sendError(res, 'Authentication required', 401);
    return;
  }

  if (req.user.role !== 'ADMIN') {
    sendError(res, 'Admin access required', 403);
    return;
  }

  next();
}

/**
 * Extract user info from request for audit context
 */
export function getAuditContext(req: AuthenticatedRequest) {
  const userAgent = req.headers['user-agent'];
  return {
    userId: req.userId,
    ipAddress: getClientIP(req),
    userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
  };
}

/**
 * Get client IP address
 */
function getClientIP(req: AuthenticatedRequest): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor.split(',')[0];
    return ips.trim();
  }

  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return Array.isArray(realIP) ? realIP[0] : realIP;
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Type guard to check if request is authenticated
 */
export function isAuthenticated(
  req: AuthenticatedRequest
): req is AuthenticatedRequest & { user: JWTPayload; userId: string } {
  return !!req.user && !!req.userId;
}
