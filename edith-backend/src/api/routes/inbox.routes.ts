/**
 * Inbox API Routes
 * Email management and categorization
 */

import { Router } from 'express';
import type { Router as RouterType, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody, validateUUID } from '../middleware/validation.middleware.js';
import { prisma } from '../../database/client.js';
import { inboxService } from '../../services/InboxService.js';
import { gmailSyncWorker } from '../../integrations/google/GmailSyncWorker.js';
import { syncManager } from '../../integrations/common/SyncManager.js';
import { aiService } from '../../services/AIService.js';
import { createGmailClientForUser } from '../../integrations/google/GmailClient.js';
import { sendSuccess, sendPaginated, sendError } from '../../utils/helpers.js';
import { NotFoundError } from '../../utils/errors.js';
import {
  updateEmailCategorySchema,
  starEmailSchema,
  bulkEmailsSchema,
  draftReplySchema,
  sendReplySchema,
  sendEmailSchema,
} from '../../utils/validation.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const router: RouterType = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Transform DB email fields to frontend-expected field names
 */
function transformEmail(email: Record<string, unknown>): Record<string, unknown> {
  return {
    ...email,
    from: email.fromName
      ? `${email.fromName} <${email.fromAddress}>`
      : (email.fromAddress as string),
    to: email.toAddresses,
    cc: email.ccAddresses || [],
    bcc: [],
    body: (email.bodyHtml || email.bodyText || '') as string,
  };
}

/**
 * GET /inbox
 * List emails with filters and pagination
 */
router.get(
  '/',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { page, limit, category, isRead, isStarred, isArchived, fromAddress, search, startDate, endDate, label } = req.query;

      const pageNum = Number(page) || 1;
      const limitNum = Math.min(Number(limit) || 20, 100);
      const offset = (pageNum - 1) * limitNum;

      // Parse filters
      const parsedFilters = {
        category: category as string | undefined,
        isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
        isStarred: isStarred === 'true' ? true : isStarred === 'false' ? false : undefined,
        isArchived: isArchived === 'true' ? true : isArchived === 'false' ? false : undefined,
        fromAddress: fromAddress as string | undefined,
        search: search as string | undefined,
        startDate: startDate ? new Date(String(startDate)) : undefined,
        endDate: endDate ? new Date(String(endDate)) : undefined,
        label: label as string | undefined,
      };

      const { emails, total } = await inboxService.getEmails(
        userId,
        parsedFilters,
        { limit: limitNum, offset }
      );

      const transformed = emails.map(e => transformEmail(e as Record<string, unknown>));
      sendPaginated(res, transformed, pageNum, limitNum, total);
    } catch (error) {
      logger.error('Failed to get emails', { error });
      sendError(res, 'Failed to retrieve emails', 500);
    }
  }
);

/**
 * GET /inbox/stats
 * Get inbox statistics
 */
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const stats = await inboxService.getStats(userId);
    sendSuccess(res, stats);
  } catch (error) {
    logger.error('Failed to get inbox stats', { error });
    sendError(res, 'Failed to retrieve inbox statistics', 500);
  }
});

/**
 * GET /inbox/briefing
 * Get or generate daily AI briefing from unread emails
 */
