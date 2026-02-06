import winston from 'winston';
import { config } from '../config/index.js';

const { combine, timestamp, json, errors, printf, colorize } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`;
  }
  if (stack) {
    log += `\n${stack}`;
  }
  return log;
});

// Create logger instance
export const logger = winston.createLogger({
  level: config.monitoring.logLevel,
  defaultMeta: {
    service: 'edith-backend',
    environment: config.env,
  },
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    config.isProduction ? json() : combine(colorize(), devFormat)
  ),
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

// Add file transports in production
if (config.isProduction) {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Utility functions
export function logRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  userId?: string
): void {
  logger.info('HTTP Request', {
    method,
    path,
    statusCode,
    duration: `${duration}ms`,
    userId,
  });
}

export function logError(error: Error, context?: Record<string, unknown>): void {
  logger.error(error.message, {
    stack: error.stack,
    ...context,
  });
}

export function logAudit(
  action: string,
  resource: string,
  userId?: string,
  metadata?: Record<string, unknown>
): void {
  logger.info('Audit', {
    action,
    resource,
    userId,
    ...metadata,
  });
}

export function logSecurity(
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  metadata?: Record<string, unknown>
): void {
  const logLevel = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
  logger.log(logLevel, `Security Event: ${event}`, {
    severity,
    ...metadata,
  });
}

export function logAI(
  agent: string,
  action: string,
  userId: string,
  metadata?: Record<string, unknown>
): void {
  logger.info('AI Action', {
    agent,
    action,
    userId,
    ...metadata,
  });
}

// Never log these fields
const sensitiveFields = [
  'password',
  'passwordHash',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'token',
  'authorization',
];

export function sanitizeForLogging(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export default logger;
