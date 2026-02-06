import type { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { sendError } from '../../utils/helpers.js';
import { logger } from '../../utils/logger.js';

/**
 * Validate request body against a Zod schema
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.body);

      if (!result.success) {
        const errors = result.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        logger.debug('Validation failed', { errors, path: req.path });

        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors,
        });
        return;
      }

      req.body = result.data;
      next();
    } catch (error) {
      logger.error('Validation error', { error });
      sendError(res, 'Invalid request body', 400);
    }
  };
}

/**
 * Validate request query parameters against a Zod schema
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.query);

      if (!result.success) {
        const errors = result.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: errors,
        });
        return;
      }

      req.query = result.data as typeof req.query;
      next();
    } catch (error) {
      logger.error('Query validation error', { error });
      sendError(res, 'Invalid query parameters', 400);
    }
  };
}

/**
 * Validate request params against a Zod schema
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.params);

      if (!result.success) {
        const errors = result.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        res.status(400).json({
          success: false,
          error: 'Invalid path parameters',
          details: errors,
        });
        return;
      }

      req.params = result.data as typeof req.params;
      next();
    } catch (error) {
      logger.error('Params validation error', { error });
      sendError(res, 'Invalid path parameters', 400);
    }
  };
}

/**
 * Validate UUID parameter
 */
export function validateUUID(paramName: string = 'id') {
  const uuidSchema = z.object({
    [paramName]: z.string().uuid(`Invalid ${paramName} format`),
  });

  return validateParams(uuidSchema);
}

/**
 * Sanitize string to prevent XSS
 */
export function sanitizeString(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'string'
          ? sanitizeString(item)
          : typeof item === 'object' && item !== null
            ? sanitizeObject(item as Record<string, unknown>)
            : item
      );
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Middleware to sanitize request body
 */
export function sanitizeBody(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}