router.get('/briefing', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;

    if (!aiService.isConfigured) {
      sendError(res, 'AI service not configured', 503);
      return;
    }

    // Check if we already have a briefing from today (stored as notification)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingBriefing = await prisma.notification.findFirst({
      where: {
        userId,
        type: 'DAILY_BRIEFING',
        createdAt: { gte: today },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingBriefing?.data && (existingBriefing.data as Record<string, unknown>).aiBriefing) {
      sendSuccess(res, (existingBriefing.data as Record<string, unknown>).aiBriefing);
      return;
    }

    // Generate on-demand: fetch unread INBOX emails
    const unreadEmails = await prisma.email.findMany({
      where: {
        userId,
        isRead: false,
        isArchived: false,
        labels: { has: 'INBOX' },
      },
      orderBy: { receivedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        fromAddress: true,
        fromName: true,
        subject: true,
        snippet: true,
        bodyText: true,
        receivedAt: true,
        labels: true,
      },
    });

    if (unreadEmails.length === 0) {
      sendSuccess(res, {
        summary: 'No unread emails in your inbox.',
        urgentItems: [],
        questionsToAnswer: [],
        fyiItems: [],
        extractedTasks: [],
        totalUnread: 0,
      });
      return;
    }

    const briefing = await aiService.generateDailyBriefing(unreadEmails);

    if (!briefing) {
      sendError(res, 'Failed to generate briefing', 500);
      return;
    }

    sendSuccess(res, briefing);
  } catch (error) {
    logger.error('Failed to get briefing', { error });
    sendError(res, 'Failed to generate briefing', 500);
  }
});

/**
 * GET /inbox/threads
 * Get email threads
 */
router.get('/threads', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const threads = await inboxService.getThreads(userId, limit);
    sendSuccess(res, threads);
  } catch (error) {
    logger.error('Failed to get email threads', { error });
    sendError(res, 'Failed to retrieve email threads', 500);
  }
});

/**
 * GET /inbox/rules
 * Get email rules
 */
router.get('/rules', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const rules = await inboxService.getRules(userId);
    sendSuccess(res, rules);
  } catch (error) {
    logger.error('Failed to get email rules', { error });
    sendError(res, 'Failed to retrieve email rules', 500);
  }
});

/**
 * POST /inbox/rules
 * Create email rule
 */
router.post('/rules', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { name, conditions, actions, isActive } = req.body;

    const rule = await inboxService.createRule(userId, {
      name,
      conditions,
      actions,
      isActive,
    });

    sendSuccess(res, rule, 'Email rule created', 201);
  } catch (error) {
    logger.error('Failed to create email rule', { error });
    sendError(res, 'Failed to create email rule', 500);
  }
});

/**
 * DELETE /inbox/rules/:id
 * Delete email rule
 */
router.delete(
  '/rules/:id',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      await inboxService.deleteRule(id, userId);
      sendSuccess(res, { deleted: true }, 'Email rule deleted');
    } catch (error) {
      logger.error('Failed to delete email rule', { error, ruleId: req.params.id });
      sendError(res, 'Failed to delete email rule', 500);
    }
  }
);

/**
 * GET /inbox/thread/:threadId
 * Get emails in a thread
 */
router.get('/thread/:threadId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const threadId = req.params.threadId as string;

    const emails = await inboxService.getThreadEmails(threadId, userId);
    const transformed = emails.map((e: unknown) => transformEmail(e as Record<string, unknown>));
    sendSuccess(res, transformed);
  } catch (error) {
    logger.error('Failed to get thread emails', { error, threadId: req.params.threadId as string });
    sendError(res, 'Failed to retrieve thread emails', 500);
  }
});

/**
 * GET /inbox/:id
 * Get a single email by ID
 */
router.get(
  '/:id',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      const email = await inboxService.getEmailById(id, userId);

      if (!email) {
        throw new NotFoundError('Email');
      }

      // Mark as read when viewed
      await inboxService.updateEmail(id, userId, { isRead: true });

      sendSuccess(res, transformEmail(email as Record<string, unknown>));
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to get email', { error, emailId: req.params.id });
      sendError(res, 'Failed to retrieve email', 500);
    }
  }
);

/**
 * PATCH /inbox/:id/category
 * Update email category
 */
router.patch(
  '/:id/category',
  validateUUID('id'),
  validateBody(updateEmailCategorySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const { category } = req.body;

      // Check if email exists
      const existing = await inboxService.getEmailById(id, userId);
      if (!existing) {
        throw new NotFoundError('Email');
      }

      await inboxService.updateEmail(id, userId, { category });

      const updated = await inboxService.getEmailById(id, userId);
      sendSuccess(res, updated, 'Email category updated');
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to update email category', { error, emailId: req.params.id });
      sendError(res, 'Failed to update email category', 500);
    }
  }
);

