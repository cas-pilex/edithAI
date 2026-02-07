/**
 * OAuth Routes
 * Handles OAuth 2.0 flows for all integration providers
 */

import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { googleOAuthClient, GMAIL_SCOPES, CALENDAR_SCOPES, ALL_GOOGLE_SCOPES } from '../../integrations/google/index.js';
import { slackOAuthClient, SLACK_BOT_SCOPES, SLACK_USER_SCOPES } from '../../integrations/slack/index.js';
import { oauthManager } from '../../integrations/common/OAuthManager.js';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { gmailSyncWorker } from '../../integrations/google/GmailSyncWorker.js';
import { calendarSyncWorker } from '../../integrations/google/CalendarSyncWorker.js';
import type { IntegrationProvider } from '../../types/index.js';

const router: RouterType = Router();

// ============================================================================
// Types
// ============================================================================

interface OAuthState {
  userId: string;
  provider: string;
  redirectUrl?: string;
  timestamp: number;
}

// ============================================================================
// Middleware - uses shared JWT authenticate from auth.middleware
// ============================================================================

// State encoding/decoding
const encodeState = (state: OAuthState): string => {
  return Buffer.from(JSON.stringify(state)).toString('base64url');
};

const decodeState = (encoded: string): OAuthState | null => {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString());
  } catch {
    return null;
  }
};

// ============================================================================
// Google OAuth Routes
// ============================================================================

/**
 * GET /api/oauth/google
 * Initiate Google OAuth flow (Gmail + Calendar combined)
 */
router.get('/google', authenticate, (req: Request, res: Response) => {
  const userId = (req as Request & { userId: string }).userId;
  const scopes = req.query.scopes as string;
  const redirectUrl = req.query.redirectUrl as string;

  // Determine which scopes to request
  let requestedScopes: string[];
  if (scopes === 'gmail') {
    requestedScopes = GMAIL_SCOPES;
  } else if (scopes === 'calendar') {
    requestedScopes = CALENDAR_SCOPES;
  } else {
    requestedScopes = ALL_GOOGLE_SCOPES;
  }

  const state = encodeState({
    userId,
    provider: 'google',
    redirectUrl,
    timestamp: Date.now(),
  });

  const authUrl = googleOAuthClient.generateAuthUrl(requestedScopes, state);

  res.json({ authUrl });
});

/**
 * GET /api/oauth/google/callback
 * Handle Google OAuth callback
 */
router.get('/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    logger.warn('Google OAuth error', { error });
    return res.redirect(`${config.server.frontendUrl}/settings/integrations?error=${error}`);
  }

  if (!code || !state) {
    return res.redirect(`${config.server.frontendUrl}/settings/integrations?error=missing_params`);
  }

  const decodedState = decodeState(state as string);
  if (!decodedState || Date.now() - decodedState.timestamp > 15 * 60 * 1000) {
    return res.redirect(`${config.server.frontendUrl}/settings/integrations?error=invalid_state`);
  }

  try {
    // Exchange code for tokens
    const credentials = await googleOAuthClient.exchangeCode(code as string);

    // Store tokens for both Gmail and Calendar using OAuthManager
    const providers: IntegrationProvider[] = ['GMAIL', 'GOOGLE_CALENDAR'];

    const tokenResponse = {
      access_token: credentials.access_token!,
      refresh_token: credentials.refresh_token || undefined,
      expires_in: credentials.expiry_date
        ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
        : undefined,
    };

    for (const provider of providers) {
      await oauthManager.storeTokens(decodedState.userId, provider, tokenResponse);
    }

    logger.info('Google OAuth successful', { userId: decodedState.userId });

    // Trigger initial sync in the background (fire-and-forget)
    gmailSyncWorker.performFullSync(decodedState.userId).catch(err =>
      logger.error('Initial Gmail sync failed', { userId: decodedState.userId, error: err })
    );
    calendarSyncWorker.syncAllCalendars(decodedState.userId).catch(err =>
      logger.error('Initial Calendar sync failed', { userId: decodedState.userId, error: err })
    );

    const redirectUrl = decodedState.redirectUrl || `${config.server.frontendUrl}/settings/integrations`;
    res.redirect(`${redirectUrl}?success=google`);
  } catch (err) {
    logger.error('Google OAuth callback failed', { error: err });
    res.redirect(`${config.server.frontendUrl}/settings/integrations?error=exchange_failed`);
  }
});

