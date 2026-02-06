/**
 * SlackOAuthClient
 * Handles Slack OAuth 2.0 flow for both bot and user tokens
 */

import { WebClient } from '@slack/web-api';
import { prisma } from '../../database/client.js';
import { oauthManager, type TokenResponse } from '../common/OAuthManager.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import type { IntegrationProvider } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface SlackOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: {
    bot: string[];
    user: string[];
  };
}

export interface SlackTokenResponse {
  ok: boolean;
  access_token: string;
  token_type: string;
  scope: string;
  bot_user_id?: string;
  app_id: string;
  team: {
    id: string;
    name: string;
  };
  enterprise?: {
    id: string;
    name: string;
  };
  authed_user: {
    id: string;
    scope: string;
    access_token: string;
    token_type: string;
  };
  incoming_webhook?: {
    channel: string;
    channel_id: string;
    configuration_url: string;
    url: string;
  };
}

export interface SlackCredentials {
  botToken: string;
  userToken: string;
  teamId: string;
  teamName: string;
  botUserId: string;
  userId: string;
  scopes: string[];
  userScopes: string[];
}

// ============================================================================
// Default Scopes
// ============================================================================

export const SLACK_BOT_SCOPES = [
  'app_mentions:read',
  'channels:history',
  'channels:join',
  'channels:read',
  'chat:write',
  'commands',
  'dnd:read',
  'emoji:read',
  'groups:history',
  'groups:read',
  'im:history',
  'im:read',
  'im:write',
  'mpim:history',
  'mpim:read',
  'reactions:read',
  'reactions:write',
  'team:read',
  'users:read',
  'users:read.email',
  'users.profile:read',
];

export const SLACK_USER_SCOPES = [
  'channels:history',
  'channels:read',
  'dnd:read',
  'dnd:write',
  'groups:history',
  'groups:read',
  'im:history',
  'im:read',
  'mpim:history',
  'mpim:read',
  'reactions:read',
  'reactions:write',
  'search:read',
  'users:read',
  'users:read.email',
  'users.profile:read',
  'users.profile:write',
];

// ============================================================================
// SlackOAuthClient Class
// ============================================================================

