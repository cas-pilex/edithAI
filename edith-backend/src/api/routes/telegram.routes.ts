/**
 * Telegram Integration Routes
 * Account linking and status
 */

import { Router } from 'express';
import type { Router as RouterType } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';
import type { AuthenticatedRequest } from '../../types/index.js';

const router: RouterType = Router();

// All routes require authentication
router.use(authenticate as never);

/**
 * POST /api/integrations/telegram/link
 * Link a Telegram account using a link token
 */
router.post('/link', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const userId = req.userId!;
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    // Find and validate the link token
    const linkToken = await prisma.telegramLinkToken.findUnique({
      where: { token },
    });

    if (!linkToken) {
      res.status(404).json({ error: 'Invalid or expired token' });
      return;
    }

    if (linkToken.usedAt) {
      res.status(400).json({ error: 'Token has already been used' });
      return;
    }

    if (linkToken.expiresAt < new Date()) {
      res.status(400).json({ error: 'Token has expired. Please use /start in Telegram again.' });
      return;
    }

    if (!linkToken.telegramId) {
      res.status(400).json({ error: 'Invalid token: missing Telegram ID' });
      return;
    }

    // Link the Telegram account
    const { telegramBot } = await import('../../integrations/telegram/TelegramBot.js');

    await telegramBot.linkUser(userId, {
      telegramId: Number(linkToken.telegramId),
      firstName: 'User',
    });

    // Mark token as used
    await prisma.telegramLinkToken.update({
      where: { id: linkToken.id },
      data: { usedAt: new Date(), userId },
    });

    // Send confirmation to Telegram chat
    if (linkToken.chatId) {
      const bot = telegramBot.getBot();
      if (bot) {
        await bot.telegram.sendMessage(
          Number(linkToken.chatId),
          '✅ Account linked successfully! You can now use all Edith commands.\n\nTry /today to get your daily briefing.'
        ).catch((err: unknown) => {
          logger.error('Failed to send Telegram confirmation', { error: err });
        });
      }
    }

    logger.info('Telegram account linked via web', { userId, telegramId: linkToken.telegramId });

    res.json({ success: true, message: 'Telegram account linked successfully' });
  } catch (error) {
    logger.error('Failed to link Telegram account', { error });
    res.status(500).json({ error: 'Failed to link Telegram account' });
  }
});

/**
 * GET /api/integrations/telegram/status
 * Check if user has a linked Telegram account
 */
router.get('/status', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const userId = req.userId!;

    const integration = await prisma.userIntegration.findUnique({
      where: { userId_provider: { userId, provider: 'TELEGRAM' } },
      select: {
        isActive: true,
        metadata: true,
        connectedAt: true,
      },
    });

    if (!integration || !integration.isActive) {
      res.json({ linked: false });
      return;
    }

    const metadata = integration.metadata as Record<string, unknown> | null;

    res.json({
      linked: true,
      username: metadata?.username || null,
      firstName: metadata?.firstName || null,
      linkedAt: integration.connectedAt,
    });
  } catch (error) {
    logger.error('Failed to check Telegram status', { error });
    res.status(500).json({ error: 'Failed to check Telegram status' });
  }
});

/**
 * DELETE /api/integrations/telegram/unlink
 * Unlink Telegram account
 */
router.delete('/unlink', async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const userId = req.userId!;

    const { telegramBot } = await import('../../integrations/telegram/TelegramBot.js');
    await telegramBot.unlinkUser(userId);

    logger.info('Telegram account unlinked via web', { userId });

    res.json({ success: true, message: 'Telegram account unlinked' });
  } catch (error) {
    logger.error('Failed to unlink Telegram account', { error });
    res.status(500).json({ error: 'Failed to unlink Telegram account' });
  }
});

export default router;
