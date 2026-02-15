/**
 * InboxProcessorWorker
 * System-wide job that processes new emails for all users with Gmail connected
 */

import { Job } from 'bullmq';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';
import { notificationService } from '../../services/NotificationService.js';
import { inboxService } from '../../services/InboxService.js';
import { aiService } from '../../services/AIService.js';
import { BaseWorker } from './BaseWorker.js';
import type {
  InboxProcessorJobData,
  InboxProcessorResult,
  JobExecutionContext,
  JobResult,
} from '../types.js';
import type { EmailCategory } from '@prisma/client';

export class InboxProcessorWorker extends BaseWorker<InboxProcessorJobData> {
  protected queueName = 'email';
  protected jobType = 'INBOX_PROCESSOR' as const;

  protected async execute(
    job: Job<InboxProcessorJobData>,
    context: JobExecutionContext
  ): Promise<InboxProcessorResult> {
    const maxEmailsPerUser = job.data.maxEmailsPerUser || 50;
    const errors: string[] = [];
    let usersProcessed = 0;
    let totalEmailsProcessed = 0;
    let urgentAlertsSent = 0;

    logger.info('Starting inbox processor', { jobId: job.id, maxEmailsPerUser });

    // Get all users with Gmail integration
    const integrations = await prisma.userIntegration.findMany({
      where: {
        provider: 'GMAIL',
        isActive: true,
      },
      include: {
        user: {
          include: { preferences: true },
        },
      },
    });

    logger.info('Processing inboxes', { userCount: integrations.length });

    for (const integration of integrations) {
      try {
        const result = await this.processUserInbox(
          integration.userId,
          integration.lastSyncAt,
          maxEmailsPerUser,
          integration.user.preferences?.digestFrequency || 'REALTIME'
        );

        usersProcessed++;
        totalEmailsProcessed += result.emailsProcessed;
        urgentAlertsSent += result.urgentAlertsSent;

        // Update last sync time
        await prisma.userIntegration.update({
          where: { id: integration.id },
          data: { lastSyncAt: new Date() },
        });
      } catch (error) {
        const errorMessage = `User ${integration.userId}: ${(error as Error).message}`;
        errors.push(errorMessage);
        logger.error('Failed to process inbox for user', {
          userId: integration.userId,
          error: (error as Error).message,
        });
      }
    }

    logger.info('Inbox processor completed', {
      usersProcessed,
      totalEmailsProcessed,
      urgentAlertsSent,
      errors: errors.length,
    });

    return {
      success: true,
      data: {
        usersProcessed,
        totalEmailsProcessed,
        urgentAlertsSent,
        errors,
      },
    };
  }

  /**
   * Process inbox for a single user
   * Uses AI batch categorization when available, falls back to keyword matching
   */
  private async processUserInbox(
    userId: string,
    lastSyncAt: Date | null,
    maxEmails: number,
    digestFrequency: string
  ): Promise<{ emailsProcessed: number; urgentAlertsSent: number }> {
    let emailsProcessed = 0;
    let urgentAlertsSent = 0;

    // Get unprocessed emails since last sync
    const emails = await prisma.email.findMany({
      where: {
        userId,
        processingStatus: 'PENDING',
        receivedAt: lastSyncAt ? { gte: lastSyncAt } : undefined,
      },
      orderBy: { receivedAt: 'desc' },
      take: maxEmails,
    });

    if (emails.length === 0) return { emailsProcessed: 0, urgentAlertsSent: 0 };

    // Try AI batch categorization first
    let aiResults: Map<string, { category: EmailCategory; priorityScore: number }> | null = null;

    if (aiService.isConfigured) {
      try {
        // Process in batches of 20
        const allCategorizations: Array<{ emailId: string; category: string; priorityScore: number }> = [];

        for (let i = 0; i < emails.length; i += 20) {
          const batch = emails.slice(i, i + 20).map(e => ({
            id: e.id,
            fromAddress: e.fromAddress,
            fromName: e.fromName,
            subject: e.subject,
            snippet: e.snippet,
            labels: e.labels,
          }));

          const results = await aiService.categorizeEmails(batch);
          allCategorizations.push(...results);
        }

        // Build lookup map
        aiResults = new Map();
        for (const result of allCategorizations) {
          aiResults.set(result.emailId, {
            category: result.category as EmailCategory,
            priorityScore: result.priorityScore,
          });
        }

        logger.info('AI batch categorization complete', {
          userId,
          emailCount: emails.length,
          categorized: aiResults.size,
        });
      } catch (error) {
        logger.error('AI categorization failed, falling back to keyword matching', {
          userId,
          error: (error as Error).message,
        });
        aiResults = null;
      }
    }

    // Process each email with AI results or fallback
    for (const email of emails) {
      try {
        let category: EmailCategory;
        let priorityScore: number;

        const aiResult = aiResults?.get(email.id);
        if (aiResult) {
          category = aiResult.category;
          priorityScore = aiResult.priorityScore;
        } else {
          // Fallback to keyword matching
          priorityScore = this.calculatePriorityScore(email) * 10; // Scale 1-10 to 0-100
          category = email.category || this.categorizeEmail(email);
        }

        // Update email with analysis results
        await prisma.email.update({
          where: { id: email.id },
          data: {
            priorityScore,
            category,
            processingStatus: 'COMPLETED',
            processedAt: new Date(),
          },
        });

        emailsProcessed++;

        // Send alert for urgent/high-priority emails
        if (priorityScore >= 80 && digestFrequency === 'REALTIME') {
          await notificationService.send({
            userId,
            type: 'EMAIL_ALERT',
            title: 'Important Email',
            body: `From: ${email.fromName || email.fromAddress}\n${email.subject}`,
            data: {
              from: email.fromName || email.fromAddress,
              subject: email.subject,
              snippet: email.snippet,
              isImportant: true,
              messageId: email.id,
              category,
            },
            priority: 'HIGH',
          });
          urgentAlertsSent++;
        }
      } catch (error) {
        // Mark as failed but continue processing others
        await prisma.email.update({
          where: { id: email.id },
          data: {
            processingStatus: 'FAILED',
            processedAt: new Date(),
          },
        });
        logger.error('Failed to process email', {
          emailId: email.id,
          error: (error as Error).message,
        });
      }
    }

    // Update success metrics
    if (emailsProcessed > 0) {
      await this.incrementUserMetric(userId, 'emailsProcessed', emailsProcessed);
    }

    return { emailsProcessed, urgentAlertsSent };
  }