/**
 * POST /inbox/:id/archive
 * Archive an email
 */
router.post(
  '/:id/archive',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      // Check if email exists
      const existing = await inboxService.getEmailById(id, userId);
      if (!existing) {
        throw new NotFoundError('Email');
      }

      await inboxService.archiveEmails([id], userId);
      sendSuccess(res, { archived: true }, 'Email archived');
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to archive email', { error, emailId: req.params.id });
      sendError(res, 'Failed to archive email', 500);
    }
  }
);

/**
 * POST /inbox/:id/star
 * Star or unstar an email
 */
router.post(
  '/:id/star',
  validateUUID('id'),
  validateBody(starEmailSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const { starred } = req.body;

      // Check if email exists
      const existing = await inboxService.getEmailById(id, userId);
      if (!existing) {
        throw new NotFoundError('Email');
      }

      // Update labels to include or exclude 'STARRED'
      const currentLabels = (existing.labels as string[]) || [];
      const newLabels = starred
        ? [...new Set([...currentLabels, 'STARRED'])]
        : currentLabels.filter(l => l !== 'STARRED');

      await inboxService.updateEmail(id, userId, { labels: newLabels });

      const updated = await inboxService.getEmailById(id, userId);
      sendSuccess(res, updated, starred ? 'Email starred' : 'Email unstarred');
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to star email', { error, emailId: req.params.id });
      sendError(res, 'Failed to update email star status', 500);
    }
  }
);

/**
 * POST /inbox/:id/draft-reply
 * Generate a draft reply for an email
 */
router.post(
  '/:id/draft-reply',
  validateUUID('id'),
  validateBody(draftReplySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const { tone, includeQuote } = req.body;

      // Check if email exists
      const email = await inboxService.getEmailById(id, userId);
      if (!email) {
        throw new NotFoundError('Email');
      }

      if (!aiService.isConfigured) {
        sendError(res, 'AI service not configured', 503);
        return;
      }

      // Get thread context for better replies
      const threadEmails = email.threadId
        ? await inboxService.getThreadEmails(email.threadId, userId)
        : [];

      const draftBody = await aiService.generateDraftReply({
        email: {
          id: email.id,
          fromAddress: email.fromAddress,
          fromName: email.fromName,
          subject: email.subject,
          bodyText: email.bodyText,
          receivedAt: email.receivedAt,
        },
        threadEmails: (threadEmails as Array<{ fromAddress: string; fromName: string | null; bodyText: string | null; receivedAt: Date }>).map(e => ({
          fromAddress: e.fromAddress,
          fromName: e.fromName,
          bodyText: e.bodyText,
          receivedAt: e.receivedAt,
        })),
        tone: tone || 'professional',
      });

      if (!draftBody) {
        sendError(res, 'Failed to generate draft reply', 500);
        return;
      }

      const draft = {
        to: email.fromAddress,
        subject: `Re: ${email.subject}`,
        body: draftBody,
        draft: draftBody,
        includesQuote: includeQuote ?? true,
        originalEmailId: id,
      };

      sendSuccess(res, draft, 'Draft reply generated');
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to generate draft reply', { error, emailId: req.params.id });
      sendError(res, 'Failed to generate draft reply', 500);
    }
  }
);

/**
 * POST /inbox/:id/reply
 * Send a reply to an email via Gmail
 */
