/**
 * MeetingPrepService
 * Business logic for meeting preparation and briefs
 */

import { prisma } from '../database/client.js';

// MeetingPrep is linked to CalendarEvent via eventId (not userId directly)
// CalendarEvent.attendees is a Json field, not a relation

interface AttendeeInfo {
  email: string;
  name?: string;
  status?: string;
}

export interface MeetingBriefData {
  event: {
    id: string;
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    location?: string;
    isOnline: boolean;
    meetingUrl?: string;
  };
  attendees: Array<{
    email: string;
    name?: string;
    status?: string;
    profile?: {
      company?: string;
      jobTitle?: string;
      importanceScore?: number;
      recentInteractions?: unknown[];
    };
  }>;
  emailHistory?: Array<{
    id: string;
    subject: string;
    from: string;
    date: Date;
    snippet: string;
  }>;
  talkingPoints?: Array<{
    category: string;
    point: string;
    priority: string;
  }>;
  relatedTasks?: Array<{
    id: string;
    title: string;
    status: string;
    dueDate?: Date;
  }>;
}

class MeetingPrepServiceImpl {
  /**
   * Get meeting prep by event ID
   */
  async getMeetingPrep(eventId: string, userId: string) {
    // First verify the event belongs to the user
    const event = await prisma.calendarEvent.findFirst({
      where: { id: eventId, userId },
    });

    if (!event) {
      return null;
    }

    return prisma.meetingPrep.findUnique({
      where: { eventId },
    });
  }

