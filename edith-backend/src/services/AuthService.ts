import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../database/client.js';
import {
  clearLoginAttempts,
  recordLoginAttempt,
  deleteAllUserSessions,
} from '../database/redis.js';
import { config } from '../config/index.js';
import { auditService } from './AuditService.js';
import { logger } from '../utils/logger.js';
import { generateSecureToken } from '../utils/encryption.js';
import type {
  JWTPayload,
  TokenPair,
  LoginResult,
  SafeUser,
  CreateUserInput,
  AuditContext,
} from '../types/index.js';

class AuthService {
  /**
   * Register a new user
   */
  async register(input: CreateUserInput, context: AuditContext): Promise<SafeUser> {
    const { email, password, name, timezone, locale } = input;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name,
        timezone: timezone || 'UTC',
        locale: locale || 'en',
        preferences: {
          create: {}, // Create with defaults
        },
      },
      include: {
        preferences: true,
      },
    });

    // Log the registration
    await auditService.logSecurityEvent('LOGIN', user.id, context, {
      action: 'REGISTER',
    });

    await auditService.logCreate('User', user.id, { ...context, userId: user.id });

    logger.info('User registered', { userId: user.id, email: user.email });

    // Return user without password hash
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Login user with email and password
   */
  async login(
    email: string,
    password: string,
    context: AuditContext
  ): Promise<LoginResult> {
    const normalizedEmail = email.toLowerCase();

    // Check rate limiting / lockout
    const { attempts, lockedUntil } = await recordLoginAttempt(normalizedEmail);
    if (lockedUntil) {
      await auditService.logSecurityEvent('FAILED_LOGIN', undefined, context, {
        email: normalizedEmail,
        reason: 'Account locked',
        lockedUntil,
      });
      throw new Error(
        `Account locked. Try again after ${new Date(lockedUntil).toISOString()}`
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      await auditService.logSecurityEvent('FAILED_LOGIN', undefined, context, {
        email: normalizedEmail,
        reason: 'User not found',
        attempts,
      });
      throw new Error('Invalid email or password');
    }

    // Check if user is active
    if (!user.isActive) {
      await auditService.logSecurityEvent('FAILED_LOGIN', user.id, context, {
        reason: 'Account deactivated',
      });
      throw new Error('Account is deactivated');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      await auditService.logSecurityEvent('FAILED_LOGIN', user.id, context, {
        reason: 'Invalid password',
        attempts,
      });
      throw new Error('Invalid email or password');
    }

    // Clear login attempts on success
    await clearLoginAttempts(normalizedEmail);

    // Generate tokens
    const tokens = await this.generateTokenPair(user.id, user.email, user.role);

    // Create session
    await this.createSession(user.id, tokens, context);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Log successful login
    await auditService.logSecurityEvent('LOGIN', user.id, context);

    logger.info('User logged in', { userId: user.id });

    // Return user without password hash
    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, tokens };
  }

  /**
   * Logout user (invalidate refresh token)
   */
  async logout(userId: string, refreshToken: string, context: AuditContext): Promise<void> {
    // Find and delete the session
    const session = await prisma.session.findUnique({
      where: { refreshToken },
    });

    if (session && session.userId === userId) {
      await prisma.session.delete({
        where: { id: session.id },
      });
    }

    await auditService.logSecurityEvent('LOGOUT', userId, context);
    logger.info('User logged out', { userId });
  }

  /**
   * Logout from all sessions
   */
  async logoutAll(userId: string, context: AuditContext): Promise<void> {
    await prisma.session.deleteMany({
      where: { userId },
    });

    await deleteAllUserSessions(userId);

    await auditService.logSecurityEvent('LOGOUT', userId, context, {
      action: 'LOGOUT_ALL',
    });

    logger.info('User logged out from all sessions', { userId });
  }

  /**
   * Refresh access token
   */
  async refreshToken(
    refreshToken: string,
    context: AuditContext
  ): Promise<TokenPair> {
    // Find session
    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session) {
      throw new Error('Invalid refresh token');
    }

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } });
      throw new Error('Refresh token expired');
    }

    // Check if user is active
    if (!session.user.isActive) {
      await prisma.session.delete({ where: { id: session.id } });
      throw new Error('Account is deactivated');
    }

    // Generate new tokens
    const tokens = await this.generateTokenPair(
      session.user.id,
      session.user.email,
      session.user.role
    );

    // Update session with new tokens (one-time use refresh token)
    await prisma.session.update({
      where: { id: session.id },
      data: {
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: this.getRefreshTokenExpiry(),
      },
    });

    await auditService.logSecurityEvent('TOKEN_REFRESH', session.user.id, context);

    return tokens;
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, config.auth.jwtSecret) as JWTPayload;
    } catch {
      throw new Error('Invalid or expired access token');
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string, context: AuditContext): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // Don't reveal if user exists
      return 'If an account exists, a reset email will be sent';
    }

    // Generate reset token
    const resetToken = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    // Store token (in a real app, you'd have a password_reset_tokens table)
    // For now, we'll use the session table with a special marker
    await prisma.session.create({
      data: {
        userId: user.id,
        token: `reset:${resetToken}`,
        refreshToken: `reset:${resetToken}`,
        expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    await auditService.logSecurityEvent('PASSWORD_CHANGE', user.id, context, {
      action: 'RESET_REQUESTED',
    });

    logger.info('Password reset requested', { userId: user.id });

    // In a real app, you'd send an email here
    // For now, return the token (only in development)
    if (config.isDevelopment) {
      return resetToken;
    }

    return 'If an account exists, a reset email will be sent';
  }

  /**
   * Reset password with token
   */
  async resetPassword(
    token: string,
    newPassword: string,
    context: AuditContext
  ): Promise<void> {
    // Find reset session
    const session = await prisma.session.findFirst({
      where: {
        token: `reset:${token}`,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!session) {
      throw new Error('Invalid or expired reset token');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, config.auth.bcryptRounds);

    // Update password
    await prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash },
    });

    // Delete reset session
    await prisma.session.delete({ where: { id: session.id } });

    // Invalidate all other sessions for security
    await prisma.session.deleteMany({
      where: { userId: session.userId },
    });

    await auditService.logSecurityEvent('PASSWORD_CHANGE', session.userId, context, {
      action: 'PASSWORD_RESET',
    });

    logger.info('Password reset completed', { userId: session.userId });
  }

  /**
   * Change password (authenticated)
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    context: AuditContext
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      await auditService.logSecurityEvent('PASSWORD_CHANGE', userId, context, {
        action: 'CHANGE_FAILED',
        reason: 'Invalid current password',
      });
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, config.auth.bcryptRounds);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await auditService.logSecurityEvent('PASSWORD_CHANGE', userId, context, {
      action: 'PASSWORD_CHANGED',
    });

    logger.info('Password changed', { userId });
  }

  /**
   * Get current user
   */
  async getCurrentUser(userId: string): Promise<SafeUser | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    });

    if (!user) return null;

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  // ==================== PRIVATE METHODS ====================

  private async generateTokenPair(
    userId: string,
    email: string,
    role: string
  ): Promise<TokenPair> {
    const payload: JWTPayload = { userId, email, role };

    const accessToken = jwt.sign(payload, config.auth.jwtSecret, {
      expiresIn: config.auth.accessTokenExpiry as jwt.SignOptions['expiresIn'],
    });

    const refreshToken = uuidv4();

    return { accessToken, refreshToken };
  }

  private async createSession(
    userId: string,
    tokens: TokenPair,
    context: AuditContext
  ): Promise<void> {
    await prisma.session.create({
      data: {
        userId,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: this.getRefreshTokenExpiry(),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  }

  private getRefreshTokenExpiry(): Date {
    // Parse expiry string (e.g., '7d' -> 7 days)
    const expiry = config.auth.refreshTokenExpiry;
    const value = parseInt(expiry);
    const unit = expiry.slice(-1);

    let ms: number;
    switch (unit) {
      case 'd':
        ms = value * 24 * 60 * 60 * 1000;
        break;
      case 'h':
        ms = value * 60 * 60 * 1000;
        break;
      case 'm':
        ms = value * 60 * 1000;
        break;
      default:
        ms = 7 * 24 * 60 * 60 * 1000; // 7 days default
    }

    return new Date(Date.now() + ms);
  }
}

export const authService = new AuthService();
export default authService;
