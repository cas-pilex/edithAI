/**
 * EmailDigestWorker
 * Compiles and sends email digests based on user preferences
 */

import { Job } from 'bullmq';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';
import { notificationService } from '../../services/NotificationService.js';
import { BaseWorker } from './BaseWorker.js';
import type {
  EmailDigestJobData,
  EmailDigestResult,
  JobExecutionContext,
} from '../types.js';
import type { EmailCategory } from '@prisma/client';

interface DigestEmail {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  category: EmailCategory | null;
  priorityScore: number | null;
  receivedAt: Date;
}

interface DigestSection {
  category: string;
  emails: DigestEmail[];
}

export class EmailDigestWorker extends BaseWorker<EmailDigestJobData> {
  protected queueName = 'email';
  protected jobType = 'EMAIL_DIGEST' as const;

  protected async execute(
    job: Job<EmailDigestJobData>,
    context: JobExecutionContext
  ): Promise<EmailDigestResult> {
    const { userId } = context;
    const frequency = job.data.frequency || 'HOURLY';

    logger.info('Generating email digest', { userId, frequency, jobId: job.id });

    // Calculate time window based on frequency
    const { startTime, endTime } = this.getTimeWindow(frequency);

    // Get new emails since last digest
    const emails = await prisma.email.findMany({
      where: {
        userId,
        receivedAt: { gte: startTime, lte: endTime },
        isRead: false,
      },
      orderBy: [
        { priorityScore: 'desc' },
        { receivedAt: 'desc' },
      ],
      take: 50,
      select: {
        id: true,
        subject: true,
        fromAddress: true,
        fromName: true,
        snippet: true,
        category: true,
        priorityScore: true,
        receivedAt: true,
      },
    });

    if (emails.length === 0) {
      logger.info('No new emails for digest', { userId, frequency });
      return {
        success: true,
        data: {
          emailsIncluded: 0,
          skipped: true,
          reason: 'No new emails',
        },
      };
    }

    // Group emails by category
    const sections = this.groupByCategory(
      emails.map((e) => ({
        id: e.id,
        subject: e.subject,
        from: e.fromName || e.fromAddress,
        snippet: e.snippet || '',
        category: e.category,
        priorityScore: e.priorityScore,
        receivedAt: e.receivedAt,
      }))
    );

    // Format digest
    const { title, body, urgentCount } = this.formatDigest(sections, frequency);

    // Send notification
    await notificationService.send({
      userId,
      type: 'EMAIL_DIGEST',
      title,
      body,
      data: {
        frequency,
        emailCount: emails.length,
        urgentCount,
        sections: sections.map((s) => ({
          category: s.category,
          count: s.emails.length,
        })),
      },
      priority: urgentCount > 0 ? 'HIGH' : 'NORMAL',
    });

    logger.info('Email digest sent', {
      userId,
      emailCount: emails.length,
      urgentCount,
    });

    return {
      success: true,
      data: {
        emailsIncluded: emails.length,
        urgentCount,
        categories: sections.map((s) => s.category),
      },
    };
  }

  /**
   * Calculate time window based on digest frequency
   */
  private getTimeWindow(frequency: string): { startTime: Date; endTime: Date } {
    const endTime = new Date();
    const startTime = new Date();

    switch (frequency) {
      case 'HOURLY':
        startTime.setHours(startTime.getHours() - 1);
        break;
      case 'EVERY_4_HOURS':
        startTime.setHours(startTime.getHours() - 4);
        break;
      case 'DAILY':
        startTime.setDate(startTime.getDate() - 1);
        break;
      default:
        startTime.setHours(startTime.getHours() - 1);
    }

    return { startTime, endTime };
  }

  /**
   * Group emails by category
   */
  private groupByCategory(emails: DigestEmail[]): DigestSection[] {
    const categoryOrder: EmailCategory[] = [
      'URGENT',
      'ACTION_REQUIRED',
      'FOLLOW_UP',
      'FYI',
      'NEWSLETTER',
      'SPAM',
    ];

    const grouped: Map<string, DigestEmail[]> = new Map();

    for (const email of emails) {
      const category = email.category || 'FYI';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(email);
    }

    // Sort sections by category priority
    const sections: DigestSection[] = [];
    for (const category of categoryOrder) {
      if (grouped.has(category)) {
        sections.push({
          category,
          emails: grouped.get(category)!,
        });
      }
    }

    return sections;
  }

  /**
   * Format digest into notification content
   */
  private formatDigest(
    sections: DigestSection[],
    frequency: string
  ): { title: string; body: string; urgentCount: number } {
    const totalEmails = sections.reduce((sum, s) => sum + s.emails.length, 0);
    const urgentSection = sections.find((s) => s.category === 'URGENT');
    const urgentCount = urgentSection?.emails.length || 0;

    const frequencyLabel = this.getFrequencyLabel(frequency);
    const title = `${frequencyLabel} Email Digest (${totalEmails} new)`;

    const lines: string[] = [];

    // Urgent emails first
    if (urgentSection && urgentSection.emails.length > 0) {
      lines.push('🔴 URGENT:');
      for (const email of urgentSection.emails.slice(0, 3)) {
        lines.push(`  • ${email.from}: ${email.subject}`);
      }
      if (urgentSection.emails.length > 3) {
        lines.push(`  ... +${urgentSection.emails.length - 3} more urgent`);
      }
      lines.push('');
    }

    // Action required
    const actionSection = sections.find((s) => s.category === 'ACTION_REQUIRED');
    if (actionSection && actionSection.emails.length > 0) {
      lines.push(`⚡ Action Required (${actionSection.emails.length}):`);
      for (const email of actionSection.emails.slice(0, 2)) {
        lines.push(`  • ${email.from}: ${email.subject}`);
      }
      lines.push('');
    }

    // Summary of other categories
    const otherSections = sections.filter(
      (s) => !['URGENT', 'ACTION_REQUIRED'].includes(s.category)
    );
    if (otherSections.length > 0) {
      lines.push('Other:');
      for (const section of otherSections) {
        const icon = this.getCategoryIcon(section.category);
        lines.push(`  ${icon} ${section.category}: ${section.emails.length} emails`);
      }
    }

    return {
      title,
      body: lines.join('\n'),
      urgentCount,
    };
  }

  /**
   * Get frequency label for title
   */
  private getFrequencyLabel(frequency: string): string {
    switch (frequency) {
      case 'HOURLY':
        return 'Hourly';
      case 'EVERY_4_HOURS':
        return '4-Hour';
      case 'DAILY':
        return 'Daily';
      default:
        return '';
    }
  }

  /**
   * Get icon for email category
   */
  private getCategoryIcon(category: string): string {
    switch (category) {
      case 'URGENT':
        return '🔴';
      case 'ACTION_REQUIRED':
        return '⚡';
      case 'FOLLOW_UP':
        return '🔄';
      case 'FYI':
        return '📋';
      case 'NEWSLETTER':
        return '📰';
      case 'SPAM':
        return '🚫';
      default:
        return '📧';
    }
  }

  protected async updateMetrics(
    context: JobExecutionContext,
    result: EmailDigestResult
  ): Promise<void> {
    // Email digest doesn't directly update success metrics
  }
}

export const emailDigestWorker = new EmailDigestWorker();