  /**
   * Increment a user's daily metric
   */
  private async incrementUserMetric(
    userId: string,
    metric: 'emailsProcessed' | 'emailsDrafted',
    increment: number
  ): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.successMetrics.upsert({
      where: { userId_date: { userId, date: today } },
      create: {
        userId,
        date: today,
        [metric]: increment,
      },
      update: {
        [metric]: { increment },
      },
    });
  }

  protected async updateMetrics(
    context: JobExecutionContext,
    result: JobResult
  ): Promise<void> {
    // Metrics are updated per-user during processing
  }

  /**
   * Calculate priority score based on email attributes
   * Score: 1-10 where 10 is highest priority
   */
  private calculatePriorityScore(email: {
    fromAddress: string;
    subject: string;
    snippet: string | null;
    isRead: boolean;
    labels: string[];
  }): number {
    let score = 5; // Base score

    // Check for urgent keywords in subject
    const urgentKeywords = ['urgent', 'asap', 'important', 'deadline', 'action required', 'immediate'];
    const subjectLower = email.subject.toLowerCase();
    if (urgentKeywords.some(kw => subjectLower.includes(kw))) {
      score += 2;
    }

    // Check for VIP domains (would be user-configurable in production)
    const vipDomains = ['@google.com', '@microsoft.com', '@anthropic.com'];
    if (vipDomains.some(domain => email.fromAddress.toLowerCase().includes(domain))) {
      score += 1;
    }

    // Unread emails get slight boost
    if (!email.isRead) {
      score += 1;
    }

    // Gmail labels
    if (email.labels.includes('IMPORTANT')) {
      score += 2;
    }
    if (email.labels.includes('STARRED')) {
      score += 1;
    }

    // Cap score at 10
    return Math.min(score, 10);
  }

  /**
   * Categorize email based on content analysis
   * Returns EmailCategory enum values from Prisma schema
   */
  private categorizeEmail(email: {
    fromAddress: string;
    subject: string;
    snippet: string | null;
  }): EmailCategory {
    const subjectLower = email.subject.toLowerCase();
    const snippetLower = (email.snippet || '').toLowerCase();
    const combined = `${subjectLower} ${snippetLower}`;

    // Urgent keywords
    const urgentKeywords = ['urgent', 'asap', 'immediately', 'critical', 'emergency'];
    if (urgentKeywords.some(kw => combined.includes(kw))) {
      return 'URGENT';
    }

    // Action required
    if (combined.includes('action required') || combined.includes('please respond') || combined.includes('response needed')) {
      return 'ACTION_REQUIRED';
    }

    // Follow-up indicators
    if (combined.includes('follow up') || combined.includes('following up') || combined.includes('checking in')) {
      return 'FOLLOW_UP';
    }

    // Newsletter/promotional
    if (combined.includes('unsubscribe') || combined.includes('newsletter') || combined.includes('promotional')) {
      return 'NEWSLETTER';
    }

    // Spam indicators
    if (combined.includes('win') || combined.includes('free') || combined.includes('limited time')) {
      return 'SPAM';
    }

    // Default to FYI for general emails
    return 'FYI';
  }
}

export const inboxProcessorWorker = new InboxProcessorWorker();
