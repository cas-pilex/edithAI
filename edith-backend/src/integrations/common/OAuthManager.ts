/**
 * OAuthManager
 * Generic OAuth 2.0 handler for all integration providers
 */

import { prisma } from '../../database/client.js';
import { encryptionService, type DecryptedTokens } from '../../services/EncryptionService.js';
import { logger } from '../../utils/logger.js';
import type { IntegrationProvider } from '../../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface OAuthConfig {
  provider: IntegrationProvider;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export interface ValidTokens extends DecryptedTokens {
  expiresAt?: Date;
  scope?: string;
}

// ============================================================================
// OAuthManager Class
// ============================================================================

class OAuthManagerImpl {
  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(config: OAuthConfig, state: string): string {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(config: OAuthConfig, code: string): Promise<TokenResponse> {
    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    });

    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('OAuth token exchange failed', {
          provider: config.provider,
          status: response.status,
          error: errorText,
        });
        throw new Error(`Token exchange failed: ${response.status}`);
      }

      const tokens = await response.json() as TokenResponse;
      return tokens;
    } catch (error) {
      logger.error('OAuth code exchange error', { provider: config.provider, error });
      throw error;
    }
  }

  /**
   * Refresh an access token using refresh token
   */
  async refreshToken(config: OAuthConfig, refreshToken: string): Promise<TokenResponse> {
    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('OAuth token refresh failed', {
          provider: config.provider,
          status: response.status,
          error: errorText,
        });
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const tokens = await response.json() as TokenResponse;
      return tokens;
    } catch (error) {
      logger.error('OAuth token refresh error', { provider: config.provider, error });
      throw error;
    }
  }

  /**
   * Store tokens in database (encrypted)
   */
  async storeTokens(
    userId: string,
    provider: IntegrationProvider,
    tokens: TokenResponse,
    externalUserId?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      const encrypted = await encryptionService.encryptOAuthTokens(
        tokens.access_token,
        tokens.refresh_token
      );

      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;

      await prisma.userIntegration.upsert({
        where: {
          userId_provider: { userId, provider },
        },
        update: {
          accessTokenEncrypted: encrypted.accessTokenEncrypted,
          refreshTokenEncrypted: encrypted.refreshTokenEncrypted,
          tokenExpiresAt: expiresAt,
          scope: tokens.scope,
          externalUserId,
          metadata: (metadata || {}) as object,
          isActive: true,
          connectedAt: new Date(),
        },
        create: {
          userId,
          provider,
          accessTokenEncrypted: encrypted.accessTokenEncrypted,
          refreshTokenEncrypted: encrypted.refreshTokenEncrypted,
          tokenExpiresAt: expiresAt,
          scope: tokens.scope,
          externalUserId,
          metadata: (metadata || {}) as object,
          isActive: true,
        },
      });

      logger.info('OAuth tokens stored', { userId, provider });
    } catch (error) {
      logger.error('Failed to store OAuth tokens', { userId, provider, error });
      throw error;
    }
  }

  /**
   * Get valid tokens, refreshing if needed
   */
  async getValidTokens(
    userId: string,
    provider: IntegrationProvider,
    refreshConfig?: OAuthConfig
  ): Promise<ValidTokens | null> {
    try {
      const integration = await prisma.userIntegration.findUnique({
        where: {
          userId_provider: { userId, provider },
        },
      });

      if (!integration || !integration.isActive || !integration.accessTokenEncrypted) {
        return null;
      }

      // Check if token is expiring soon (5 minute buffer)
      const needsRefresh = this.isTokenExpiringSoon(integration.tokenExpiresAt, 5);

      if (needsRefresh && integration.refreshTokenEncrypted && refreshConfig) {
        // Decrypt refresh token and get new tokens
        const decrypted = await encryptionService.decryptOAuthTokens(
          integration.accessTokenEncrypted,
          integration.refreshTokenEncrypted
        );

        if (decrypted.refreshToken) {
          try {
            const newTokens = await this.refreshToken(refreshConfig, decrypted.refreshToken);

            // Store new tokens
            await this.storeTokens(userId, provider, {
              ...newTokens,
              refresh_token: newTokens.refresh_token || decrypted.refreshToken,
            });

            return {
              accessToken: newTokens.access_token,
              refreshToken: newTokens.refresh_token || decrypted.refreshToken,
              expiresAt: newTokens.expires_in
                ? new Date(Date.now() + newTokens.expires_in * 1000)
                : undefined,
              scope: newTokens.scope,
            };
          } catch (error) {
            logger.error('Token refresh failed, returning existing token', { userId, provider, error });
            // Fall through to return existing tokens
          }
        }
      }

      // Return existing tokens
      const decrypted = await encryptionService.decryptOAuthTokens(
        integration.accessTokenEncrypted,
        integration.refreshTokenEncrypted || undefined
      );

      return {
        ...decrypted,
        expiresAt: integration.tokenExpiresAt || undefined,
        scope: integration.scope || undefined,
      };
    } catch (error) {
      logger.error('Failed to get valid tokens', { userId, provider, error });
      throw error;
    }
  }

  /**
   * Check if token is expiring soon
   */
  isTokenExpiringSoon(expiresAt: Date | null, bufferMinutes: number = 5): boolean {
    if (!expiresAt) {
      return false;
    }
    const bufferMs = bufferMinutes * 60 * 1000;
    return new Date(expiresAt).getTime() - Date.now() < bufferMs;
  }

  /**
   * Disconnect an integration
   */
  async disconnect(userId: string, provider: IntegrationProvider): Promise<void> {
    try {
      await prisma.userIntegration.update({
        where: {
          userId_provider: { userId, provider },
        },
        data: {
          isActive: false,
          accessTokenEncrypted: null,
          refreshTokenEncrypted: null,
          tokenExpiresAt: null,
        },
      });

      logger.info('Integration disconnected', { userId, provider });
    } catch (error) {
      logger.error('Failed to disconnect integration', { userId, provider, error });
      throw error;
    }
  }

  /**
   * Get integration status
   */
  async getIntegrationStatus(userId: string, provider: IntegrationProvider): Promise<{
    connected: boolean;
    expiresAt?: Date;
    scope?: string;
    lastSyncAt?: Date;
  } | null> {
    try {
      const integration = await prisma.userIntegration.findUnique({
        where: {
          userId_provider: { userId, provider },
        },
      });

      if (!integration) {
        return null;
      }

      return {
        connected: integration.isActive && !!integration.accessTokenEncrypted,
        expiresAt: integration.tokenExpiresAt || undefined,
        scope: integration.scope || undefined,
        lastSyncAt: integration.lastSyncAt || undefined,
      };
    } catch (error) {
      logger.error('Failed to get integration status', { userId, provider, error });
      throw error;
    }
  }

  /**
   * Generate a secure state parameter for OAuth
   */
  generateState(userId: string, provider: IntegrationProvider): string {
    const payload = {
      userId,
      provider,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(2),
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  /**
   * Validate and parse state parameter
   */
  parseState(state: string): { userId: string; provider: IntegrationProvider; timestamp: number } | null {
    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf8');
      const payload = JSON.parse(decoded);

      // Validate state is not too old (10 minutes max)
      if (Date.now() - payload.timestamp > 10 * 60 * 1000) {
        logger.warn('OAuth state expired');
        return null;
      }

      return payload;
    } catch (error) {
      logger.error('Failed to parse OAuth state', { error });
      return null;
    }
  }
}

export const oauthManager = new OAuthManagerImpl();
export default oauthManager;