// ============================================================================
// Slack OAuth Routes
// ============================================================================

/**
 * GET /api/oauth/slack
 * Initiate Slack OAuth flow
 */
router.get('/slack', authenticate, (req: Request, res: Response) => {
  const userId = (req as Request & { userId: string }).userId;
  const redirectUrl = req.query.redirectUrl as string;

  const state = encodeState({
    userId,
    provider: 'slack',
    redirectUrl,
    timestamp: Date.now(),
  });

  const authUrl = slackOAuthClient.generateAuthUrl(state, SLACK_BOT_SCOPES, SLACK_USER_SCOPES);

  res.json({ authUrl });
});

/**
 * GET /api/oauth/slack/callback
 * Handle Slack OAuth callback
 */
router.get('/slack/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    logger.warn('Slack OAuth error', { error });
    return res.redirect(`${config.server.frontendUrl}/settings/integrations?error=${error}`);
  }

  if (!code || !state) {
    return res.redirect(`${config.server.frontendUrl}/settings/integrations?error=missing_params`);
  }

  const decodedState = decodeState(state as string);
  if (!decodedState || Date.now() - decodedState.timestamp > 15 * 60 * 1000) {
    return res.redirect(`${config.server.frontendUrl}/settings/integrations?error=invalid_state`);
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await slackOAuthClient.exchangeCode(code as string);

    // Store tokens
    await slackOAuthClient.storeTokens(decodedState.userId, tokenResponse);

    logger.info('Slack OAuth successful', {
      userId: decodedState.userId,
      teamId: tokenResponse.team.id,
    });

    const redirectUrl = decodedState.redirectUrl || `${config.server.frontendUrl}/settings/integrations`;
    res.redirect(`${redirectUrl}?success=slack`);
  } catch (err) {
    logger.error('Slack OAuth callback failed', { error: err });
    res.redirect(`${config.server.frontendUrl}/settings/integrations?error=exchange_failed`);
  }
});

// ============================================================================
// Telegram Link Routes
// ============================================================================

/**
 * GET /api/oauth/telegram
 * Get Telegram bot link
 */
router.get('/telegram', authenticate, (_req: Request, res: Response): void => {
  const botUsername = config.telegram?.botUsername || process.env.TELEGRAM_BOT_USERNAME;

  if (!botUsername) {
    res.status(503).json({ error: 'Telegram bot not configured' });
    return;
  }

  res.json({
    botLink: `https://t.me/${botUsername}`,
    instructions: 'Click the link to open Telegram, then send /start to connect your account',
  });
});

/**
 * GET /connect/telegram
 * Handle Telegram account linking via link token
 */
