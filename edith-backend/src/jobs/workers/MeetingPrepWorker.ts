/**
 * MeetingPrepWorker
 * Generates meeting preparation materials before scheduled meetings
 */

import { Job } from 'bullmq';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';
import { notificationService } from '../../services/NotificationService.js';
import { meetingPrepService } from '../../services/MeetingPrepService.js';
import { BaseWorker } from './BaseWorker.js';
import type {
  MeetingPrepJobData,
  MeetingPrepResult,
  JobExecutionContext,
} from '../types.js';

export class MeetingPrepWorker extends BaseWorker<MeetingPrepJobData> {
  protected queueName = 'calendar';
  protected jobType = 'MEETING_PREP' as const;

  protected async execute(
    job: Job<MeetingPrepJobData>,
    context: JobExecutionContext
  ): Promise<MeetingPrepResult> {
    const { eventId } = job.data;
    const { userId } = context;

    logger.info('Generating meeting prep', { userId, eventId, jobId: job.id });

    // Get the calendar event
    const event = await prisma.calendarEvent.findFirst({
      where: { id: eventId, userId },
    });

    if (!event) {
      logger.error('Calendar event not found', { eventId, userId });
      return {
        success: false,
        error: 'Calendar event not found',
      };
    }

    // Check if meeting is still in the future
    if (new Date(event.startTime) < new Date()) {
      logger.info('Meeting already started, skipping prep', { eventId });
      return {
        success: true,
        data: {
          eventId,
          skipped: true,
          reason: 'Meeting already started',
        },
      };
    }

    // Send urgent reminder if meeting is within 15 minutes
    const minutesUntil = (new Date(event.startTime).getTime() - Date.now()) / (1000 * 60);
    if (minutesUntil <= 15 && minutesUntil > 0) {
      await notificationService.send({
        userId,
        type: 'MEETING_REMINDER',
        title: `Meeting in ${Math.round(minutesUntil)} min: ${event.title}`,
        body: event.location ? `📍 ${event.location}` : undefined,
        priority: 'HIGH',
        data: { eventId, meetingUrl: event.meetingUrl },
        actions: event.meetingUrl ? [{
          type: 'button',
          label: 'Join Meeting',
          action: event.meetingUrl,
        }] : [],
      });

      logger.info('Meeting reminder sent', { userId, eventId, minutesUntil: Math.round(minutesUntil) });
    }

    // Convert event with proper typing
    const typedEvent = {
      id: event.id,
      title: event.title,
      description: event.description,
      attendees: Array.isArray(event.attendees) ? event.attendees.filter((a): a is string => typeof a === 'string') : [],
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
      meetingUrl: event.meetingUrl,
    };

    // Generate meeting prep
    const prepData = await this.generateMeetingPrep(userId, typedEvent);

    // Send notification with meeting prep
    await notificationService.send({
      userId,
      type: 'MEETING_PREP',
      title: `Prep for: ${event.title}`,
      body: this.formatPrepSummary(prepData),
      data: prepData as unknown as Record<string, unknown>,
      priority: 'NORMAL',
      actions: [
        {
          type: 'button',
          label: 'View Full Prep',
          action: `view_prep:${eventId}`,
        },
        ...(event.meetingUrl
          ? [
              {
                type: 'button' as const,
                label: 'Join Meeting',
                action: event.meetingUrl,
              },
            ]
          : []),
      ],
    });

    logger.info('Meeting prep sent', {
      userId,
      eventId,
      attendeesResearched: prepData.attendees?.length || 0,
    });

    return {
      success: true,
      data: {
        eventId,
        attendeesResearched: prepData.attendees?.length || 0,
        relatedEmailsFound: prepData.relatedEmails?.length || 0,
        notificationSent: true,
      },
    };
  }

  /**
   * Generate meeting preparation data
   */
  private async generateMeetingPrep(
    userId: string,
    event: {
      id: string;
      title: string;
      description: string | null;
      attendees: string[];
      startTime: Date;
      endTime: Date;
      location: string | null;
      meetingUrl: string | null;
    }
  ): Promise<{
    eventTitle: string;
    eventTime: string;
    duration: number;
    location?: string;
    meetingUrl?: string;
    attendees?: Array<{
      email: string;
      name?: string;
      title?: string;
      company?: string;
      lastInteraction?: string;
      notes?: string;
    }>;
    relatedEmails?: Array<{
      subject: string;
      from: string;
      date: string;
      snippet: string;
    }>;
    talkingPoints?: string[];
    context?: string;
  }> {
    const prepData: ReturnType<typeof this.generateMeetingPrep> extends Promise<infer T> ? T : never = {
      eventTitle: event.title,
      eventTime: event.startTime.toISOString(),
      duration: Math.round(
        (event.endTime.getTime() - event.startTime.getTime()) / (1000 * 60)
      ),
      location: event.location || undefined,
      meetingUrl: event.meetingUrl || undefined,
    };

    // Research attendees
    if (event.attendees.length > 0) {
      prepData.attendees = await this.researchAttendees(userId, event.attendees);
    }

    // Find related emails
    prepData.relatedEmails = await this.findRelatedEmails(
      userId,
      event.title,
      event.attendees
    );

    // Generate talking points
    prepData.talkingPoints = await this.generateTalkingPoints(
      event,
      prepData.attendees,
      prepData.relatedEmails
    );

    // Check if there's existing prep data
    try {
      const existingPrep = await meetingPrepService.getMeetingPrep(event.id, userId);
      if (existingPrep?.researchNotes) {
        prepData.context = existingPrep.researchNotes;
      }
    } catch (error) {
      logger.debug('Could not retrieve existing prep data', { error });
    }

    return prepData;
  }

