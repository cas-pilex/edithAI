/**
 * CRMService
 * Business logic for contact and relationship management
 */

import { prisma } from '../database/client.js';

// InteractionType: EMAIL_SENT, EMAIL_RECEIVED, MEETING, CALL, MESSAGE, NOTE

export interface ContactFilters {
  search?: string;
  company?: string;
  interests?: string[];
  minImportance?: number;
  relationshipType?: string;
}

export interface CreateContactInput {
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  notes?: string;
  interests?: string[];
  importanceScore?: number;
  relationshipType?: string;
}

export interface InteractionInput {
  contactId: string;
  type: 'EMAIL_SENT' | 'EMAIL_RECEIVED' | 'MEETING' | 'CALL' | 'MESSAGE' | 'NOTE';
  summary?: string;
  sentiment?: string;
  date?: Date;
}

class CRMServiceImpl {
  /**
   * Get contacts with filters
   */
  async getContacts(
    userId: string,
    filters: ContactFilters = {},
    pagination: { limit?: number; offset?: number } = {}
  ): Promise<{ contacts: unknown[]; total: number }> {
    const { limit = 50, offset = 0 } = pagination;

    const where: Record<string, unknown> = { userId };

    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { company: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.company) where.company = { contains: filters.company, mode: 'insensitive' };
    if (filters.interests && filters.interests.length > 0) where.interests = { hasSome: filters.interests };
    if (filters.minImportance) where.importanceScore = { gte: filters.minImportance };
    if (filters.relationshipType) where.relationshipType = filters.relationshipType;

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: [{ importanceScore: 'desc' }, { lastName: 'asc' }],
        take: limit,
        skip: offset,
      }),
      prisma.contact.count({ where }),
    ]);

    return { contacts, total };
  }

  /**
   * Get contact by ID
   */
  async getContactById(id: string, userId: string) {
    return prisma.contact.findFirst({
      where: { id, userId },
      include: {
        interactions: {
          orderBy: { date: 'desc' },
          take: 10,
        },
        reminders: {
          where: { isCompleted: false },
        },
      },
    });
  }

  /**
   * Get contact by email
   */
  async getContactByEmail(email: string, userId: string) {
    return prisma.contact.findFirst({
      where: { email, userId },
      include: {
        interactions: {
          orderBy: { date: 'desc' },
          take: 10,
        },
        reminders: {
          where: { isCompleted: false },
        },
      },
    });
  }

  /**
   * Create contact
   */
  async createContact(userId: string, data: CreateContactInput) {
    return prisma.contact.create({
      data: {
        userId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        company: data.company,
        jobTitle: data.jobTitle,
        linkedinUrl: data.linkedinUrl,
        notes: data.notes,
        interests: data.interests || [],
        importanceScore: data.importanceScore || 5,
        relationshipType: (data.relationshipType as 'LEAD' | 'CLIENT' | 'PARTNER' | 'INVESTOR' | 'MENTOR' | 'FRIEND' | 'FAMILY' | 'OTHER') || 'OTHER',
      },
    });
  }

  /**
   * Update contact
   */
  async updateContact(id: string, userId: string, data: Partial<CreateContactInput>) {
    // Build update data explicitly to avoid type issues
    const updateData: Record<string, unknown> = {};
    if (data.email !== undefined) updateData.email = data.email;
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.company !== undefined) updateData.company = data.company;
    if (data.jobTitle !== undefined) updateData.jobTitle = data.jobTitle;
    if (data.linkedinUrl !== undefined) updateData.linkedinUrl = data.linkedinUrl;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.interests !== undefined) updateData.interests = data.interests;
    if (data.importanceScore !== undefined) updateData.importanceScore = data.importanceScore;
    if (data.relationshipType !== undefined) {
      updateData.relationshipType = data.relationshipType as 'LEAD' | 'CLIENT' | 'PARTNER' | 'INVESTOR' | 'MENTOR' | 'FRIEND' | 'FAMILY' | 'OTHER';
    }

    return prisma.contact.updateMany({
      where: { id, userId },
      data: updateData,
    });
  }

  /**
   * Delete contact
   */
  async deleteContact(id: string, userId: string) {
    // Verify ownership
    const contact = await prisma.contact.findFirst({
      where: { id, userId },
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    await prisma.contact.delete({ where: { id } });
    return true;
  }

  /**
   * Log interaction
   */
  async logInteraction(userId: string, data: InteractionInput) {
    // Verify contact ownership
    const contact = await prisma.contact.findFirst({
      where: { id: data.contactId, userId },
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    // Create interaction
    const interaction = await prisma.interaction.create({
      data: {
        contactId: data.contactId,
        userId,
        type: data.type,
        summary: data.summary,
        sentiment: data.sentiment,
        date: data.date || new Date(),
      },
    });

    // Update last contact date
    await prisma.contact.update({
      where: { id: data.contactId },
      data: {
        lastContactDate: data.date || new Date(),
      },
    });

    return interaction;
  }

  /**
   * Set follow-up reminder
   */
  async setFollowUp(
    userId: string,
    data: {
      contactId: string;
      type: string;
      dueDate: Date;
      message?: string;
    }
  ) {
    // Verify contact ownership
    const contact = await prisma.contact.findFirst({
      where: { id: data.contactId, userId },
    });

    if (!contact) {
      throw new Error('Contact not found');
    }

    return prisma.contactReminder.create({
      data: {
        contactId: data.contactId,
        type: data.type,
        dueDate: data.dueDate,
        message: data.message || 'Follow up',
      },
    });
  }

  /**
   * Get overdue reminders
   */
  async getOverdueFollowUps(userId: string) {
    const contacts = await prisma.contact.findMany({
      where: { userId },
      include: {
        reminders: {
          where: {
            isCompleted: false,
            dueDate: { lt: new Date() },
          },
        },
      },
    });

    return contacts
      .filter(c => c.reminders.length > 0)
      .map(c => ({
        contact: {
          id: c.id,
          name: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
          email: c.email,
          importanceScore: c.importanceScore,
        },
        reminders: c.reminders,
      }))
      .sort((a, b) => (b.contact.importanceScore || 0) - (a.contact.importanceScore || 0));
  }

  /**
   * Complete reminder
   */
  async completeFollowUp(reminderId: string, userId: string) {
    // Verify ownership through contact
    const reminder = await prisma.contactReminder.findFirst({
      where: { id: reminderId },
      include: { contact: true },
    });

    if (!reminder || reminder.contact.userId !== userId) {
      throw new Error('Reminder not found');
    }

    return prisma.contactReminder.update({
      where: { id: reminderId },
      data: {
        isCompleted: true,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Get contacts needing attention
   */
  async getContactsNeedingAttention(
    userId: string,
    daysWithoutContact: number = 30
  ) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysWithoutContact);

    return prisma.contact.findMany({
      where: {
        userId,
        importanceScore: { gte: 5 },
        OR: [
          { lastContactDate: { lt: cutoffDate } },
          { lastContactDate: null },
        ],
      },
      orderBy: [{ importanceScore: 'desc' }, { lastContactDate: 'asc' }],
      take: 20,
    });
  }

  /**
   * Get network insights
   */
  async getNetworkInsights(userId: string) {
    const contacts = await prisma.contact.findMany({
      where: { userId },
      include: {
        interactions: {
          where: {
            date: {
              gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            },
          },
        },
        reminders: {
          where: { isCompleted: false },
        },
      },
    });

    const total = contacts.length;
    const byImportance = contacts.reduce((acc, c) => {
      const bucket = c.importanceScore >= 8 ? 'vip' : c.importanceScore >= 5 ? 'important' : 'regular';
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgImportance = contacts.reduce((sum, c) => sum + (c.importanceScore || 5), 0) / (total || 1);

    const recentInteractions = contacts.reduce((sum, c) => sum + c.interactions.length, 0);

    const pendingReminders = contacts.reduce((sum, c) => sum + c.reminders.length, 0);

    const staleRelationships = contacts.filter(c => {
      if (!c.lastContactDate) return true;
      const daysSinceContact = (Date.now() - c.lastContactDate.getTime()) / (24 * 60 * 60 * 1000);
      return daysSinceContact > 60 && (c.importanceScore || 0) >= 5;
    }).length;

    return {
      totalContacts: total,
      byImportance,
      averageImportance: Math.round(avgImportance),
      recentInteractions,
      pendingReminders,
      staleRelationships,
      healthScore: this.calculateNetworkHealth(contacts),
    };
  }

  /**
   * Calculate network health score
   */
  private calculateNetworkHealth(contacts: Array<{
    importanceScore: number;
    interactions: unknown[];
    reminders: unknown[];
  }>): number {
    if (contacts.length === 0) return 0;

    let score = 0;
    const maxScore = contacts.length * 100;

    for (const contact of contacts) {
      // Base score from importance
      score += (contact.importanceScore || 5) * 10;

      // Bonus for recent interactions
      if (contact.interactions.length > 0) {
        score += 10;
      }

      // Penalty for pending reminders
      score -= contact.reminders.length * 5;
    }

    return Math.min(100, Math.max(0, Math.round((score / maxScore) * 100)));
  }
}

export const crmService = new CRMServiceImpl();
export default crmService;
