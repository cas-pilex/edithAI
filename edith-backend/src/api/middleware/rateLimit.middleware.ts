import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { config } from '../../config/index.js';
import { incrementRateLimit } from '../../database/redis.js';
import { sendError } from '../../utils/helpers.js';
import { logger } from '../../utils/logger.js';
import type { AuthenticatedRequest } from '../../types/index.js';

/**
 * Get client identifier for rate limiting
 */
function getClientIdentifier(req: Request): string {
  const authReq = req as AuthenticatedRequest;

  // Use user ID if authenticated
  if (authReq.userId) {
    return `user:${authReq.userId}`;
  }

  // Fall back to IP address
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor.split(',')[0];
    return `ip:${ips.trim()}`;
  }

  return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
}

/**
 * Standard rate limiter using express-rate-limit
 */
export const standardRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: 'Too many requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIdentifier,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      identifier: getClientIdentifier(req),
      path: req.path,
    });
    sendError(res, 'Too many requests, please try again later', 429);
  },
});

/**
 * Strict rate limiter for auth endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIdentifier,
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      identifier: getClientIdentifier(req),
      path: req.path,
    });
    sendError(res, 'Too many authentication attempts, please try again later', 429);
  },
});

/**
 * Very strict rate limiter for password reset
 */
export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  message: {
    success: false,
    error: 'Too many password reset attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIdentifier,
  handler: (req, res) => {
    logger.warn('Password reset rate limit exceeded', {
      identifier: getClientIdentifier(req),
    });
    sendError(res, 'Too many password reset attempts, please try again later', 429);
  },
});

/**
 * API rate limiter for high-frequency endpoints
 */
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: {
    success: false,
    error: 'API rate limit exceeded',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIdentifier,
});

/**
 * Custom Redis-based rate limiter for more control
 */
export async function customRateLimit(
  req: Request,
  res: Response,
  limit: number,
  windowSeconds: number,
  keyPrefix: string = 'ratelimit'
): Promise<boolean> {
  const identifier = getClientIdentifier(req);
  const key = `${keyPrefix}:${identifier}`;

  try {
    const { count, resetAt } = await incrementRateLimit(key, windowSeconds);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));

    if (count > limit) {
      logger.warn('Custom rate limit exceeded', {
        identifier,
        key,
        count,
        limit,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Rate limit check failed', { error });
    // Fail open - allow request if rate limiting fails
    return true;
  }
}

/**
 * Middleware factory for custom rate limiting
 */
export function createRateLimiter(limit: number, windowSeconds: number, keyPrefix?: string) {
  return async (req: Request, res: Response, next: () => void): Promise<void> => {
    const allowed = await customRateLimit(req, res, limit, windowSeconds, keyPrefix);

    if (!allowed) {
      sendError(res, 'Rate limit exceeded', 429);
      return;
    }

    next();
  };
}
