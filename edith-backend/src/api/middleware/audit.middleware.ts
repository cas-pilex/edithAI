import type { Response, NextFunction } from 'express';
import { auditService } from '../../services/AuditService.js';
import { logRequest } from '../../utils/logger.js';
import { getAuditContext } from './auth.middleware.js';
import type { AuthenticatedRequest } from '../../types/index.js';

/**
 * Log all API requests
 */
export function requestLogger(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Capture original end function
  const originalEnd = res.end.bind(res);

  // Override end to log after response
  res.end = function (
    chunk?: Buffer | string | (() => void),
    encodingOrCallback?: BufferEncoding | (() => void),
    callback?: () => void
  ): Response {
    const duration = Date.now() - startTime;

    // Log the request
    logRequest(req.method, req.path, res.statusCode, duration, req.userId);

    // Call original end with proper argument handling
    if (typeof chunk === 'function') {
      return originalEnd(chunk);
    } else if (typeof encodingOrCallback === 'function') {
      return originalEnd(chunk, encodingOrCallback);
    } else if (encodingOrCallback) {
      return originalEnd(chunk, encodingOrCallback, callback);
    } else {
      return originalEnd(chunk);
    }
  };

  next();
}

/**
 * Audit all data access for specific routes
 */
export function auditDataAccess(resource: string) {
  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    const context = getAuditContext(req);
    const rawResourceId = req.params.id;
    const resourceId = Array.isArray(rawResourceId) ? rawResourceId[0] : rawResourceId;

    // Determine action from HTTP method
    let action: string;
    switch (req.method) {
      case 'GET':
        action = 'READ';
        break;
      case 'POST':
        action = 'CREATE';
        break;
      case 'PUT':
      case 'PATCH':
        action = 'UPDATE';
        break;
      case 'DELETE':
        action = 'DELETE';
        break;
      default:
        action = req.method;
    }

    // Log before processing
    await auditService.log(
      {
        action,
        resource,
        resourceId,
        metadata: {
          path: req.path,
          query: req.query,
        },
      },
      context
    );

    next();
  };
}

/**
 * Audit sensitive operations (password changes, data export, etc.)
 */
export function auditSensitiveOperation(operation: string) {
  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    const context = getAuditContext(req);

    await auditService.log(
      {
        action: 'SENSITIVE_OPERATION',
        resource: operation,
        metadata: {
          path: req.path,
          method: req.method,
        },
      },
      context
    );

    next();
  };
}

/**
 * Track API usage for analytics
 */
export function trackAPIUsage(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  // Store start time for later use
  _res.locals.startTime = Date.now();
  _res.locals.userId = req.userId;

  next();
}