  /**
   * Research meeting attendees
   */
  private async researchAttendees(
    userId: string,
    attendeeEmails: string[]
  ): Promise<
    Array<{
      email: string;
      name?: string;
      title?: string;
      company?: string;
      lastInteraction?: string;
      notes?: string;
    }>
  > {
    const results = [];

    for (const email of attendeeEmails.slice(0, 10)) {
      // Check if we have this contact in our CRM
      const contact = await prisma.contact.findFirst({
        where: {
          userId,
          email: { equals: email, mode: 'insensitive' },
        },
        include: {
          interactions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (contact) {
        results.push({
          email,
          name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || undefined,
          title: contact.jobTitle || undefined,
          company: contact.company || undefined,
          lastInteraction: contact.interactions[0]?.createdAt?.toISOString(),
          notes: contact.notes || undefined,
        });
      } else {
        // Just add basic info
        results.push({ email });
      }
    }

    return results;
  }

  /**
   * Find emails related to this meeting
   */
  private async findRelatedEmails(
    userId: string,
    meetingTitle: string,
    attendeeEmails: string[]
  ): Promise<
    Array<{
      subject: string;
      from: string;
      date: string;
      snippet: string;
    }>
  > {
    // Search for emails from attendees or with similar subject
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const emails = await prisma.email.findMany({
      where: {
        userId,
        receivedAt: { gte: thirtyDaysAgo },
        OR: [
          { fromAddress: { in: attendeeEmails } },
          {
            subject: {
              contains: meetingTitle.split(' ')[0], // First word of meeting title
              mode: 'insensitive',
            },
          },
        ],
      },
      orderBy: { receivedAt: 'desc' },
      take: 5,
      select: {
        subject: true,
        fromAddress: true,
        fromName: true,
        receivedAt: true,
        snippet: true,
      },
    });

    return emails.map((email) => ({
      subject: email.subject,
      from: email.fromName || email.fromAddress,
      date: email.receivedAt.toISOString(),
      snippet: email.snippet || '',
    }));
  }

  /**
   * Generate talking points based on available context
   */
  private async generateTalkingPoints(
    event: { title: string; description: string | null },
    attendees?: Array<{ name?: string; lastInteraction?: string }>,
    relatedEmails?: Array<{ subject: string }>
  ): Promise<string[]> {
    const points: string[] = [];

    // Add context from meeting description
    if (event.description) {
      points.push(`Review meeting agenda: ${event.description.slice(0, 100)}`);
    }

    // Add attendee-related points
    if (attendees && attendees.length > 0) {
      const knownAttendees = attendees.filter((a) => a.name);
      if (knownAttendees.length > 0) {
        points.push(
          `Prepare personalized greetings for: ${knownAttendees
            .map((a) => a.name)
            .join(', ')}`
        );
      }

      const staleContacts = attendees.filter((a) => {
        if (!a.lastInteraction) return true;
        const lastDate = new Date(a.lastInteraction);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return lastDate < thirtyDaysAgo;
      });

      if (staleContacts.length > 0) {
        points.push('Consider reconnecting - some attendees haven\'t been contacted recently');
      }
    }

    // Add email-related points
    if (relatedEmails && relatedEmails.length > 0) {
      points.push(
        `Review ${relatedEmails.length} related email thread${relatedEmails.length > 1 ? 's' : ''}`
      );
    }

    // Add generic preparation points
    points.push('Prepare any materials or documents needed for the meeting');
    points.push('Review action items from previous meetings if applicable');

    return points;
  }

  /**
   * Format prep data into a notification summary
   */
  private formatPrepSummary(prepData: {
    eventTitle: string;
    eventTime: string;
    duration: number;
    attendees?: Array<{ email: string; name?: string }>;
    relatedEmails?: Array<{ subject: string }>;
    talkingPoints?: string[];
  }): string {
    const lines: string[] = [];

    const startTime = new Date(prepData.eventTime);
    lines.push(
      `Meeting starts at ${startTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })} (${prepData.duration} min)`
    );

    if (prepData.attendees && prepData.attendees.length > 0) {
      const attendeeNames = prepData.attendees
        .slice(0, 3)
        .map((a) => a.name || a.email.split('@')[0])
        .join(', ');
      lines.push(
        `Attendees: ${attendeeNames}${prepData.attendees.length > 3 ? ` +${prepData.attendees.length - 3} more` : ''}`
      );
    }

    if (prepData.relatedEmails && prepData.relatedEmails.length > 0) {
      lines.push(`${prepData.relatedEmails.length} related emails found`);
    }

    if (prepData.talkingPoints && prepData.talkingPoints.length > 0) {
      lines.push(`\nKey prep points:`);
      prepData.talkingPoints.slice(0, 3).forEach((point) => {
        lines.push(`• ${point}`);
      });
    }

    return lines.join('\n');
  }

  protected async updateMetrics(
    context: JobExecutionContext,
    result: MeetingPrepResult
  ): Promise<void> {
    // Meeting prep doesn't directly update success metrics
  }
}

export const meetingPrepWorker = new MeetingPrepWorker();
