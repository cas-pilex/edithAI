import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });

    redisClient.on('error', (error: Error) => {
      logger.error('Redis error', { error: error.message });
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis disconnected');
  }
}

export async function checkRedisHealth(): Promise<{
  status: 'connected' | 'disconnected' | 'error';
  latency?: number;
  error?: string;
}> {
  try {
    const client = getRedisClient();
    const start = Date.now();
    await client.ping();
    const latency = Date.now() - start;
    return { status: 'connected', latency };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ==================== CACHE HELPERS ====================

const DEFAULT_TTL = 3600; // 1 hour

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  const data = await client.get(key);
  if (!data) return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return data as unknown as T;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = DEFAULT_TTL
): Promise<void> {
  const client = getRedisClient();
  const data = typeof value === 'string' ? value : JSON.stringify(value);
  await client.setex(key, ttlSeconds, data);
}

export async function cacheDelete(key: string): Promise<void> {
  const client = getRedisClient();
  await client.del(key);
}

export async function cacheDeletePattern(pattern: string): Promise<void> {
  const client = getRedisClient();
  const keys = await client.keys(pattern);
  if (keys.length > 0) {
    await client.del(...keys);
  }
}

// ==================== RATE LIMITING HELPERS ====================

export async function incrementRateLimit(
  key: string,
  windowSeconds: number
): Promise<{ count: number; remaining: number; resetAt: number }> {
  const client = getRedisClient();
  const multi = client.multi();

  multi.incr(key);
  multi.ttl(key);

  const results = await multi.exec();
  const count = (results?.[0]?.[1] as number) || 1;
  const ttl = (results?.[1]?.[1] as number) || -1;

  // Set expiry if this is a new key
  if (ttl === -1) {
    await client.expire(key, windowSeconds);
  }

  const resetAt = Date.now() + (ttl === -1 ? windowSeconds : ttl) * 1000;

  return {
    count,
    remaining: Math.max(0, config.rateLimit.maxRequests - count),
    resetAt,
  };
}

// ==================== SESSION HELPERS ====================

export async function storeSession(
  userId: string,
  sessionId: string,
  ttlSeconds: number
): Promise<void> {
  const client = getRedisClient();
  await client.setex(`session:${sessionId}`, ttlSeconds, userId);
  await client.sadd(`user:${userId}:sessions`, sessionId);
}

export async function getSession(sessionId: string): Promise<string | null> {
  const client = getRedisClient();
  return client.get(`session:${sessionId}`);
}

export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  const client = getRedisClient();
  await client.del(`session:${sessionId}`);
  await client.srem(`user:${userId}:sessions`, sessionId);
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  const client = getRedisClient();
  const sessions = await client.smembers(`user:${userId}:sessions`);

  if (sessions.length > 0) {
    const sessionKeys = sessions.map((s: string) => `session:${s}`);
    await client.del(...sessionKeys);
  }

  await client.del(`user:${userId}:sessions`);
}

// ==================== LOGIN ATTEMPT TRACKING ====================

export async function recordLoginAttempt(
  identifier: string
): Promise<{ attempts: number; lockedUntil: number | null }> {
  const client = getRedisClient();
  const key = `login:attempts:${identifier}`;
  const lockKey = `login:locked:${identifier}`;

  // Check if locked
  const lockedUntil = await client.get(lockKey);
  if (lockedUntil) {
    return { attempts: config.auth.maxLoginAttempts, lockedUntil: parseInt(lockedUntil) };
  }

  // Increment attempts
  const attempts = await client.incr(key);
  if (attempts === 1) {
    await client.expire(key, 900); // 15 minutes
  }

  // Lock if too many attempts
  if (attempts >= config.auth.maxLoginAttempts) {
    const lockUntil = Date.now() + config.auth.lockoutDuration;
    await client.setex(lockKey, Math.ceil(config.auth.lockoutDuration / 1000), lockUntil.toString());
    return { attempts, lockedUntil: lockUntil };
  }

  return { attempts, lockedUntil: null };
}

export async function clearLoginAttempts(identifier: string): Promise<void> {
  const client = getRedisClient();
  await client.del(`login:attempts:${identifier}`);
  await client.del(`login:locked:${identifier}`);
}

// ==================== AI RATE LIMITING ====================

const AI_RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds
const AI_RATE_LIMIT_MAX = 100; // 100 calls per user per hour

export async function checkAIRateLimit(userId: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
  current: number;
}> {
  const client = getRedisClient();
  const key = `ai:ratelimit:${userId}`;

  const count = await client.get(key);
  const current = count ? parseInt(count) : 0;
  const ttl = await client.ttl(key);
  const resetAt = Date.now() + (ttl > 0 ? ttl : AI_RATE_LIMIT_WINDOW) * 1000;

  return {
    allowed: current < AI_RATE_LIMIT_MAX,
    remaining: Math.max(0, AI_RATE_LIMIT_MAX - current),
    resetAt,
    current,
  };
}

export async function incrementAIRateLimit(userId: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
  current: number;
}> {
  const client = getRedisClient();
  const key = `ai:ratelimit:${userId}`;

  const multi = client.multi();
  multi.incr(key);
  multi.ttl(key);

  const results = await multi.exec();
  const current = (results?.[0]?.[1] as number) || 1;
  const ttl = (results?.[1]?.[1] as number) || -1;

  // Set expiry if this is a new key
  if (ttl === -1) {
    await client.expire(key, AI_RATE_LIMIT_WINDOW);
  }

  const resetAt = Date.now() + (ttl === -1 ? AI_RATE_LIMIT_WINDOW : ttl) * 1000;

  return {
    allowed: current <= AI_RATE_LIMIT_MAX,
    remaining: Math.max(0, AI_RATE_LIMIT_MAX - current),
    resetAt,
    current,
  };
}

// ==================== AGENT MEMORY HELPERS ====================

export async function storeRecentAction(
  userId: string,
  domain: string,
  action: object,
  maxItems: number = 20
): Promise<void> {
  const client = getRedisClient();
  const key = `agent:memory:${userId}:${domain}`;
  const actionData = JSON.stringify({ ...action, timestamp: Date.now() });

  // Add to list and trim to keep only recent items
  await client.lpush(key, actionData);
  await client.ltrim(key, 0, maxItems - 1);
  // Set TTL of 7 days for memory
  await client.expire(key, 604800);
}

export async function getRecentActions<T>(
  userId: string,
  domain: string,
  limit: number = 20
): Promise<T[]> {
  const client = getRedisClient();
  const key = `agent:memory:${userId}:${domain}`;
  const actions = await client.lrange(key, 0, limit - 1);

  return actions.map((a: string) => {
    try {
      return JSON.parse(a) as T;
    } catch {
      return a as unknown as T;
    }
  });
}

export async function clearAgentMemory(userId: string, domain?: string): Promise<void> {
  const client = getRedisClient();

  if (domain) {
    await client.del(`agent:memory:${userId}:${domain}`);
  } else {
    // Clear all domains
    const keys = await client.keys(`agent:memory:${userId}:*`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }
}

export default getRedisClient;
