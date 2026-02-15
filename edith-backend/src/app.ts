import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { config } from './config/index.js';
import { connectDatabase, disconnectDatabase } from './database/client.js';
import { getRedisClient, disconnectRedis } from './database/redis.js';
import { closeQueues, scheduleMaintenanceJobs } from './jobs/queue.js';
import { initializeWorkers, stopWorkers } from './jobs/workers/index.js';
import { jobSchedulerService } from './services/JobSchedulerService.js';
import routes from './api/routes/index.js';
import { requestLogger } from './api/middleware/audit.middleware.js';
import { standardRateLimit } from './api/middleware/rateLimit.middleware.js';
import { initializeWebSocket } from './api/websocket/index.js';
import { logger } from './utils/logger.js';
import { sendError } from './utils/helpers.js';

// Create Express app
const app: Express = express();
const httpServer = createServer(app);

// Create Socket.IO server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.server.allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

// ==================== MIDDLEWARE ====================

// Security headers
app.use(helmet({
  contentSecurityPolicy: config.isProduction ? undefined : false,
}));

// CORS
app.use(cors({
  origin: config.server.allowedOrigins,
  credentials: true,
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Rate limiting
app.use(standardRateLimit);

// Trust proxy for proper IP detection
app.set('trust proxy', 1);

// ==================== ROUTES ====================

// Mount all routes
app.use(routes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'Edith.ai',
    description: 'AI-powered personal operations platform',
    version: '1.0.0',
    status: 'running',
  });
});

// 404 handler
app.use((_req, res) => {
  sendError(res, 'Endpoint not found', 404);
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });

  sendError(
    res,
    config.isProduction ? 'Internal server error' : err.message,
    500
  );
});

// ==================== SOCKET.IO ====================

// Initialize WebSocket handlers
initializeWebSocket(io);

// ==================== GRACEFUL SHUTDOWN ====================

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, starting graceful shutdown...`);

  // Stop accepting new connections
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  // Close Socket.IO
  io.close(() => {
    logger.info('Socket.IO server closed');
  });

  try {
    // Stop workers first
    await stopWorkers();

    // Close all connections
    await Promise.all([
      disconnectDatabase(),
      disconnectRedis(),
      closeQueues(),
    ]);

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ==================== START SERVER ====================

async function main(): Promise<void> {
  try {
    // Connect to database
    await connectDatabase();

    // Initialize Redis
    getRedisClient();

    // Initialize job workers
    await initializeWorkers();

    // Schedule system-wide maintenance jobs
    await jobSchedulerService.initializeSystemJobs();

    // Schedule additional maintenance jobs (legacy)
    if (config.isProduction) {
      await scheduleMaintenanceJobs();
    }

    // Start Telegram bot (non-blocking, fails gracefully if not configured)
    try {
      const { telegramBot } = await import('./integrations/telegram/TelegramBot.js');
      await telegramBot.start();
    } catch (err) {
      logger.warn('Telegram bot failed to start', { error: err });
    }

    // Start server
    httpServer.listen(config.server.port, () => {
      logger.info(`
╔══════════════════════════════════════════════════════════╗
║                        EDITH.AI                          ║
║         AI-Powered Personal Operations Platform          ║
╠══════════════════════════════════════════════════════════╣
║  Server:      http://localhost:${config.server.port.toString().padEnd(24)}║
║  Environment: ${config.env.padEnd(41)}║
║  API Docs:    ${config.server.apiUrl}/info${' '.repeat(Math.max(0, 26 - config.server.apiUrl.length))}║
╚══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

main();

export { app, io };