router.get('/connect/telegram', async (req: Request, res: Response) => {
  const { token } = req.query;

  if (!token) {
    return res.redirect(`${config.server.frontendUrl}/settings/integrations?error=missing_token`);
  }

  try {
    // Verify token
    const linkToken = await prisma.telegramLinkToken.findUnique({
      where: { token: token as string },
    });

    if (!linkToken || linkToken.expiresAt < new Date()) {
      return res.redirect(`${config.server.frontendUrl}/settings/integrations?error=invalid_token`);
    }

    // Token is valid - render page to complete linking
    // In production, this would be a frontend page
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Connect Telegram - Edith</title></head>
        <body>
          <h1>Connect your Telegram account</h1>
          <p>Click below to complete the connection:</p>
          <form action="/api/oauth/telegram/complete" method="POST">
            <input type="hidden" name="token" value="${token}">
            <button type="submit">Complete Connection</button>
          </form>
        </body>
      </html>
    `);
  } catch (err) {
    logger.error('Telegram link verification failed', { error: err });
    res.redirect(`${config.server.frontendUrl}/settings/integrations?error=verification_failed`);
  }
});

// ============================================================================
// WhatsApp Verification Routes
// ============================================================================

/**
 * POST /api/oauth/whatsapp/request
 * Request WhatsApp verification code
 */
router.post('/whatsapp/request', authenticate, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    res.status(400).json({ error: 'Phone number required' });
    return;
  }

  try {
    // Generate verification code
    const code = Math.random().toString().slice(2, 8);

    // Store code (would be sent via WhatsApp in production)
    await prisma.verificationCode.create({
      data: {
        userId,
        type: 'WHATSAPP',
        code,
        phoneNumber,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    // In production, send via WhatsApp
    // await whatsappNotifications.sendVerificationCode(phoneNumber, code);

    logger.info('WhatsApp verification code generated', { userId });

    res.json({ message: 'Verification code sent', phoneNumber });
  } catch (err) {
    logger.error('WhatsApp verification request failed', { error: err });
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

/**
 * POST /api/oauth/whatsapp/verify
 * Verify WhatsApp code and connect
 */
router.post('/whatsapp/verify', authenticate, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const { phoneNumber, code } = req.body;

  if (!phoneNumber || !code) {
    res.status(400).json({ error: 'Phone number and code required' });
    return;
  }

  try {
    // Find and verify code
    const verification = await prisma.verificationCode.findFirst({
      where: {
        userId,
        type: 'WHATSAPP',
        code,
        phoneNumber,
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
    });

    if (!verification) {
      res.status(400).json({ error: 'Invalid or expired code' });
      return;
    }

    // Mark code as used
    await prisma.verificationCode.update({
      where: { id: verification.id },
      data: { usedAt: new Date() },
    });

    // Create integration
    await prisma.userIntegration.upsert({
      where: { userId_provider: { userId, provider: 'WHATSAPP' } },
      update: {
        isActive: true,
        metadata: { phoneNumber },
      },
      create: {
        userId,
        provider: 'WHATSAPP',
        isActive: true,
        metadata: { phoneNumber },
      },
    });

    logger.info('WhatsApp connected', { userId });

    res.json({ success: true, phoneNumber });
  } catch (err) {
    logger.error('WhatsApp verification failed', { error: err });
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ============================================================================
// Disconnect Routes
// ============================================================================

/**
 * DELETE /api/oauth/:provider
 * Disconnect an integration
 */
router.delete('/:provider', authenticate, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId: string }).userId;
  const provider = req.params.provider as string;

  const validProviders = ['google', 'gmail', 'calendar', 'slack', 'telegram', 'whatsapp'];

  if (!validProviders.includes(provider.toLowerCase())) {
    res.status(400).json({ error: 'Invalid provider' });
    return;
  }

  try {
    // Map friendly names to enum values
    let providers: string[];
    switch (provider.toLowerCase()) {
      case 'google':
        providers = ['GMAIL', 'GOOGLE_CALENDAR'];
        break;
      case 'gmail':
        providers = ['GMAIL'];
        break;
      case 'calendar':
        providers = ['GOOGLE_CALENDAR'];
        break;
      default:
        providers = [provider.toUpperCase()];
    }

    // Revoke tokens if applicable
    if (provider.toLowerCase() === 'slack') {
      await slackOAuthClient.revokeTokens(userId);
    }

    // Mark integrations as inactive
    for (const p of providers) {
      await prisma.userIntegration.updateMany({
        where: { userId, provider: p as never },
        data: { isActive: false },
      });
    }

    logger.info('Integration disconnected', { userId, provider });

    res.json({ success: true, provider });
  } catch (err) {
    logger.error('Disconnect failed', { error: err, provider });
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// ============================================================================
// Status Routes
// ============================================================================

/**
 * GET /api/oauth/status
 * Get connection status for all integrations
 */
router.get('/status', authenticate, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId: string }).userId;

  try {
    const integrations = await prisma.userIntegration.findMany({
      where: { userId },
      select: {
        provider: true,
        isActive: true,
        lastSyncAt: true,
        metadata: true,
      },
    });

    const status: Record<string, { connected: boolean; lastSync?: Date; metadata?: unknown }> = {};

    for (const int of integrations) {
      status[int.provider.toLowerCase()] = {
        connected: int.isActive,
        lastSync: int.lastSyncAt || undefined,
        metadata: int.metadata as Record<string, unknown> | null || undefined,
      };
    }

    res.json(status);
  } catch (err) {
    logger.error('Failed to get integration status', { error: err });
    res.status(500).json({ error: 'Failed to get status' });
  }
});

export default router;