  /**
   * Create or update meeting prep
   */
  async saveMeetingPrep(
    userId: string,
    eventId: string,
    data: {
      researchNotes?: string;
      attendeeProfiles?: unknown;
      suggestedTalkingPoints?: string[];
      relevantEmails?: string[];
      userNotes?: string;
    }
  ) {
    // Verify event ownership
    const event = await prisma.calendarEvent.findFirst({
      where: { id: eventId, userId },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    const existing = await prisma.meetingPrep.findUnique({
      where: { eventId },
    });

    if (existing) {
      return prisma.meetingPrep.update({
        where: { id: existing.id },
        data: {
          researchNotes: data.researchNotes,
          attendeeProfiles: data.attendeeProfiles as object || existing.attendeeProfiles,
          suggestedTalkingPoints: data.suggestedTalkingPoints || existing.suggestedTalkingPoints,
          relevantEmails: data.relevantEmails || existing.relevantEmails,
          userNotes: data.userNotes,
          generatedAt: new Date(),
        },
      });
    }

    return prisma.meetingPrep.create({
      data: {
        eventId,
        researchNotes: data.researchNotes,
        attendeeProfiles: data.attendeeProfiles as object || [],
        suggestedTalkingPoints: data.suggestedTalkingPoints || [],
        relevantEmails: data.relevantEmails || [],
        userNotes: data.userNotes,
      },
    });
  }

  /**
   * Generate meeting brief
   */
  async generateBrief(eventId: string, userId: string): Promise<MeetingBriefData> {
    // Get the event
    const event = await prisma.calendarEvent.findFirst({
      where: { id: eventId, userId },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    // Parse attendees from Json field
    const attendeesJson = (event.attendees as AttendeeInfo[] | null) || [];

    // Build the brief
    const brief: MeetingBriefData = {
      event: {
        id: event.id,
        title: event.title,
        description: event.description || undefined,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location || undefined,
        isOnline: event.isOnline,
        meetingUrl: event.meetingUrl || undefined,
      },
      attendees: [],
      emailHistory: [],
      talkingPoints: [],
      relatedTasks: [],
    };

    // Get attendee profiles
    const attendeeEmails = Array.isArray(attendeesJson)
      ? attendeesJson.map((a: AttendeeInfo) => a.email).filter(Boolean)
      : [];

    if (attendeeEmails.length > 0) {
      const contacts = await prisma.contact.findMany({
        where: {
          userId,
          email: { in: attendeeEmails },
        },
        include: {
          interactions: {
            orderBy: { date: 'desc' },
            take: 3,
          },
        },
      });

      brief.attendees = attendeesJson.map((attendee: AttendeeInfo) => {
        const contact = contacts.find(c => c.email === attendee.email);
        return {
          email: attendee.email,
          name: attendee.name || undefined,
          status: attendee.status || 'unknown',
          profile: contact ? {
            company: contact.company || undefined,
            jobTitle: contact.jobTitle || undefined,
            importanceScore: contact.importanceScore,
            recentInteractions: contact.interactions.map(i => ({
              type: i.type,
              summary: i.summary,
              date: i.date,
            })),
          } : undefined,
        };
      });

      // Get email history with attendees
      const emails = await prisma.email.findMany({
        where: {
          userId,
          OR: [
            { fromAddress: { in: attendeeEmails } },
            { toAddresses: { hasSome: attendeeEmails } },
          ],
        },
        orderBy: { receivedAt: 'desc' },
        take: 10,
      });

      brief.emailHistory = emails.map(email => ({
        id: email.id,
        subject: email.subject,
        from: email.fromAddress,
        date: email.receivedAt,
        snippet: email.snippet || '',
      }));
    }

    // Get related tasks (matching event title in task title)
    const relatedTasks = await prisma.task.findMany({
      where: {
        userId,
        status: { notIn: ['DONE'] },
        title: { contains: event.title || '', mode: 'insensitive' },
      },
      take: 5,
    });

    brief.relatedTasks = relatedTasks.map(task => ({
      id: task.id,
      title: task.title,
      status: task.status,
      dueDate: task.dueDate || undefined,
    }));

    // Generate talking points
    brief.talkingPoints = this.generateTalkingPoints(event, brief);

    // Save the brief
    await this.saveMeetingPrep(userId, eventId, {
      attendeeProfiles: brief.attendees,
      suggestedTalkingPoints: brief.talkingPoints.map(p => `[${p.category}] ${p.point}`),
      relevantEmails: brief.emailHistory?.map(e => e.id) || [],
    });

    return brief;
  }

  /**
   * Generate talking points for a meeting
   */
  private generateTalkingPoints(
    event: { title: string; description?: string | null },
    brief: MeetingBriefData
  ): Array<{ category: string; point: string; priority: string }> {
    const points: Array<{ category: string; point: string; priority: string }> = [];

    // Add point from event description
    if (event.description) {
      points.push({
        category: 'Agenda',
        point: `Review meeting objective: ${event.description}`,
        priority: 'high',
      });
    }

    // Add points from related tasks
    for (const task of brief.relatedTasks || []) {
      points.push({
        category: 'Tasks',
        point: `Discuss: ${task.title} (${task.status})`,
        priority: task.status === 'BLOCKED' ? 'high' : 'medium',
      });
    }

    // Add points from recent emails
    if (brief.emailHistory && brief.emailHistory.length > 0) {
      const recentSubjects = brief.emailHistory.slice(0, 3).map(e => e.subject);
      points.push({
        category: 'Recent Topics',
        point: `Review recent discussions: ${recentSubjects.join(', ')}`,
        priority: 'medium',
      });
    }

    return points;
  }

  /**
   * Save meeting notes
   */
  async saveNotes(
    userId: string,
    eventId: string,
    notes: string,
    actionItems?: Array<{ task: string; dueDate?: Date }>,
    _keyDecisions?: string[]
  ) {
    const prep = await this.saveMeetingPrep(userId, eventId, { userNotes: notes });

    // Create tasks from action items
    if (actionItems && actionItems.length > 0) {
      for (const item of actionItems) {
        await prisma.task.create({
          data: {
            userId,
            title: item.task,
            description: `Action item from meeting`,
            status: 'TODO',
            priority: 'MEDIUM',
            dueDate: item.dueDate,
            source: 'MEETING',
            sourceId: eventId,
          },
        });
      }
    }

    return prep;
  }

  /**
   * Get upcoming meetings needing prep
   */
  async getMeetingsNeedingPrep(userId: string, hoursAhead: number = 24) {
    const now = new Date();
    const cutoff = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    // Get upcoming events
    const events = await prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: now, lte: cutoff },
      },
      orderBy: { startTime: 'asc' },
    });

    // Check which have prep
    const eventIds = events.map(e => e.id);
    const preps = await prisma.meetingPrep.findMany({
      where: {
        eventId: { in: eventIds },
      },
    });

    const prepMap = new Map(preps.map(p => [p.eventId, p]));

    return events.map(event => {
      const attendees = (event.attendees as AttendeeInfo[] | null) || [];
      return {
        event,
        hasPrep: prepMap.has(event.id),
        prep: prepMap.get(event.id),
        needsPrep: !prepMap.has(event.id) && Array.isArray(attendees) && attendees.length > 0,
      };
    });
  }

  /**
   * Get meeting prep history
   */
  async getPrepHistory(userId: string, limit: number = 20) {
    // Get events for this user, then their preps
    const events = await prisma.calendarEvent.findMany({
      where: { userId },
      select: { id: true },
    });

    const eventIds = events.map(e => e.id);

    return prisma.meetingPrep.findMany({
      where: {
        eventId: { in: eventIds },
      },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Delete meeting prep
   */
  async deleteMeetingPrep(eventId: string, userId: string) {
    // Verify ownership through event
    const event = await prisma.calendarEvent.findFirst({
      where: { id: eventId, userId },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    const prep = await prisma.meetingPrep.findUnique({
      where: { eventId },
    });

    if (!prep) {
      throw new Error('Meeting prep not found');
    }

    await prisma.meetingPrep.delete({ where: { id: prep.id } });
    return true;
  }
}

export const meetingPrepService = new MeetingPrepServiceImpl();
export default meetingPrepService;
