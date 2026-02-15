/**
 * RateLimiter
 * Rate limiting with exponential backoff for integration API calls
 */

import { getRedisClient } from '../../database/redis.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  retryAfterMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface BackoffConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
}

// Provider-specific rate limits
export const PROVIDER_RATE_LIMITS: Record<string, RateLimitConfig> = {
  GMAIL: { maxRequests: 2500, windowMs: 60000 }, // Gmail API: ~50 req/s = 3000/min, keep headroom
  GOOGLE_CALENDAR: { maxRequests: 1500, windowMs: 60000 }, // Calendar API: high limit
  SLACK: { maxRequests: 50, windowMs: 60000 }, // 50 per minute (Tier 2)
  TELEGRAM: { maxRequests: 30, windowMs: 1000 }, // 30 per second
  WHATSAPP: { maxRequests: 80, windowMs: 60000 }, // 80 per minute
  // Travel APIs
  AMADEUS: { maxRequests: 100, windowMs: 60000 }, // 100 per minute
  GOOGLE_PLACES: { maxRequests: 100, windowMs: 1000 }, // 100 per second
  UBER: { maxRequests: 100, windowMs: 60000 }, // 100 per minute
};

// Default rate limit for unknown providers
const DEFAULT_RATE_LIMIT: RateLimitConfig = { maxRequests: 60, windowMs: 60000 };

// Default backoff configuration
const DEFAULT_BACKOFF: BackoffConfig = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
};

// ============================================================================
// RateLimiter Class
// ============================================================================

class RateLimiterImpl {
  /**
   * Check if request is allowed under rate limit
   */
  async checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const redis = getRedisClient();
    const windowSeconds = Math.ceil(config.windowMs / 1000);
    const fullKey = `integration:ratelimit:${key}`;

