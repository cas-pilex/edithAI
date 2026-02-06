/**
 * Meeting Prep Agent Tools
 * Tools for meeting preparation, attendee research, and brief generation
 */

import { createTool, toolRegistry } from './index.js';
import { prisma } from '../../database/client.js';
import type { EnhancedAgentContext, ToolHandlerResult } from '../../types/agent.types.js';

// ============================================================================
// Helper Types
// ============================================================================

interface AttendeeInfo {
  email: string;
  name?: string;
  status?: string;
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Generate a comprehensive meeting brief
 */
async function handleGenerateMeetingBrief(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { event_id } = input as { event_id: string };

  try {
    // Get calendar event
    const event = await prisma.calendarEvent.findFirst({
      where: {
        id: event_id,
        userId: context.userId,
      },
    });

    if (!event) {
      return {
        success: false,
        error: 'Event not found',
      };
    }

    // Parse attendees from JSON field
    const attendees = (event.attendees as AttendeeInfo[] | null) || [];

    const brief = {
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        isOnline: event.isOnline,
        meetingUrl: event.meetingUrl,
      },
      attendees: Array.isArray(attendees) ? attendees : [],
      generatedAt: new Date().toISOString(),
    };

    // Get or create meeting prep
    let meetingPrep = await prisma.meetingPrep.findFirst({
      where: { eventId: event_id },
    });

    if (meetingPrep) {
      meetingPrep = await prisma.meetingPrep.update({
        where: { id: meetingPrep.id },
        data: {
          attendeeProfiles: brief.attendees as object,
          generatedAt: new Date(),
        },
      });
    } else {
      meetingPrep = await prisma.meetingPrep.create({
        data: {
          eventId: event_id,
          attendeeProfiles: brief.attendees as object,
        },
      });
    }

    return {
      success: true,
      data: { ...brief, prepId: meetingPrep.id },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to generate brief: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Research attendees for a meeting
 */
async function handleResearchAttendees(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { emails } = input as { emails: string[] };

  try {
    const contacts = await prisma.contact.findMany({
      where: {
        userId: context.userId,
        email: { in: emails },
      },
    });

    const profiles = emails.map(email => {
      const contact = contacts.find(c => c.email === email);

      if (contact) {
        return {
          email,
          known: true,
          name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          company: contact.company,
          notes: contact.notes,
          relationshipType: contact.relationshipType,
          lastContactDate: contact.lastContactDate,
        };
      }

      return {
        email,
        known: false,
        note: 'Contact not in CRM - consider adding after meeting',
      };
    });

    return {
      success: true,
      data: {
        attendees: profiles,
        knownCount: profiles.filter(p => p.known).length,
        unknownCount: profiles.filter(p => !p.known).length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to research attendees: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Get email history with specific attendees
 */
async function handleGetEmailHistoryWithAttendees(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { emails, limit = 20, days_back = 90 } = input as {
    emails: string[];
    limit?: number;
    days_back?: number;
  };

  try {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days_back);

    const emailHistory = await prisma.email.findMany({
      where: {
        userId: context.userId,
        receivedAt: { gte: sinceDate },
        OR: [
          { fromAddress: { in: emails } },
          { toAddresses: { hasSome: emails } },
        ],
      },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });

    return {
      success: true,
      data: {
        totalEmails: emailHistory.length,
        emails: emailHistory.map(email => ({
          id: email.id,
          subject: email.subject,
          from: email.fromAddress,
          to: email.toAddresses,
          date: email.receivedAt,
          snippet: email.snippet,
          category: email.category,
        })),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get email history: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Generate talking points for a meeting
 */
async function handleSuggestTalkingPoints(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { event_id, focus_areas = [] } = input as {
    event_id: string;
    focus_areas?: string[];
  };

  try {
    const event = await prisma.calendarEvent.findFirst({
      where: {
        id: event_id,
        userId: context.userId,
      },
    });

    if (!event) {
      return {
        success: false,
        error: 'Event not found',
      };
    }

    const talkingPoints: Array<{ category: string; point: string; priority: string }> = [];

    if (event.description) {
      talkingPoints.push({
        category: 'Agenda',
        point: `Review meeting objective: ${event.description}`,
        priority: 'high',
      });
    }

    for (const area of focus_areas) {
      talkingPoints.push({
        category: 'Focus Areas',
        point: area,
        priority: 'high',
      });
    }

    return {
      success: true,
      data: {
        eventId: event_id,
        eventTitle: event.title,
        talkingPoints,
        totalPoints: talkingPoints.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to generate talking points: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Save meeting notes
 */
async function handleSaveMeetingNotes(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { event_id, notes, action_items = [], key_decisions: _key_decisions = [] } = input as {
    event_id: string;
    notes: string;
    action_items?: Array<{ task: string; assignee?: string; due_date?: string }>;
    key_decisions?: string[];
  };

  try {
    let meetingPrep = await prisma.meetingPrep.findFirst({
      where: { eventId: event_id },
    });

    if (meetingPrep) {
      meetingPrep = await prisma.meetingPrep.update({
        where: { id: meetingPrep.id },
        data: {
          userNotes: notes,
          generatedAt: new Date(),
        },
      });
    } else {
      meetingPrep = await prisma.meetingPrep.create({
        data: {
          eventId: event_id,
          userNotes: notes,
        },
      });
    }

    // Create tasks from action items
    const createdTasks = [];
    for (const item of action_items) {
      const task = await prisma.task.create({
        data: {
          userId: context.userId,
          title: item.task,
          description: `Action item from meeting: ${event_id}`,
          status: 'TODO',
          priority: 'MEDIUM',
          dueDate: item.due_date ? new Date(item.due_date) : undefined,
          source: 'MEETING',
          sourceId: event_id,
        },
      });
      createdTasks.push(task);
    }

    return {
      success: true,
      data: {
        prepId: meetingPrep.id,
        notesSaved: true,
        tasksCreated: createdTasks.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to save notes: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Get existing meeting prep
 */
async function handleGetMeetingPrep(
  input: Record<string, unknown>,
  _context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { event_id } = input as { event_id: string };

  try {
    const meetingPrep = await prisma.meetingPrep.findFirst({
      where: { eventId: event_id },
    });

    if (!meetingPrep) {
      return {
        success: true,
        data: {
          found: false,
          message: 'No meeting prep found. Use generate_meeting_brief to create one.',
        },
      };
    }

    return {
      success: true,
      data: {
        found: true,
        prepId: meetingPrep.id,
        eventId: event_id,
        attendeeProfiles: meetingPrep.attendeeProfiles,
        suggestedTalkingPoints: meetingPrep.suggestedTalkingPoints,
        relevantEmails: meetingPrep.relevantEmails,
        researchNotes: meetingPrep.researchNotes,
        notes: meetingPrep.userNotes,
        generatedAt: meetingPrep.generatedAt,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get prep: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Schedule a prep reminder before meeting
 */
async function handleSchedulePrepReminder(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { event_id, minutes_before } = input as {
    event_id: string;
    minutes_before: number;
  };

  try {
    const event = await prisma.calendarEvent.findFirst({
      where: {
        id: event_id,
        userId: context.userId,
      },
    });

    if (!event) {
      return {
        success: false,
        error: 'Event not found',
      };
    }

    const reminderTime = new Date(event.startTime);
    reminderTime.setMinutes(reminderTime.getMinutes() - minutes_before);

    if (reminderTime <= new Date()) {
      return {
        success: false,
        error: 'Reminder time is in the past',
      };
    }

    const notification = await prisma.notification.create({
      data: {
        userId: context.userId,
        type: 'MEETING_PREP_REMINDER',
        title: `Prep reminder: ${event.title}`,
        body: `Your meeting starts in ${minutes_before} minutes.`,
        data: { eventId: event_id } as object,
        scheduledFor: reminderTime,
        status: 'PENDING',
      },
    });

    return {
      success: true,
      data: {
        reminderId: notification.id,
        eventId: event_id,
        reminderTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to schedule reminder: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================================================
// Tool Registration
// ============================================================================

export function registerMeetingPrepTools(): void {
  toolRegistry.register(
    createTool(
      'generate_meeting_brief',
      'Generate a comprehensive meeting brief',
      {
        event_id: { type: 'string', description: 'The calendar event ID' },
      },
      ['event_id'],
      'meeting_prep',
      handleGenerateMeetingBrief,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'research_attendees',
      'Research meeting attendees',
      {
        emails: { type: 'array', items: { type: 'string' }, description: 'Attendee emails' },
      },
      ['emails'],
      'meeting_prep',
      handleResearchAttendees,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'get_email_history_with_attendees',
      'Get email history with attendees',
      {
        emails: { type: 'array', items: { type: 'string' }, description: 'Attendee emails' },
        limit: { type: 'number', description: 'Max emails to return' },
        days_back: { type: 'number', description: 'Days to search back' },
      },
      ['emails'],
      'meeting_prep',
      handleGetEmailHistoryWithAttendees,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'suggest_talking_points',
      'Generate talking points for a meeting',
      {
        event_id: { type: 'string', description: 'The calendar event ID' },
        focus_areas: { type: 'array', items: { type: 'string' }, description: 'Focus topics' },
      },
      ['event_id'],
      'meeting_prep',
      handleSuggestTalkingPoints,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'save_meeting_notes',
      'Save meeting notes and action items',
      {
        event_id: { type: 'string', description: 'The calendar event ID' },
        notes: { type: 'string', description: 'Meeting notes' },
        action_items: { type: 'array', description: 'Action items' },
        key_decisions: { type: 'array', items: { type: 'string' }, description: 'Key decisions' },
      },
      ['event_id', 'notes'],
      'meeting_prep',
      handleSaveMeetingNotes,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'get_meeting_prep',
      'Get existing meeting prep materials',
      {
        event_id: { type: 'string', description: 'The calendar event ID' },
      },
      ['event_id'],
      'meeting_prep',
      handleGetMeetingPrep,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'schedule_prep_reminder',
      'Schedule a meeting prep reminder',
      {
        event_id: { type: 'string', description: 'The calendar event ID' },
        minutes_before: { type: 'number', description: 'Minutes before meeting' },
      },
      ['event_id', 'minutes_before'],
      'meeting_prep',
      handleSchedulePrepReminder,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );
}
