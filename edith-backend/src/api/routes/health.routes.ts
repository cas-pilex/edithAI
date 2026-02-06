import { Router } from 'express';
import type { Router as RouterType, Request, Response } from 'express';
import { checkDatabaseHealth } from '../../database/client.js';
import { checkRedisHealth } from '../../database/redis.js';
import type { HealthStatus } from '../../types/index.js';

const router: RouterType = Router();

const VERSION = '1.0.0';
const startTime = Date.now();

/**
 * GET /health
 * Full health check with service status
 */
router.get('/', async (_req: Request, res: Response) => {
  const [dbHealth, redisHealth] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);

  const isHealthy =
    dbHealth.status === 'connected' && redisHealth.status === 'connected';

  const health: HealthStatus = {
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: VERSION,
    services: {
      database: dbHealth,
      redis: redisHealth,
    },
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };

  const statusCode = isHealthy ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /health/live
 * Liveness probe - is the server running?
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready
 * Readiness probe - can the server handle requests?
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const [dbHealth, redisHealth] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);

  const isReady =
    dbHealth.status === 'connected' && redisHealth.status === 'connected';

  if (isReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealth.status,
        redis: redisHealth.status,
      },
    });
  }
});

/**
 * GET /info
 * API information
 */
router.get('/info', (_req: Request, res: Response) => {
  res.json({
    name: 'Edith.ai API',
    description: 'AI-powered personal operations platform',
    version: VERSION,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

export default router;
