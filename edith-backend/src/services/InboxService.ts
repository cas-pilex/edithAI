/**
 * InboxService
 * Business logic for email management
 */

import { prisma } from '../database/client.js';

// EmailCategory: URGENT, ACTION_REQUIRED, FOLLOW_UP, FYI, NEWSLETTER, SPAM

export interface EmailFilters {
  category?: string;
  isRead?: boolean;
  isStarred?: boolean;
  isArchived?: boolean;
  fromAddress?: string;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  label?: string; // 'sent' for sent mail, default shows INBOX only
}

export interface CreateEmailInput {
  externalId: string;
  threadId?: string;
  subject: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses?: string[];
  bodyText?: string;
  bodyHtml?: string;
  snippet?: string;
  receivedAt: Date;
  attachments?: unknown[];
  labels?: string[];
}

class InboxServiceImpl {
  /**
   * Get emails with filters
   */
  async getEmails(
    userId: string,
    filters: EmailFilters = {},
    pagination: { limit?: number; offset?: number } = {}
  ): Promise<{ emails: unknown[]; total: number }> {
    const { limit = 50, offset = 0 } = pagination;

    const where: Record<string, unknown> = { userId };

    // Label-based filtering: 'sent' shows sent mail, default shows primary inbox only
    if (filters.label === 'sent') {
      where.labels = { has: 'SENT' };
    } else {
      // Default: show INBOX emails, exclude pure SENT (no INBOX label)
      where.labels = { has: 'INBOX' };
    }

    if (filters.category) where.category = filters.category;
    if (filters.isRead !== undefined) where.isRead = filters.isRead;
    if (filters.isStarred !== undefined) where.isStarred = filters.isStarred;
    if (filters.isArchived !== undefined) where.isArchived = filters.isArchived;
    if (filters.fromAddress) where.fromAddress = filters.fromAddress;
    if (filters.search) {
      where.OR = [
        { subject: { contains: filters.search, mode: 'insensitive' } },
        { bodyText: { contains: filters.search, mode: 'insensitive' } },
        { fromAddress: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.startDate || filters.endDate) {
      where.receivedAt = {};
      if (filters.startDate) (where.receivedAt as Record<string, Date>).gte = filters.startDate;
      if (filters.endDate) (where.receivedAt as Record<string, Date>).lte = filters.endDate;
    }

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.email.count({ where }),
    ]);

    return { emails, total };
  }

  /**
   * Get email by ID
   */
  async getEmailById(id: string, userId: string) {
    return prisma.email.findFirst({
      where: { id, userId },
    });
  }

  /**
   * Create or sync email
   */
  async createEmail(userId: string, data: CreateEmailInput) {
    return prisma.email.upsert({
      where: {
        userId_externalId: {
          userId,
          externalId: data.externalId,
        },
      },
      create: {
        userId,
        externalId: data.externalId,
        threadId: data.threadId,
        subject: data.subject,
        fromAddress: data.fromAddress,
        fromName: data.fromName,
        toAddresses: data.toAddresses,
        ccAddresses: data.ccAddresses || [],
        bodyText: data.bodyText,
        bodyHtml: data.bodyHtml,
        snippet: data.snippet,
        receivedAt: data.receivedAt,
        attachments: data.attachments ? (data.attachments as object) : [],
        labels: data.labels || [],
      },
      update: {
        threadId: data.threadId,
        subject: data.subject,
        fromAddress: data.fromAddress,
        fromName: data.fromName,
        toAddresses: data.toAddresses,
        ccAddresses: data.ccAddresses || [],
        bodyText: data.bodyText,
        bodyHtml: data.bodyHtml,
        snippet: data.snippet,
        receivedAt: data.receivedAt,
        attachments: data.attachments ? (data.attachments as object) : [],
        labels: data.labels || [],
      },
    });
  }

  /**
   * Update email
   */
  async updateEmail(
    id: string,
    userId: string,
    data: {
      isRead?: boolean;
      isArchived?: boolean;
      category?: 'URGENT' | 'ACTION_REQUIRED' | 'FOLLOW_UP' | 'FYI' | 'NEWSLETTER' | 'SPAM';
      priorityScore?: number;
      labels?: string[];
    }
  ) {
    const updateData: Record<string, unknown> = {};
    if (data.isRead !== undefined) updateData.isRead = data.isRead;
    if (data.isArchived !== undefined) updateData.isArchived = data.isArchived;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.priorityScore !== undefined) updateData.priorityScore = data.priorityScore;
    if (data.labels !== undefined) updateData.labels = data.labels;

    return prisma.email.updateMany({
      where: { id, userId },
      data: updateData,
    });
  }

  /**
   * Archive emails
   */
  async archiveEmails(ids: string[], userId: string) {
    return prisma.email.updateMany({
      where: {
        id: { in: ids },
        userId,
      },
      data: { isArchived: true },
    });
  }

  /**
   * Mark emails as read
   */
  async markAsRead(ids: string[], userId: string) {
    return prisma.email.updateMany({
      where: {
        id: { in: ids },
        userId,
      },
      data: { isRead: true },
    });
  }

  /**
   * Get email threads
   */
  async getThreads(userId: string, limit: number = 50) {
    const threads = await prisma.email.groupBy({
      by: ['threadId'],
      where: { userId, threadId: { not: null } },
      _count: true,
      _max: { receivedAt: true },
      orderBy: { _max: { receivedAt: 'desc' } },
      take: limit,
    });

    return threads;
  }

  /**
   * Get emails in a thread
   */
  async getThreadEmails(threadId: string, userId: string) {
    return prisma.email.findMany({
      where: { threadId, userId },
      orderBy: { receivedAt: 'asc' },
    });
  }

  /**
   * Get inbox statistics
   */
  async getStats(userId: string) {
    const [total, unread, byCategory] = await Promise.all([
      prisma.email.count({ where: { userId, isArchived: false } }),
      prisma.email.count({ where: { userId, isRead: false, isArchived: false } }),
      prisma.email.groupBy({
        by: ['category'],
        where: { userId, isArchived: false },
        _count: true,
      }),
    ]);

    return {
      total,
      unread,
      byCategory: byCategory.reduce((acc, item) => {
        acc[item.category || 'uncategorized'] = item._count;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  /**
   * Create email rule
   */
  async createRule(
    userId: string,
    rule: {
      name: string;
      conditions: Record<string, unknown>;
      actions: Record<string, unknown>;
      isActive?: boolean;
    }
  ) {
    return prisma.emailRule.create({
      data: {
        userId,
        name: rule.name,
        conditions: rule.conditions as object,
        actions: rule.actions as object,
        isActive: rule.isActive ?? true,
      },
    });
  }

  /**
   * Get email rules
   */
  async getRules(userId: string) {
    return prisma.emailRule.findMany({
      where: { userId },
      orderBy: { priority: 'asc' },
    });
  }

  /**
   * Delete email rule
   */
  async deleteRule(ruleId: string, userId: string) {
    return prisma.emailRule.deleteMany({
      where: { id: ruleId, userId },
    });
  }
}

export const inboxService = new InboxServiceImpl();
export default inboxService;
