/**
 * WebhookManager
 * Webhook signature verification for all integration providers
 */

import crypto from 'crypto';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
}

export interface SlackWebhookHeaders {
  'x-slack-signature': string;
  'x-slack-request-timestamp': string;
}

export interface GooglePubSubMessage {
  message: {
    data: string;
    messageId: string;
    publishTime: string;
    attributes?: Record<string, string>;
  };
  subscription: string;
}

export interface TwilioWebhookParams {
  AccountSid?: string;
  ApiVersion?: string;
  Body?: string;
  From?: string;
  To?: string;
  [key: string]: string | undefined;
}

// ============================================================================
// WebhookManager Class
// ============================================================================

class WebhookManagerImpl {
  /**
   * Verify Slack webhook signature
   * Uses HMAC-SHA256 to verify the request came from Slack
   */
  verifySlackSignature(
    signature: string,
    timestamp: string,
    body: string
  ): WebhookVerificationResult {
    if (!config.slack.signingSecret) {
      return { valid: false, error: 'Slack signing secret not configured' };
    }

    try {
      // Check timestamp to prevent replay attacks (5 minutes)
      const requestTimestamp = parseInt(timestamp, 10);
      const currentTimestamp = Math.floor(Date.now() / 1000);

      if (Math.abs(currentTimestamp - requestTimestamp) > 300) {
        return { valid: false, error: 'Request timestamp too old' };
      }

      // Compute expected signature
      const sigBasestring = `v0:${timestamp}:${body}`;
      const expectedSignature = 'v0=' + crypto
        .createHmac('sha256', config.slack.signingSecret)
        .update(sigBasestring, 'utf8')
        .digest('hex');

      // Compare signatures
      const valid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

      return { valid };
    } catch (error) {
      logger.error('Slack signature verification failed', { error });
      return { valid: false, error: 'Signature verification error' };
    }
  }

  /**
   * Verify Google Pub/Sub push notification
   * Validates the JWT bearer token from Google
   */
  async verifyGooglePubSub(
    authorizationHeader: string,
    expectedAudience: string
  ): Promise<WebhookVerificationResult> {
    try {
      if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
        return { valid: false, error: 'Missing or invalid authorization header' };
      }

      const token = authorizationHeader.substring(7);

      // Decode and verify the JWT token
      // In production, you should verify the token against Google's public keys
      // For now, we do basic validation
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid token format' };
      }

      // Decode payload
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

      // Check audience
      if (payload.aud !== expectedAudience) {
        return { valid: false, error: 'Invalid audience' };
      }

      // Check expiration
      if (payload.exp && payload.exp < Date.now() / 1000) {
        return { valid: false, error: 'Token expired' };
      }

      // Check issuer
      if (!payload.iss?.includes('accounts.google.com')) {
        return { valid: false, error: 'Invalid issuer' };
      }

      return { valid: true };
    } catch (error) {
      logger.error('Google Pub/Sub verification failed', { error });
      return { valid: false, error: 'Token verification error' };
    }
  }

  /**
   * Verify Telegram webhook secret
   * Validates the secret token in the URL path
   */
  verifyTelegramSecret(receivedSecret: string): WebhookVerificationResult {
    if (!config.telegram.botToken) {
      return { valid: false, error: 'Telegram bot token not configured' };
    }

    try {
      // Generate expected secret hash from bot token
      const expectedSecret = crypto
        .createHash('sha256')
        .update(config.telegram.botToken)
        .digest('hex')
        .substring(0, 32);

      const valid = crypto.timingSafeEqual(
        Buffer.from(receivedSecret),
        Buffer.from(expectedSecret)
      );

      return { valid };
    } catch (error) {
      logger.error('Telegram secret verification failed', { error });
      return { valid: false, error: 'Secret verification error' };
    }
  }

  /**
   * Generate Telegram webhook secret
   */
  generateTelegramSecret(): string {
    if (!config.telegram.botToken) {
      throw new Error('Telegram bot token not configured');
    }

    return crypto
      .createHash('sha256')
      .update(config.telegram.botToken)
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Verify Twilio webhook signature
   * Uses HMAC-SHA1 for signature validation
   */
  verifyTwilioSignature(
    signature: string,
    url: string,
    params: TwilioWebhookParams
  ): WebhookVerificationResult {
    if (!config.twilio.authToken) {
      return { valid: false, error: 'Twilio auth token not configured' };
    }

    try {
      // Build the data string by sorting params and concatenating
      const sortedParams = Object.keys(params)
        .sort()
        .reduce((acc, key) => {
          if (params[key] !== undefined) {
            acc += key + params[key];
          }
          return acc;
        }, '');

      const data = url + sortedParams;

      // Compute expected signature
      const expectedSignature = crypto
        .createHmac('sha1', config.twilio.authToken)
        .update(data, 'utf8')
        .digest('base64');

      const valid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

      return { valid };
    } catch (error) {
      logger.error('Twilio signature verification failed', { error });
      return { valid: false, error: 'Signature verification error' };
    }
  }

  /**
   * Verify Google Calendar push notification
   * Validates channel ID and resource state
   */
  verifyGoogleCalendarPush(
    channelId: string,
    resourceId: string,
    expectedChannelId: string
  ): WebhookVerificationResult {
    if (!channelId || !resourceId) {
      return { valid: false, error: 'Missing channel or resource ID' };
    }

    if (channelId !== expectedChannelId) {
      return { valid: false, error: 'Channel ID mismatch' };
    }

    return { valid: true };
  }

  /**
   * Parse Google Pub/Sub message data
   */
  parseGooglePubSubMessage<T>(message: GooglePubSubMessage): T | null {
    try {
      const data = Buffer.from(message.message.data, 'base64').toString('utf8');
      return JSON.parse(data) as T;
    } catch (error) {
      logger.error('Failed to parse Pub/Sub message', { error });
      return null;
    }
  }

  /**
   * Create webhook signature for outgoing requests (used in testing)
   */
  createSlackSignature(timestamp: string, body: string): string {
    if (!config.slack.signingSecret) {
      throw new Error('Slack signing secret not configured');
    }

    const sigBasestring = `v0:${timestamp}:${body}`;
    return 'v0=' + crypto
      .createHmac('sha256', config.slack.signingSecret)
      .update(sigBasestring, 'utf8')
      .digest('hex');
  }

  /**
   * Create webhook signature for Twilio (used in testing)
   */
  createTwilioSignature(url: string, params: TwilioWebhookParams): string {
    if (!config.twilio.authToken) {
      throw new Error('Twilio auth token not configured');
    }

    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        if (params[key] !== undefined) {
          acc += key + params[key];
        }
        return acc;
      }, '');

    const data = url + sortedParams;

    return crypto
      .createHmac('sha1', config.twilio.authToken)
      .update(data, 'utf8')
      .digest('base64');
  }

  /**
   * Validate webhook URL is HTTPS in production
   */
  validateWebhookUrl(url: string): WebhookVerificationResult {
    try {
      const parsed = new URL(url);

      if (config.isProduction && parsed.protocol !== 'https:') {
        return { valid: false, error: 'Webhook URL must use HTTPS in production' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  /**
   * Generate a unique channel ID for Google Calendar webhooks
   */
  generateCalendarChannelId(userId: string, calendarId: string): string {
    return crypto
      .createHash('sha256')
      .update(`${userId}:${calendarId}:${Date.now()}`)
      .digest('hex')
      .substring(0, 32);
  }
}

export const webhookManager = new WebhookManagerImpl();
export default webhookManager;
