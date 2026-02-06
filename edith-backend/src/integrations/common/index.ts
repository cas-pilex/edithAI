/**
 * Common Integration Utilities
 * Exports all shared integration infrastructure
 */

// Re-export SyncStatus enum from Prisma for convenience
export { SyncStatus } from '@prisma/client';

export { oauthManager, type OAuthConfig, type TokenResponse, type ValidTokens } from './OAuthManager.js';
export {
  rateLimiter,
  PROVIDER_RATE_LIMITS,
  type RateLimitConfig,
  type RateLimitResult,
  type BackoffConfig,
} from './RateLimiter.js';
export {
  syncManager,
  type SyncConfig,
  type SyncResult,
  type SyncError,
  type SyncProgress,
} from './SyncManager.js';
export {
  webhookManager,
  type WebhookVerificationResult,
  type SlackWebhookHeaders,
  type GooglePubSubMessage,
  type TwilioWebhookParams,
} from './WebhookManager.js';
