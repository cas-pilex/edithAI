/**
 * GoogleOAuthClient
 * Shared OAuth 2.0 client for Gmail and Google Calendar
 */

import { google, Auth } from 'googleapis';
import { config } from '../../config/index.js';
import { oauthManager, type TokenResponse } from '../common/OAuthManager.js';
import { logger } from '../../utils/logger.js';
import type { IntegrationProvider } from '../../types/index.js';

// ============================================================================
// Constants
// ============================================================================

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
];

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

export const ALL_GOOGLE_SCOPES = [
  ...GMAIL_SCOPES,
  ...CALENDAR_SCOPES,
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ============================================================================
// GoogleOAuthClient Class
// ============================================================================

class GoogleOAuthClientImpl {
  private oauth2Client: Auth.OAuth2Client | null = null;

  /**
   * Get or create OAuth2 client
   */
  private getOAuth2Client(): Auth.OAuth2Client {
    if (!this.oauth2Client) {
      if (!config.google.clientId || !config.google.clientSecret) {
        throw new Error('Google OAuth credentials not configured');
      }

      this.oauth2Client = new google.auth.OAuth2(
        config.google.clientId,
        config.google.clientSecret,
        config.google.redirectUri
      );
    }

    return this.oauth2Client;
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(scopes: string[], state: string): string {
    const client = this.getOAuth2Client();

    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      state,
      include_granted_scopes: true,
    });
  }

  /**
   * Generate auth URL for Gmail only
   */
  generateGmailAuthUrl(state: string): string {
    return this.generateAuthUrl(GMAIL_SCOPES, state);
  }

  /**
   * Generate auth URL for Calendar only
   */
  generateCalendarAuthUrl(state: string): string {
    return this.generateAuthUrl(CALENDAR_SCOPES, state);
  }

  /**
   * Generate auth URL for both Gmail and Calendar
   */
  generateFullAuthUrl(state: string): string {
    return this.generateAuthUrl(ALL_GOOGLE_SCOPES, state);
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string): Promise<Auth.Credentials> {
    const client = this.getOAuth2Client();

    try {
      const { tokens } = await client.getToken(code);
      return tokens;
    } catch (error) {
      logger.error('Google OAuth code exchange failed', { error });
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<Auth.Credentials> {
    const client = this.getOAuth2Client();
    client.setCredentials({ refresh_token: refreshToken });

    try {
      const { credentials } = await client.refreshAccessToken();
      return credentials;
    } catch (error) {
      logger.error('Google OAuth token refresh failed', { error });
      throw error;
    }
  }

  /**
   * Get authenticated OAuth2 client for API calls
   */
  getAuthenticatedClient(accessToken: string, refreshToken?: string): Auth.OAuth2Client {
    const client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    return client;
  }

  /**
   * Store tokens and create/update integration
   */
  async storeTokens(
    userId: string,
    credentials: Auth.Credentials,
    provider: IntegrationProvider
  ): Promise<void> {
    if (!credentials.access_token) {
      throw new Error('No access token in credentials');
    }

    // Get user info to store email
    let userEmail: string | undefined;
    try {
      const client = this.getAuthenticatedClient(credentials.access_token);
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const { data } = await oauth2.userinfo.get();
      userEmail = data.email || undefined;
    } catch (error) {
      logger.warn('Failed to get user email from Google', { error });
    }

    const tokenResponse: TokenResponse = {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token || undefined,
      expires_in: credentials.expiry_date
        ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
        : undefined,
      scope: credentials.scope || undefined,
    };

    await oauthManager.storeTokens(
      userId,
      provider,
      tokenResponse,
      userEmail,
      { email: userEmail }
    );

    logger.info('Google tokens stored', { userId, provider, email: userEmail });
  }

  /**
   * Get valid authenticated client for a user
   */
  async getClientForUser(
    userId: string,
    provider: IntegrationProvider
  ): Promise<Auth.OAuth2Client | null> {
    const tokens = await oauthManager.getValidTokens(userId, provider, {
      provider,
      clientId: config.google.clientId!,
      clientSecret: config.google.clientSecret!,
      redirectUri: config.google.redirectUri!,
      scopes: provider === 'GMAIL' ? GMAIL_SCOPES : CALENDAR_SCOPES,
      authUrl: GOOGLE_AUTH_URL,
      tokenUrl: GOOGLE_TOKEN_URL,
    });

    if (!tokens) {
      return null;
    }

    return this.getAuthenticatedClient(tokens.accessToken, tokens.refreshToken);
  }

  /**
   * Verify token is still valid
   */
  async verifyToken(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Revoke OAuth tokens
   */
  async revokeTokens(accessToken: string): Promise<void> {
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${accessToken}`,
        { method: 'POST' }
      );
      logger.info('Google tokens revoked');
    } catch (error) {
      logger.error('Failed to revoke Google tokens', { error });
      throw error;
    }
  }

  /**
   * Get user's Google email from token
   */
  async getUserEmail(accessToken: string): Promise<string | null> {
    try {
      const client = this.getAuthenticatedClient(accessToken);
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const { data } = await oauth2.userinfo.get();
      return data.email || null;
    } catch (error) {
      logger.error('Failed to get user email', { error });
      return null;
    }
  }

  /**
   * Generate state for OAuth flow
   */
  generateState(userId: string, providers: IntegrationProvider[]): string {
    return oauthManager.generateState(userId, providers[0]);
  }

  /**
   * Parse state from OAuth callback
   */
  parseState(state: string): { userId: string; provider: IntegrationProvider } | null {
    return oauthManager.parseState(state);
  }

  /**
   * Check if Google credentials are configured
   */
  isConfigured(): boolean {
    return !!(
      config.google.clientId &&
      config.google.clientSecret &&
      config.google.redirectUri
    );
  }
}

export const googleOAuthClient = new GoogleOAuthClientImpl();
export default googleOAuthClient;