class SlackOAuthClientImpl {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = config.slack?.clientId || process.env.SLACK_CLIENT_ID || '';
    this.clientSecret = config.slack?.clientSecret || process.env.SLACK_CLIENT_SECRET || '';
    this.redirectUri = config.slack?.redirectUri || process.env.SLACK_REDIRECT_URI || '';
  }

  /**
   * Generate OAuth authorization URL for Slack
   */
  generateAuthUrl(state: string, botScopes?: string[], userScopes?: string[]): string {
    const scopes = botScopes || SLACK_BOT_SCOPES;
    const uScopes = userScopes || SLACK_USER_SCOPES;

    const params = new URLSearchParams({
      client_id: this.clientId,
      scope: scopes.join(','),
      user_scope: uScopes.join(','),
      redirect_uri: this.redirectUri,
      state,
    });

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string): Promise<SlackTokenResponse> {
    const client = new WebClient();

    try {
      const result = await client.oauth.v2.access({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri,
      });

      if (!result.ok) {
        throw new Error(`Slack OAuth failed: ${result.error}`);
      }

      return result as unknown as SlackTokenResponse;
    } catch (error) {
      logger.error('Slack OAuth code exchange failed', { error });
      throw error;
    }
  }

  /**
   * Store Slack tokens for a user
   */
  async storeTokens(userId: string, tokenResponse: SlackTokenResponse): Promise<void> {
    const provider: IntegrationProvider = 'SLACK';

    // Store bot token
    const botTokenData: TokenResponse = {
      access_token: tokenResponse.access_token,
      refresh_token: '', // Slack doesn't use refresh tokens for bot tokens
      expires_in: undefined, // Slack bot tokens don't expire
      token_type: tokenResponse.token_type,
      scope: tokenResponse.scope,
    };

    await oauthManager.storeTokens(userId, provider, botTokenData);

    // Update integration metadata with additional info
    await prisma.userIntegration.update({
      where: { userId_provider: { userId, provider } },
      data: {
        metadata: {
          teamId: tokenResponse.team.id,
          teamName: tokenResponse.team.name,
          botUserId: tokenResponse.bot_user_id,
          appId: tokenResponse.app_id,
          slackUserId: tokenResponse.authed_user.id,
          userToken: tokenResponse.authed_user.access_token, // Store encrypted user token
          userScopes: tokenResponse.authed_user.scope,
          botScopes: tokenResponse.scope,
          webhookUrl: tokenResponse.incoming_webhook?.url,
          webhookChannel: tokenResponse.incoming_webhook?.channel,
        },
      },
    });

    logger.info('Slack tokens stored', {
      userId,
      teamId: tokenResponse.team.id,
      teamName: tokenResponse.team.name,
    });
  }

  /**
   * Get Slack credentials for a user
   */
  async getCredentials(userId: string): Promise<SlackCredentials | null> {
    const integration = await prisma.userIntegration.findUnique({
      where: { userId_provider: { userId, provider: 'SLACK' } },
    });

    if (!integration || !integration.isActive) {
      return null;
    }

    const tokens = await oauthManager.getValidTokens(userId, 'SLACK');
    if (!tokens) {
      return null;
    }

    const metadata = integration.metadata as Record<string, unknown>;

    return {
      botToken: tokens.accessToken,
      userToken: (metadata.userToken as string) || '',
      teamId: (metadata.teamId as string) || '',
      teamName: (metadata.teamName as string) || '',
      botUserId: (metadata.botUserId as string) || '',
      userId: (metadata.slackUserId as string) || '',
      scopes: ((metadata.botScopes as string) || '').split(','),
      userScopes: ((metadata.userScopes as string) || '').split(','),
    };
  }

  /**
   * Create WebClient for bot operations
   */
  async getBotClient(userId: string): Promise<WebClient | null> {
    const credentials = await this.getCredentials(userId);
    if (!credentials) {
      return null;
    }

    return new WebClient(credentials.botToken);
  }

  /**
   * Create WebClient for user operations
   */
  async getUserClient(userId: string): Promise<WebClient | null> {
    const credentials = await this.getCredentials(userId);
    if (!credentials || !credentials.userToken) {
      return null;
    }

    return new WebClient(credentials.userToken);
  }

  /**
   * Verify the integration is still valid
   */
  async verifyIntegration(userId: string): Promise<boolean> {
    try {
      const client = await this.getBotClient(userId);
      if (!client) {
        return false;
      }

      const result = await client.auth.test();
      return result.ok === true;
    } catch (error) {
      logger.error('Slack integration verification failed', { userId, error });
      return false;
    }
  }

  /**
   * Revoke Slack tokens and disconnect integration
   */
  async revokeTokens(userId: string): Promise<void> {
    try {
      const client = await this.getBotClient(userId);
      if (client) {
        await client.auth.revoke();
      }
    } catch (error) {
      logger.warn('Failed to revoke Slack tokens', { userId, error });
    }

    // Mark integration as inactive
    await prisma.userIntegration.update({
      where: { userId_provider: { userId, provider: 'SLACK' } },
      data: { isActive: false },
    });

    logger.info('Slack integration disconnected', { userId });
  }

  /**
   * Get team information
   */
  async getTeamInfo(userId: string): Promise<{
    id: string;
    name: string;
    domain: string;
    icon?: string;
  } | null> {
    try {
      const client = await this.getBotClient(userId);
      if (!client) {
        return null;
      }

      const result = await client.team.info();
      if (!result.ok || !result.team) {
        return null;
      }

      return {
        id: result.team.id!,
        name: result.team.name!,
        domain: result.team.domain!,
        icon: result.team.icon?.image_132,
      };
    } catch (error) {
      logger.error('Failed to get Slack team info', { userId, error });
      return null;
    }
  }
}

export const slackOAuthClient = new SlackOAuthClientImpl();
export default slackOAuthClient;
