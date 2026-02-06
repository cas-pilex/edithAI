import { toolRegistry, createTool } from './index.js';
import type { EnhancedAgentContext, ToolHandlerResult } from '../../types/agent.types.js';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';

// ==================== TOOL HANDLERS ====================

async function handleGetContactProfile(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { contactId, email } = input as { contactId?: string; email?: string };

  try {
    let contact;
    if (contactId) {
      contact = await prisma.contact.findUnique({
        where: { id: contactId, userId: context.userId },
        include: {
          interactions: { orderBy: { date: 'desc' }, take: 10 },
          reminders: { where: { isCompleted: false } },
        },
      });
    } else if (email) {
      contact = await prisma.contact.findFirst({
        where: { email, userId: context.userId },
        include: {
          interactions: { orderBy: { date: 'desc' }, take: 10 },
          reminders: { where: { isCompleted: false } },
        },
      });
    }

    if (!contact) {
      return { success: false, error: 'Contact not found' };
    }

    return {
      success: true,
      data: {
        id: contact.id,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.email,
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
        jobTitle: contact.jobTitle,
        relationshipType: contact.relationshipType,
        importanceScore: contact.importanceScore,
        lastContactDate: contact.lastContactDate,
        nextFollowUpDate: contact.nextFollowUpDate,
        followUpReason: contact.followUpReason,
        notes: contact.notes,
        interests: contact.interests,
        birthday: contact.birthday,
        recentInteractions: contact.interactions.map((i) => ({
          type: i.type,
          date: i.date,
          summary: i.summary,
        })),
        pendingReminders: contact.reminders.length,
      },
    };
  } catch (error) {
    logger.error('Failed to get contact profile', { error });
    return {
      success: false,
      error: `Failed to get contact: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleUpdateContact(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { contactId, updates } = input as {
    contactId: string;
    updates: {
      company?: string;
      jobTitle?: string;
      phone?: string;
      notes?: string;
      interests?: string[];
      relationshipType?: string;
      importanceScore?: number;
    };
  };

  try {
    const updateData: Parameters<typeof prisma.contact.update>[0]['data'] = {
      company: updates.company,
      jobTitle: updates.jobTitle,
      phone: updates.phone,
      notes: updates.notes,
      interests: updates.interests,
      importanceScore: updates.importanceScore
        ? Math.min(10, Math.max(1, updates.importanceScore))
        : undefined,
    };

    // Cast relationshipType enum properly
    if (updates.relationshipType) {
      updateData.relationshipType = updates.relationshipType as 'LEAD' | 'CLIENT' | 'PARTNER' | 'INVESTOR' | 'MENTOR' | 'FRIEND' | 'FAMILY' | 'OTHER';
    }

    const contact = await prisma.contact.update({
      where: { id: contactId, userId: context.userId },
      data: updateData,
    });

    return {
      success: true,
      data: {
        contactId: contact.id,
        updated: Object.keys(updates),
      },
    };
  } catch (error) {
    logger.error('Failed to update contact', { error, contactId });
    return {
      success: false,
      error: `Failed to update contact: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleLogInteraction(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { contactId, type, summary, sentiment, linkedEmailId, linkedEventId } = input as {
    contactId: string;
    type: string;
    summary?: string;
    sentiment?: string;
    linkedEmailId?: string;
    linkedEventId?: string;
  };

  try {
    const interaction = await prisma.interaction.create({
      data: {
        contactId,
        userId: context.userId,
        type: type as 'EMAIL_SENT' | 'EMAIL_RECEIVED' | 'MEETING' | 'CALL' | 'MESSAGE' | 'NOTE',
        date: new Date(),
        summary,
        sentiment,
        linkedEmailId,
        linkedEventId,
        metadata: {},
      },
    });

    // Update last contact date
    await prisma.contact.update({
      where: { id: contactId },
      data: { lastContactDate: new Date() },
    });

    return {
      success: true,
      data: {
        interactionId: interaction.id,
        contactId,
        type,
        date: interaction.date,
      },
    };
  } catch (error) {
    logger.error('Failed to log interaction', { error, contactId });
    return {
      success: false,
      error: `Failed to log interaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleSetFollowUp(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { contactId, date, reason } = input as {
    contactId: string;
    date: string;
    reason?: string;
  };

  try {
    // Update contact's follow-up date
    await prisma.contact.update({
      where: { id: contactId, userId: context.userId },
      data: {
        nextFollowUpDate: new Date(date),
        followUpReason: reason,
      },
    });

    // Create a reminder
    const reminder = await prisma.contactReminder.create({
      data: {
        contactId,
        dueDate: new Date(date),
        message: reason || 'Follow up',
        type: 'FOLLOW_UP',
      },
    });

    return {
      success: true,
      data: {
        reminderId: reminder.id,
        contactId,
        scheduledFor: reminder.dueDate,
        reason,
      },
    };
  } catch (error) {
    logger.error('Failed to set follow-up', { error, contactId });
    return {
      success: false,
      error: `Failed to set follow-up: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleGetOverdueFollowups(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { limit = 20, minImportance = 1 } = input as {
    limit?: number;
    minImportance?: number;
  };

  try {
    const contacts = await prisma.contact.findMany({
      where: {
        userId: context.userId,
        nextFollowUpDate: { lt: new Date() },
        importanceScore: { gte: minImportance },
      },
      orderBy: [{ importanceScore: 'desc' }, { nextFollowUpDate: 'asc' }],
      take: limit,
      include: {
        interactions: { orderBy: { date: 'desc' }, take: 1 },
      },
    });

    return {
      success: true,
      data: {
        contacts: contacts.map((c) => ({
          id: c.id,
          name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email,
          email: c.email,
          company: c.company,
          importanceScore: c.importanceScore,
          dueDate: c.nextFollowUpDate,
          reason: c.followUpReason,
          daysPastDue: Math.floor(
            (Date.now() - (c.nextFollowUpDate?.getTime() || 0)) / (1000 * 60 * 60 * 24)
          ),
          lastInteraction: c.interactions[0]?.date,
        })),
        totalOverdue: contacts.length,
      },
    };
  } catch (error) {
    logger.error('Failed to get overdue follow-ups', { error });
    return {
      success: false,
      error: `Failed to get overdue: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleAnalyzeRelationship(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { contactId } = input as { contactId: string };

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId, userId: context.userId },
      include: {
        interactions: { orderBy: { date: 'desc' } },
      },
    });

    if (!contact) {
      return { success: false, error: 'Contact not found' };
    }

    // Calculate relationship health metrics
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const recentInteractions = contact.interactions.filter((i) => i.date > thirtyDaysAgo);
    const quarterInteractions = contact.interactions.filter((i) => i.date > ninetyDaysAgo);

    const lastContact = contact.lastContactDate;
    const daysSinceContact = lastContact
      ? Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    // Calculate health score (0-100)
    let healthScore = 50;
    if (recentInteractions.length >= 2) healthScore += 20;
    else if (recentInteractions.length === 1) healthScore += 10;
    if (daysSinceContact < 7) healthScore += 15;
    else if (daysSinceContact < 30) healthScore += 5;
    else if (daysSinceContact > 90) healthScore -= 20;
    healthScore = Math.max(0, Math.min(100, healthScore));

    const status = healthScore >= 70 ? 'HEALTHY' : healthScore >= 40 ? 'NEEDS_ATTENTION' : 'AT_RISK';

    return {
      success: true,
      data: {
        contactId,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        healthScore,
        status,
        metrics: {
          daysSinceLastContact: daysSinceContact,
          interactionsLast30Days: recentInteractions.length,
          interactionsLast90Days: quarterInteractions.length,
          totalInteractions: contact.interactions.length,
        },
        recommendations:
          status === 'AT_RISK'
            ? ['Schedule a catch-up call', 'Send a quick check-in message']
            : status === 'NEEDS_ATTENTION'
              ? ['Consider reaching out soon']
              : ['Relationship is healthy'],
      },
    };
  } catch (error) {
    logger.error('Failed to analyze relationship', { error, contactId });
    return {
      success: false,
      error: `Failed to analyze: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleFindContacts(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { query, company, relationshipType, minImportance, hasOverdueFollowUp } = input as {
    query?: string;
    company?: string;
    relationshipType?: string;
    minImportance?: number;
    hasOverdueFollowUp?: boolean;
  };

  try {
    const where: Record<string, unknown> = { userId: context.userId };

    if (query) {
      where.OR = [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { company: { contains: query, mode: 'insensitive' } },
      ];
    }
    if (company) where.company = { contains: company, mode: 'insensitive' };
    if (relationshipType) where.relationshipType = relationshipType;
    if (minImportance) where.importanceScore = { gte: minImportance };
    if (hasOverdueFollowUp) where.nextFollowUpDate = { lt: new Date() };

    const contacts = await prisma.contact.findMany({
      where: where as { userId: string; [key: string]: unknown },
      orderBy: { importanceScore: 'desc' },
      take: 50,
    });

    return {
      success: true,
      data: {
        contacts: contacts.map((c) => ({
          id: c.id,
          name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email,
          email: c.email,
          company: c.company,
          jobTitle: c.jobTitle,
          relationshipType: c.relationshipType,
          importanceScore: c.importanceScore,
        })),
        count: contacts.length,
      },
    };
  } catch (error) {
    logger.error('Failed to find contacts', { error });
    return {
      success: false,
      error: `Failed to search: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleGetNetworkInsights(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { focusArea } = input as {
    focusArea?: 'engagement_trends' | 'relationship_health' | 'key_contacts' | 'neglected_contacts';
  };

  try {
    const contacts = await prisma.contact.findMany({
      where: { userId: context.userId },
      include: {
        interactions: { orderBy: { date: 'desc' }, take: 5 },
      },
    });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Calculate insights
    const insights: Record<string, unknown> = {
      totalContacts: contacts.length,
      byRelationshipType: {} as Record<string, number>,
    };

    const relationshipCounts: Record<string, number> = {};
    let activeContacts = 0;
    let neglectedContacts = 0;
    const keyContacts: typeof contacts = [];

    for (const contact of contacts) {
      relationshipCounts[contact.relationshipType] =
        (relationshipCounts[contact.relationshipType] || 0) + 1;

      if (contact.importanceScore >= 8) {
        keyContacts.push(contact);
      }

      const lastInteraction = contact.interactions[0];
      if (lastInteraction && lastInteraction.date > thirtyDaysAgo) {
        activeContacts++;
      } else if (contact.importanceScore >= 5) {
        neglectedContacts++;
      }
    }

    insights.byRelationshipType = relationshipCounts;
    insights.activeContacts = activeContacts;
    insights.neglectedContacts = neglectedContacts;
    insights.keyContacts = keyContacts.length;

    if (focusArea === 'key_contacts') {
      insights.keyContactsList = keyContacts.map((c) => ({
        id: c.id,
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
        company: c.company,
        importance: c.importanceScore,
      }));
    }

    if (focusArea === 'neglected_contacts') {
      const neglected = contacts
        .filter((c) => {
          const lastInt = c.interactions[0];
          return (!lastInt || lastInt.date < thirtyDaysAgo) && c.importanceScore >= 5;
        })
        .slice(0, 10);

      insights.neglectedContactsList = neglected.map((c) => ({
        id: c.id,
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
        lastContact: c.lastContactDate,
        importance: c.importanceScore,
      }));
    }

    return {
      success: true,
      data: insights,
    };
  } catch (error) {
    logger.error('Failed to get network insights', { error });
    return {
      success: false,
      error: `Failed to get insights: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleSuggestOutreach(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { contactId } = input as { contactId: string };

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId, userId: context.userId },
      include: {
        interactions: { orderBy: { date: 'desc' }, take: 5 },
      },
    });

    if (!contact) {
      return { success: false, error: 'Contact not found' };
    }

    // Return contact info for the agent to generate outreach suggestions
    return {
      success: true,
      data: {
        contact: {
          name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          email: contact.email,
          company: contact.company,
          jobTitle: contact.jobTitle,
          interests: contact.interests,
          notes: contact.notes,
          relationshipType: contact.relationshipType,
        },
        recentInteractions: contact.interactions.map((i) => ({
          type: i.type,
          date: i.date,
          summary: i.summary,
        })),
        lastContactDays: contact.lastContactDate
          ? Math.floor((Date.now() - contact.lastContactDate.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      },
    };
  } catch (error) {
    logger.error('Failed to suggest outreach', { error, contactId });
    return {
      success: false,
      error: `Failed to suggest: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ==================== TOOL REGISTRATION ====================

export function registerCRMTools(): void {
  toolRegistry.register(
    createTool(
      'get_contact_profile',
      'Get detailed profile of a contact including interaction history',
      {
        contactId: { type: 'string', description: 'Contact ID' },
        email: { type: 'string', description: 'Contact email (alternative to ID)' },
      },
      [],
      'crm',
      handleGetContactProfile,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'update_contact',
      'Update contact information and notes',
      {
        contactId: { type: 'string', description: 'Contact ID' },
        updates: {
          type: 'object',
          description: 'Fields to update',
          properties: {
            company: { type: 'string' },
            jobTitle: { type: 'string' },
            phone: { type: 'string' },
            notes: { type: 'string' },
            interests: { type: 'array', items: { type: 'string' } },
            relationshipType: {
              type: 'string',
              enum: ['LEAD', 'CLIENT', 'PARTNER', 'INVESTOR', 'MENTOR', 'FRIEND', 'FAMILY', 'OTHER'],
            },
            importanceScore: { type: 'number', description: 'Score 1-10' },
          },
        },
      },
      ['contactId', 'updates'],
      'crm',
      handleUpdateContact,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'log_interaction',
      'Log an interaction with a contact',
      {
        contactId: { type: 'string', description: 'Contact ID' },
        type: {
          type: 'string',
          description: 'Type of interaction',
          enum: ['EMAIL_SENT', 'EMAIL_RECEIVED', 'MEETING', 'CALL', 'MESSAGE', 'NOTE'],
        },
        summary: { type: 'string', description: 'Brief summary of the interaction' },
        sentiment: { type: 'string', enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] },
        linkedEmailId: { type: 'string', description: 'Related email ID' },
        linkedEventId: { type: 'string', description: 'Related calendar event ID' },
      },
      ['contactId', 'type'],
      'crm',
      handleLogInteraction,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'set_follow_up',
      'Schedule a follow-up with a contact',
      {
        contactId: { type: 'string', description: 'Contact ID' },
        date: { type: 'string', description: 'Follow-up date (ISO format)' },
        reason: { type: 'string', description: 'Reason for follow-up' },
      },
      ['contactId', 'date'],
      'crm',
      handleSetFollowUp,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'get_overdue_followups',
      'Get list of contacts with overdue follow-ups',
      {
        limit: { type: 'number', description: 'Max results (default 20)' },
        minImportance: { type: 'number', description: 'Minimum importance score filter' },
      },
      [],
      'crm',
      handleGetOverdueFollowups,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'analyze_relationship',
      'Analyze relationship health with a contact',
      {
        contactId: { type: 'string', description: 'Contact ID' },
      },
      ['contactId'],
      'crm',
      handleAnalyzeRelationship,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'find_contacts',
      'Search contacts by various criteria',
      {
        query: { type: 'string', description: 'Search in name, email, company' },
        company: { type: 'string', description: 'Filter by company' },
        relationshipType: {
          type: 'string',
          enum: ['LEAD', 'CLIENT', 'PARTNER', 'INVESTOR', 'MENTOR', 'FRIEND', 'FAMILY', 'OTHER'],
        },
        minImportance: { type: 'number', description: 'Minimum importance score' },
        hasOverdueFollowUp: { type: 'boolean', description: 'Only show overdue follow-ups' },
      },
      [],
      'crm',
      handleFindContacts,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'get_network_insights',
      'Get insights about your professional network',
      {
        focusArea: {
          type: 'string',
          description: 'Area to focus on',
          enum: ['engagement_trends', 'relationship_health', 'key_contacts', 'neglected_contacts'],
        },
      },
      [],
      'crm',
      handleGetNetworkInsights,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'suggest_outreach',
      'Get suggestions for reaching out to a contact',
      {
        contactId: { type: 'string', description: 'Contact ID' },
      },
      ['contactId'],
      'crm',
      handleSuggestOutreach,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  logger.info('CRM tools registered', { count: 9 });
}
