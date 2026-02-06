/**
 * RelationshipNurtureWorker
 * Identifies contacts that need attention and suggests outreach
 */

import { Job } from 'bullmq';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';
import { notificationService } from '../../services/NotificationService.js';
import { BaseWorker } from './BaseWorker.js';
import type {
  RelationshipNurtureJobData,
  RelationshipNurtureResult,
  JobExecutionContext,
} from '../types.js';

interface NurtureContact {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  importanceScore: number | null;
  daysSinceContact: number;
  lastInteractionType: string | null;
  suggestedAction: string;
  reason: string;
}

export class RelationshipNurtureWorker extends BaseWorker<RelationshipNurtureJobData> {
  protected queueName = 'maintenance';
  protected jobType = 'RELATIONSHIP_NURTURE' as const;

  protected async execute(
    job: Job<RelationshipNurtureJobData>,
    context: JobExecutionContext
  ): Promise<RelationshipNurtureResult> {
    const { userId } = context;
    const inactiveDays = job.data.inactiveDays || 30;
    const maxContacts = job.data.maxContacts || 5;

    logger.info('Analyzing relationship nurturing needs', {
      userId,
      inactiveDays,
      jobId: job.id,
    });

    // Find contacts that need attention
    const contactsNeedingAttention = await this.findContactsNeedingAttention(
      userId,
      inactiveDays,
      maxContacts
    );

    if (contactsNeedingAttention.length === 0) {
      logger.info('No contacts need attention', { userId });
      return {
        success: true,
        data: {
          contactsAnalyzed: 0,
          suggestionsGenerated: 0,
        },
      };
    }

    // Generate outreach suggestions
    const nurtureContacts = await this.generateNurtureSuggestions(
      contactsNeedingAttention
    );

    // Send digest notification
    await this.sendNurtureDigest(userId, nurtureContacts);

    logger.info('Relationship nurture digest sent', {
      userId,
      contactCount: nurtureContacts.length,
    });

    return {
      success: true,
      data: {
        contactsAnalyzed: contactsNeedingAttention.length,
        suggestionsGenerated: nurtureContacts.length,
        contacts: nurtureContacts.map((c) => ({
          name: c.name,
          daysSinceContact: c.daysSinceContact,
          suggestedAction: c.suggestedAction,
        })),
      },
    };
  }

  /**
   * Find contacts with no recent interaction
   */
  private async findContactsNeedingAttention(
    userId: string,
    inactiveDays: number,
    limit: number
  ): Promise<
    Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      company: string | null;
      importanceScore: number | null;
      lastInteraction: {
        createdAt: Date;
        type: string;
      } | null;
    }>
  > {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

    // Get contacts with their last interaction
    const contacts = await prisma.contact.findMany({
      where: {
        userId,
        importanceScore: { gte: 50 }, // Focus on important contacts
      },
      include: {
        interactions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            createdAt: true,
            type: true,
          },
        },
      },
      orderBy: { importanceScore: 'desc' },
    });

    // Filter to those with no recent interaction
    const needsAttention = contacts.filter((contact) => {
      if (contact.interactions.length === 0) return true;
      return contact.interactions[0].createdAt < cutoffDate;
    });

    // Map to expected format
    return needsAttention.slice(0, limit).map((contact) => ({
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      company: contact.company,
      importanceScore: contact.importanceScore,
      lastInteraction: contact.interactions[0] || null,
    }));
  }

  /**
   * Generate personalized nurture suggestions
   */
  private async generateNurtureSuggestions(
    contacts: Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      company: string | null;
      importanceScore: number | null;
      lastInteraction: {
        createdAt: Date;
        type: string;
      } | null;
    }>
  ): Promise<NurtureContact[]> {
    const now = new Date();

    return contacts.map((contact) => {
      const name =
        `${contact.firstName || ''} ${contact.lastName || ''}`.trim() ||
        contact.email ||
        'Unknown';

      const lastInteractionDate = contact.lastInteraction?.createdAt;
      const daysSinceContact = lastInteractionDate
        ? Math.floor(
            (now.getTime() - lastInteractionDate.getTime()) / (1000 * 60 * 60 * 24)
          )
        : 999;

      const { suggestedAction, reason } = this.getSuggestion(
        contact,
        daysSinceContact
      );

      return {
        id: contact.id,
        name,
        email: contact.email,
        company: contact.company,
        importanceScore: contact.importanceScore,
        daysSinceContact,
        lastInteractionType: contact.lastInteraction?.type || null,
        suggestedAction,
        reason,
      };
    });
  }

  /**
   * Get personalized suggestion based on contact and history
   */
  private getSuggestion(
    contact: {
      importanceScore: number | null;
      company: string | null;
      lastInteraction: {
        type: string;
      } | null;
    },
    daysSinceContact: number
  ): { suggestedAction: string; reason: string } {
    const isVeryImportant = (contact.importanceScore || 0) >= 80;
    const isLongTime = daysSinceContact > 60;

    if (isVeryImportant && isLongTime) {
      return {
        suggestedAction: 'Schedule a catch-up call or meeting',
        reason: `High-value contact, ${daysSinceContact} days since last contact`,
      };
    }

    if (contact.lastInteraction?.type === 'EMAIL') {
      return {
        suggestedAction: 'Send a quick check-in email',
        reason: `Last interaction was email, ${daysSinceContact} days ago`,
      };
    }

    if (contact.company) {
      return {
        suggestedAction: `Share relevant industry news or insight`,
        reason: `Consider sharing something relevant to ${contact.company}`,
      };
    }

    return {
      suggestedAction: 'Send a brief hello or share an article',
      reason: `${daysSinceContact} days since last contact`,
    };
  }

  /**
   * Send relationship nurture digest
   */
  private async sendNurtureDigest(
    userId: string,
    contacts: NurtureContact[]
  ): Promise<void> {
    const title = `${contacts.length} relationship${contacts.length > 1 ? 's' : ''} need${contacts.length === 1 ? 's' : ''} attention`;

    const lines: string[] = [];
    lines.push('Contacts you haven\'t connected with recently:');
    lines.push('');

    for (const contact of contacts) {
      const companyInfo = contact.company ? ` (${contact.company})` : '';
      lines.push(`👤 ${contact.name}${companyInfo}`);
      lines.push(`   ${contact.daysSinceContact} days since last contact`);
      lines.push(`   💡 ${contact.suggestedAction}`);
      lines.push('');
    }

    await notificationService.send({
      userId,
      type: 'RELATIONSHIP_NURTURE',
      title,
      body: lines.join('\n'),
      data: {
        contactCount: contacts.length,
        contacts: contacts.map((c) => ({
          id: c.id,
          name: c.name,
          company: c.company,
          daysSinceContact: c.daysSinceContact,
          suggestedAction: c.suggestedAction,
        })),
      },
      priority: 'LOW',
    });
  }

  protected async updateMetrics(
    context: JobExecutionContext,
    result: RelationshipNurtureResult
  ): Promise<void> {
    // Relationship nurture doesn't directly update success metrics
  }
}

export const relationshipNurtureWorker = new RelationshipNurtureWorker();
