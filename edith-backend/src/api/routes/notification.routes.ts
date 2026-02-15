/**
 * Notification Routes
 * Manage per-type notification preferences and notification history
 */

import { Router } from 'express';
import type { Router as RouterType } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import type { NotificationChannel } from '@prisma/client';

const router: RouterType = Router();

// All routes require authentication
router.use(authenticate as never);

const NOTIFICATION_TYPES = [
  'DAILY_BRIEFING',
  'MEETING_PREP',
  'MEETING_REMINDER',
  'EMAIL_ALERT',
  'EMAIL_DIGEST',
  'TASK_REMINDER',
  'APPROVAL_REQUEST',
];

const VALID_CHANNELS: NotificationChannel[] = ['IN_APP', 'EMAIL', 'TELEGRAM', 'WHATSAPP', 'SLACK'];

/**
 * GET /api/notifications/preferences
 * Get all notification preferences (with defaults for types without a preference)
 */
router.get('/preferences', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;

    const prefs = await prisma.notificationPreference.findMany({
      where: { userId },
    });

    const prefMap = new Map(prefs.map(p => [p.type, p]));

    // Return all types with defaults
    const preferences = NOTIFICATION_TYPES.map(type => {
      const pref = prefMap.get(type);
      return {
        type,
        channel: pref?.channel || 'IN_APP',
        enabled: pref?.enabled ?? true,
      };
    });

    res.json({ data: preferences });
  } catch (error) {
    logger.error('Failed to fetch notification preferences', { error });
    res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
});

/**
 * PUT /api/notifications/preferences
 * Update notification preferences
 * Body: { preferences: [{ type: string, channel: string, enabled: boolean }] }
 */
router.put('/preferences', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const { preferences } = req.body as {
      preferences: Array<{ type: string; channel: string; enabled: boolean }>;
    };

    if (!Array.isArray(preferences)) {
      res.status(400).json({ error: 'preferences must be an array' });
      return;
    }

    const results = [];
    for (const pref of preferences) {
      if (!NOTIFICATION_TYPES.includes(pref.type)) continue;
      if (!VALID_CHANNELS.includes(pref.channel as NotificationChannel)) continue;

      const result = await prisma.notificationPreference.upsert({
        where: { userId_type: { userId, type: pref.type } },
        update: {
          channel: pref.channel as NotificationChannel,
          enabled: pref.enabled,
        },
        create: {
          userId,
          type: pref.type,
          channel: pref.channel as NotificationChannel,
          enabled: pref.enabled,
        },
      });
      results.push(result);
    }

    res.json({ data: results });
  } catch (error) {
    logger.error('Failed to update notification preferences', { error });
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

/**
 * GET /api/notifications/history
 * Get recent notifications for the user
 */
router.get('/history', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId!;
    const { page = '1', limit = '20', type } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(1, parseInt(page || '1', 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit || '20', 10)));
    const offset = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { userId };
    if (type) where.type = type;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limitNum,
        skip: offset,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          channel: true,
          priority: true,
          status: true,
          sentAt: true,
          readAt: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      data: notifications,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('Failed to fetch notification history', { error });
    res.status(500).json({ error: 'Failed to fetch notification history' });
  }
});

export default router;