router.post(
  '/:id/reply',
  validateUUID('id'),
  validateBody(sendReplySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const { body, isHtml } = req.body;

      const email = await inboxService.getEmailById(id, userId);
      if (!email) {
        throw new NotFoundError('Email');
      }

      const gmailClient = await createGmailClientForUser(userId);
      if (!gmailClient) {
        sendError(res, 'Gmail not connected', 400);
        return;
      }

      const result = await gmailClient.sendMessage({
        to: [email.fromAddress],
        subject: `Re: ${email.subject}`,
        body,
        isHtml,
        replyToMessageId: email.externalId,
        threadId: email.threadId ?? undefined,
      });

      // Save as EmailDraft with SENT status
      await prisma.emailDraft.create({
        data: {
          userId,
          emailId: id,
          toAddresses: [email.fromAddress],
          subject: `Re: ${email.subject}`,
          body,
          tone: 'MIXED',
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      sendSuccess(res, { sent: true, messageId: result.id }, 'Reply sent');
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to send reply', { error, emailId: req.params.id });
      sendError(res, 'Failed to send reply', 500);
    }
  }
);

/**
 * POST /inbox/bulk
 * Bulk operations on emails
 */
router.post(
  '/bulk',
  validateBody(bulkEmailsSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { action, emailIds, category } = req.body;

      let result: { count: number };

      switch (action) {
        case 'archive':
          result = await inboxService.archiveEmails(emailIds, userId);
          break;

        case 'markRead':
          result = await inboxService.markAsRead(emailIds, userId);
          break;

        case 'markUnread':
          // Mark as unread by updating each email
          for (const emailId of emailIds) {
            await inboxService.updateEmail(emailId, userId, { isRead: false });
          }
          result = { count: emailIds.length };
          break;

        case 'delete':
          // Soft delete by archiving (actual deletion would need a new service method)
          result = await inboxService.archiveEmails(emailIds, userId);
          break;

        case 'updateCategory':
          if (!category) {
            sendError(res, 'Category is required for updateCategory action', 400);
            return;
          }
          for (const emailId of emailIds) {
            await inboxService.updateEmail(emailId, userId, { category });
          }
          result = { count: emailIds.length };
          break;

        default:
          sendError(res, `Unknown action: ${action}`, 400);
          return;
      }

      sendSuccess(res, result, `Bulk ${action} completed`);
    } catch (error) {
      logger.error('Bulk email operation failed', { error });
      sendError(res, 'Bulk operation failed', 500);
    }
  }
);

/**
 * POST /inbox/sync
 * Trigger manual inbox sync
 */
router.post('/sync', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Check if Gmail is connected
    const status = await syncManager.getSyncStatus(userId, 'GMAIL');
    if (!status) {
      sendError(res, 'Gmail not connected. Please connect Gmail first.', 400);
      return;
    }

    // Return immediately, run sync in background
    sendSuccess(res, {
      syncing: true,
      message: 'Inbox sync initiated',
    });

    // Fire-and-forget sync
    const syncToken = await syncManager.getSyncToken(userId, 'GMAIL');
    if (syncToken) {
      gmailSyncWorker.performIncrementalSync(userId, syncToken).catch(err =>
        logger.error('Background incremental Gmail sync failed', { userId, error: err })
      );
    } else {
      gmailSyncWorker.performFullSync(userId).catch(err =>
        logger.error('Background full Gmail sync failed', { userId, error: err })
      );
    }
  } catch (error) {
    logger.error('Failed to trigger inbox sync', { error });
    sendError(res, 'Failed to trigger inbox sync', 500);
  }
});

/**
 * POST /inbox/send
 * Send a new email via Gmail
 */
router.post(
  '/send',
  validateBody(sendEmailSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { to, cc, bcc, subject, body, isHtml } = req.body;

      const gmailClient = await createGmailClientForUser(userId);
      if (!gmailClient) {
        sendError(res, 'Gmail not connected', 400);
        return;
      }

      const result = await gmailClient.sendMessage({
        to,
        cc,
        bcc,
        subject,
        body,
        isHtml,
      });

      // Save as EmailDraft with SENT status
      await prisma.emailDraft.create({
        data: {
          userId,
          toAddresses: to,
          ccAddresses: cc || [],
          subject,
          body,
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      sendSuccess(res, { sent: true, messageId: result.id }, 'Email sent');
    } catch (error) {
      logger.error('Failed to send email', { error });
      sendError(res, 'Failed to send email', 500);
    }
  }
);

export default router;