    try {
      const [countStr, ttl] = await Promise.all([
        redis.get(fullKey),
        redis.ttl(fullKey),
      ]);

      const count = countStr ? parseInt(countStr, 10) : 0;
      const resetAt = Date.now() + (ttl > 0 ? ttl : windowSeconds) * 1000;
      const allowed = count < config.maxRequests;
      const remaining = Math.max(0, config.maxRequests - count);

      const retryAfter = !allowed
        ? (config.retryAfterMs || (ttl > 0 ? ttl * 1000 : config.windowMs))
        : undefined;

      return { allowed, remaining, resetAt, retryAfter };
    } catch (error) {
      logger.error('Rate limit check failed', { key, error });
      return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs };
    }
  }

  /**
   * Record a request against the rate limit
   */
  async recordRequest(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const redis = getRedisClient();
    const windowSeconds = Math.ceil(config.windowMs / 1000);
    const fullKey = `integration:ratelimit:${key}`;

    try {
      const multi = redis.multi();
      multi.incr(fullKey);
      multi.ttl(fullKey);

      const results = await multi.exec();
      const count = (results?.[0]?.[1] as number) || 1;
      const ttl = (results?.[1]?.[1] as number) || -1;

      // Set expiry if this is a new key
      if (ttl === -1) {
        await redis.expire(fullKey, windowSeconds);
      }

      const resetAt = Date.now() + (ttl === -1 ? windowSeconds : ttl) * 1000;
      const allowed = count <= config.maxRequests;
      const remaining = Math.max(0, config.maxRequests - count);
      const retryAfter = !allowed
        ? (config.retryAfterMs || (ttl === -1 ? windowSeconds * 1000 : ttl * 1000))
        : undefined;

      return { allowed, remaining, resetAt, retryAfter };
    } catch (error) {
      logger.error('Rate limit record failed', { key, error });
      return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs };
    }
  }

  /**
   * Execute a function with rate limiting and exponential backoff
   */
  async executeWithBackoff<T>(
    key: string,
    fn: () => Promise<T>,
    config: RateLimitConfig,
    backoffConfig: Partial<BackoffConfig> = {}
  ): Promise<T> {
    const backoff = { ...DEFAULT_BACKOFF, ...backoffConfig };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < backoff.maxRetries; attempt++) {
      // Check rate limit before making request
      const limit = await this.checkLimit(key, config);

      if (!limit.allowed) {
        // Wait for rate limit to reset
        const waitTime = limit.retryAfter || config.windowMs;
        logger.warn('Rate limited, waiting', { key, waitTime, attempt });
        await this.sleep(waitTime);
        continue;
      }

      try {
        // Record the request
        await this.recordRequest(key, config);

        // Execute the function
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if it's a rate limit error from the API
        if (this.isRateLimitError(error)) {
          const retryAfter = this.extractRetryAfter(error) || this.calculateBackoffDelay(attempt, backoff);
          logger.warn('API rate limited, backing off', { key, retryAfter, attempt });
          await this.sleep(retryAfter);
          continue;
        }

        // For other retryable errors, use exponential backoff
        if (this.isRetryableError(error) && attempt < backoff.maxRetries - 1) {
          const delay = this.calculateBackoffDelay(attempt, backoff);
          logger.warn('Retryable error, backing off', { key, delay, attempt, error: (error as Error).message });
          await this.sleep(delay);
          continue;
        }

        // Non-retryable error or max retries reached
        throw error;
      }
    }

    throw lastError || new Error(`Max retries (${backoff.maxRetries}) exceeded for ${key}`);
  }

  /**
   * Execute with provider-specific rate limits
   */
  async executeForProvider<T>(
    provider: string,
    userId: string,
    operation: string,
    fn: () => Promise<T>,
    backoffConfig?: Partial<BackoffConfig>
  ): Promise<T> {
    const config = PROVIDER_RATE_LIMITS[provider] || DEFAULT_RATE_LIMIT;
    const key = `${provider}:${userId}:${operation}`;
    return this.executeWithBackoff(key, fn, config, backoffConfig);
  }

  /**
   * Calculate backoff delay with jitter
   */
  private calculateBackoffDelay(attempt: number, config: BackoffConfig): number {
    const exponentialDelay = config.initialDelayMs * Math.pow(config.multiplier, attempt);
    const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

    // Add jitter (±25%)
    const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('429');
    }

    // Check for HTTP-like error objects
    const statusCode = (error as { status?: number; statusCode?: number })?.status ||
      (error as { status?: number; statusCode?: number })?.statusCode;
    return statusCode === 429;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (this.isRateLimitError(error)) return true;

    const statusCode = (error as { status?: number; statusCode?: number })?.status ||
      (error as { status?: number; statusCode?: number })?.statusCode;

    // Retry on server errors and timeout
    if (statusCode && statusCode >= 500) return true;
    if (statusCode === 408) return true; // Request timeout

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('network');
    }

    return false;
  }

  /**
   * Extract retry-after value from error
   */
  private extractRetryAfter(error: unknown): number | null {
    // Check for Retry-After header value
    const retryAfter = (error as { retryAfter?: number | string })?.retryAfter;

    if (typeof retryAfter === 'number') {
      return retryAfter * 1000; // Convert seconds to ms
    }

    if (typeof retryAfter === 'string') {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }
    }

    return null;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear rate limit for a key
   */
  async clearLimit(key: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`integration:ratelimit:${key}`);
  }

  /**
   * Get current rate limit status
   */
  async getStatus(key: string, config: RateLimitConfig): Promise<RateLimitResult & { current: number }> {
    const redis = getRedisClient();
    const fullKey = `integration:ratelimit:${key}`;

    const [count, ttl] = await Promise.all([
      redis.get(fullKey),
      redis.ttl(fullKey),
    ]);

    const current = count ? parseInt(count) : 0;
    const windowSeconds = Math.ceil(config.windowMs / 1000);
    const resetAt = Date.now() + (ttl > 0 ? ttl : windowSeconds) * 1000;

    return {
      allowed: current < config.maxRequests,
      remaining: Math.max(0, config.maxRequests - current),
      resetAt,
      current,
    };
  }
}

export const rateLimiter = new RateLimiterImpl();
export default rateLimiter;
