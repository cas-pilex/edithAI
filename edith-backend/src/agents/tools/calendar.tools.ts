import { toolRegistry, createTool } from './index.js';
import type { EnhancedAgentContext, ToolHandlerResult } from '../../types/agent.types.js';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';

// ==================== TOOL HANDLERS ====================

async function handleFindAvailableSlots(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { duration, dateRange, attendeeEmails, preferences } = input as {
    duration: number;
    dateRange: { start: string; end: string };
    attendeeEmails?: string[];
    preferences?: {
      preferMorning?: boolean;
      preferAfternoon?: boolean;
      avoidBackToBack?: boolean;
    };
  };

  try {
    // Get user's events in the date range
    const events = await prisma.calendarEvent.findMany({
      where: {
        userId: context.userId,
        startTime: { gte: new Date(dateRange.start) },
        endTime: { lte: new Date(dateRange.end) },
        status: { not: 'CANCELLED' },
      },
      orderBy: { startTime: 'asc' },
    });

    // Get user preferences for scheduling
    const userPrefs = await prisma.schedulingPreference.findUnique({
      where: { userId: context.userId },
    });

    // Calculate available slots (simplified - real implementation would be more complex)
    const slots: Array<{ start: Date; end: Date; score: number }> = [];
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);

    // Generate potential slots
    const current = new Date(startDate);
    while (current < endDate) {
      const dayOfWeek = current.getDay();
      const noMeetingDays = userPrefs?.noMeetingDays || [];
      const workingDays = [1, 2, 3, 4, 5].filter(d => !noMeetingDays.includes(d)); // Mon-Fri minus no-meeting days

      if (workingDays.includes(dayOfWeek)) {
        // Use default working hours (preferences for these are in UserPreference, not SchedulingPreference)
        const workStart = '09:00';
        const workEnd = '17:00';

        const [startHour] = workStart.split(':').map(Number);
        const [endHour] = workEnd.split(':').map(Number);

        for (let hour = startHour; hour <= endHour - Math.ceil(duration / 60); hour++) {
          const slotStart = new Date(current);
          slotStart.setHours(hour, 0, 0, 0);

          const slotEnd = new Date(slotStart);
          slotEnd.setMinutes(slotEnd.getMinutes() + duration);

          // Check for conflicts
          const hasConflict = events.some(
            (e) => slotStart < e.endTime && slotEnd > e.startTime
          );

          if (!hasConflict) {
            let score = 100;
            if (preferences?.preferMorning && hour >= 12) score -= 20;
            if (preferences?.preferAfternoon && hour < 12) score -= 20;

            slots.push({ start: slotStart, end: slotEnd, score });
          }
        }
      }

      current.setDate(current.getDate() + 1);
    }

    // Sort by score and limit results
    const sortedSlots = slots.sort((a, b) => b.score - a.score).slice(0, 10);

    return {
      success: true,
      data: {
        availableSlots: sortedSlots,
        duration,
        dateRange,
        attendeeEmails,
      },
    };
  } catch (error) {
    logger.error('Failed to find available slots', { error });
    return {
      success: false,
      error: `Failed to find slots: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleScheduleMeeting(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { title, startTime, endTime, attendees, location, meetingUrl, description, addBuffer } = input as {
    title: string;
    startTime: string;
    endTime: string;
    attendees?: string[];
    location?: string;
    meetingUrl?: string;
    description?: string;
    addBuffer?: boolean;
  };

  // Check if there are external attendees
  const hasExternalAttendees = attendees && attendees.length > 0;

  if (hasExternalAttendees) {
    return {
      success: true,
      requiresApproval: true,
      approvalDetails: {
        proposedAction: { title, startTime, endTime, attendees, location, meetingUrl, description },
        reasoning: 'Meeting with external attendees requires approval',
        impact: {
          type: 'MEDIUM',
          affectedAreas: ['calendar', 'external_communication'],
          affectedContacts: attendees,
        },
        isReversible: true,
        relatedEntities: [],
      },
      data: { message: 'Meeting scheduling with external attendees requires approval' },
    };
  }

  try {
    const event = await prisma.calendarEvent.create({
      data: {
        userId: context.userId,
        externalId: `local-${Date.now()}`,
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        timezone: context.timezone || 'Europe/Amsterdam',
        location,
        meetingUrl,
        isOnline: !!meetingUrl,
        attendees: attendees ? JSON.parse(JSON.stringify(attendees.map((e) => ({ email: e, status: 'needsAction' })))) : [],
        status: 'CONFIRMED',
      },
    });

    // Add buffer time if requested
    if (addBuffer) {
      const bufferMinutes = context.userPreferences?.meetingBufferMinutes || 15;
      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: {
          suggestedPrepTime: bufferMinutes,
          optimizationNotes: `Buffer time of ${bufferMinutes} minutes added`,
        },
      });
    }

    return {
      success: true,
      data: {
        eventId: event.id,
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        attendees: event.attendees,
      },
    };
  } catch (error) {
    logger.error('Failed to schedule meeting', { error });
    return {
      success: false,
      error: `Failed to schedule meeting: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleRescheduleMeeting(
  input: Record<string, unknown>,
  _context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { eventId, newStartTime, newEndTime, notifyAttendees, reason } = input as {
    eventId: string;
    newStartTime: string;
    newEndTime: string;
    notifyAttendees?: boolean;
    reason?: string;
  };

  return {
    success: true,
    requiresApproval: true,
    approvalDetails: {
      proposedAction: { eventId, newStartTime, newEndTime, notifyAttendees, reason },
      reasoning: 'Rescheduling a meeting requires approval',
      impact: {
        type: 'MEDIUM',
        affectedAreas: ['calendar'],
      },
      isReversible: true,
      relatedEntities: [{ type: 'event', id: eventId, displayName: 'Meeting' }],
    },
    data: { message: 'Meeting reschedule requires approval', eventId },
  };
}

async function handleCancelMeeting(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { eventId, notifyAttendees, cancellationMessage } = input as {
    eventId: string;
    notifyAttendees?: boolean;
    cancellationMessage?: string;
  };

  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId, userId: context.userId },
  });

  return {
    success: true,
    requiresApproval: true,
    approvalDetails: {
      proposedAction: { eventId, notifyAttendees, cancellationMessage },
      reasoning: 'Canceling a meeting always requires approval',
      impact: {
        type: 'HIGH',
        affectedAreas: ['calendar', 'external_communication'],
      },
      isReversible: false,
      relatedEntities: [{ type: 'event', id: eventId, displayName: event?.title || 'Meeting' }],
    },
    data: { message: 'Meeting cancellation requires approval', eventId },
  };
}

async function handleAddBufferTime(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { eventId, bufferBefore, bufferAfter } = input as {
    eventId: string;
    bufferBefore?: number;
    bufferAfter?: number;
  };

  try {
    const event = await prisma.calendarEvent.update({
      where: { id: eventId, userId: context.userId },
      data: {
        suggestedPrepTime: bufferBefore || 0,
        optimizationNotes: `Buffer: ${bufferBefore || 0}min before, ${bufferAfter || 0}min after`,
      },
    });

    return {
      success: true,
      data: {
        eventId: event.id,
        bufferBefore,
        bufferAfter,
      },
    };
  } catch (error) {
    logger.error('Failed to add buffer time', { error, eventId });
    return {
      success: false,
      error: `Failed to add buffer: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleCalculateTravelTime(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { eventId, fromLocation } = input as {
    eventId: string;
    fromLocation?: string;
  };

  try {
    const event = await prisma.calendarEvent.findUnique({
      where: { id: eventId, userId: context.userId },
    });

    if (!event || !event.location) {
      return {
        success: false,
        error: 'Event not found or has no location',
      };
    }

    // Mock travel time calculation (would use Google Maps API in real implementation)
    const estimatedMinutes = 30; // Placeholder

    await prisma.calendarEvent.update({
      where: { id: eventId },
      data: { travelTimeMinutes: estimatedMinutes },
    });

    return {
      success: true,
      data: {
        eventId,
        fromLocation: fromLocation || 'current location',
        toLocation: event.location,
        estimatedMinutes,
        method: 'driving',
      },
    };
  } catch (error) {
    logger.error('Failed to calculate travel time', { error, eventId });
    return {
      success: false,
      error: `Failed to calculate travel: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleDetectConflicts(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { dateRange } = input as {
    dateRange: { start: string; end: string };
  };

  try {
    const events = await prisma.calendarEvent.findMany({
      where: {
        userId: context.userId,
        startTime: { gte: new Date(dateRange.start) },
        endTime: { lte: new Date(dateRange.end) },
        status: { not: 'CANCELLED' },
      },
      orderBy: { startTime: 'asc' },
    });

    const conflicts: Array<{ event1: string; event2: string; overlapMinutes: number }> = [];

    for (let i = 0; i < events.length - 1; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const e1 = events[i];
        const e2 = events[j];

        if (e1.endTime > e2.startTime && e1.startTime < e2.endTime) {
          const overlapStart = e1.startTime > e2.startTime ? e1.startTime : e2.startTime;
          const overlapEnd = e1.endTime < e2.endTime ? e1.endTime : e2.endTime;
          const overlapMinutes = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 60000);

          conflicts.push({
            event1: e1.title,
            event2: e2.title,
            overlapMinutes,
          });
        }
      }
    }

    return {
      success: true,
      data: {
        conflicts,
        hasConflicts: conflicts.length > 0,
        dateRange,
      },
    };
  } catch (error) {
    logger.error('Failed to detect conflicts', { error });
    return {
      success: false,
      error: `Failed to detect conflicts: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleOptimizeDay(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { date } = input as { date: string };

  try {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const events = await prisma.calendarEvent.findMany({
      where: {
        userId: context.userId,
        startTime: { gte: dayStart },
        endTime: { lte: dayEnd },
        status: { not: 'CANCELLED' },
      },
      orderBy: { startTime: 'asc' },
    });

    const suggestions: string[] = [];

    // Check for back-to-back meetings
    for (let i = 0; i < events.length - 1; i++) {
      const timeBetween = (events[i + 1].startTime.getTime() - events[i].endTime.getTime()) / 60000;
      if (timeBetween < 15) {
        suggestions.push(`Consider adding buffer between "${events[i].title}" and "${events[i + 1].title}"`);
      }
    }

    // Check for too many meetings
    if (events.length > (context.userPreferences?.maxMeetingsPerDay || 8)) {
      suggestions.push(`You have ${events.length} meetings - consider rescheduling some`);
    }

    return {
      success: true,
      data: {
        date,
        eventCount: events.length,
        suggestions,
        events: events.map((e) => ({
          id: e.id,
          title: e.title,
          startTime: e.startTime,
          endTime: e.endTime,
        })),
      },
    };
  } catch (error) {
    logger.error('Failed to optimize day', { error });
    return {
      success: false,
      error: `Failed to optimize: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleBlockFocusTime(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { duration, preferredTimes, recurring, recurrenceRule } = input as {
    duration: number;
    preferredTimes?: string[];
    recurring?: boolean;
    recurrenceRule?: string;
  };

  try {
    // Create a focus time block event
    const startTime = new Date();
    startTime.setHours(9, 0, 0, 0); // Default to 9 AM

    if (preferredTimes && preferredTimes.length > 0) {
      const [hour] = preferredTimes[0].split(':').map(Number);
      startTime.setHours(hour);
    }

    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + duration);

    const event = await prisma.calendarEvent.create({
      data: {
        userId: context.userId,
        externalId: `focus-${Date.now()}`,
        title: 'Focus Time',
        description: 'Protected focus time block',
        startTime,
        endTime,
        timezone: context.timezone || 'Europe/Amsterdam',
        isOnline: false,
        attendees: [],
        status: 'CONFIRMED',
        recurrenceRule: recurring ? recurrenceRule : undefined,
        optimizationNotes: 'Auto-created focus time block',
      },
    });

    return {
      success: true,
      data: {
        eventId: event.id,
        startTime: event.startTime,
        endTime: event.endTime,
        duration,
        recurring,
      },
    };
  } catch (error) {
    logger.error('Failed to block focus time', { error });
    return {
      success: false,
      error: `Failed to block focus time: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ==================== TOOL REGISTRATION ====================

export function registerCalendarTools(): void {
  toolRegistry.register(
    createTool(
      'find_available_slots',
      'Find available time slots for a meeting based on calendar and preferences',
      {
        duration: { type: 'number', description: 'Meeting duration in minutes' },
        dateRange: {
          type: 'object',
          description: 'Date range to search',
          properties: {
            start: { type: 'string', description: 'Start date (ISO format)' },
            end: { type: 'string', description: 'End date (ISO format)' },
          },
          required: ['start', 'end'],
        },
        attendeeEmails: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email addresses of attendees to check availability',
        },
        preferences: {
          type: 'object',
          description: 'Scheduling preferences',
          properties: {
            preferMorning: { type: 'boolean' },
            preferAfternoon: { type: 'boolean' },
            avoidBackToBack: { type: 'boolean' },
          },
        },
      },
      ['duration', 'dateRange'],
      'calendar',
      handleFindAvailableSlots,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'schedule_meeting',
      'Schedule a new meeting (requires approval if external attendees)',
      {
        title: { type: 'string', description: 'Meeting title' },
        startTime: { type: 'string', description: 'Start time (ISO format)' },
        endTime: { type: 'string', description: 'End time (ISO format)' },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Attendee email addresses',
        },
        location: { type: 'string', description: 'Physical location' },
        meetingUrl: { type: 'string', description: 'Video meeting URL' },
        description: { type: 'string', description: 'Meeting description' },
        addBuffer: { type: 'boolean', description: 'Add buffer time before/after' },
      },
      ['title', 'startTime', 'endTime'],
      'calendar',
      handleScheduleMeeting,
      { requiresApproval: true, approvalCategory: 'REQUEST_APPROVAL' }
    )
  );

  toolRegistry.register(
    createTool(
      'reschedule_meeting',
      'Reschedule an existing meeting (requires approval)',
      {
        eventId: { type: 'string', description: 'Event ID to reschedule' },
        newStartTime: { type: 'string', description: 'New start time (ISO format)' },
        newEndTime: { type: 'string', description: 'New end time (ISO format)' },
        notifyAttendees: { type: 'boolean', description: 'Notify attendees of change' },
        reason: { type: 'string', description: 'Reason for rescheduling' },
      },
      ['eventId', 'newStartTime', 'newEndTime'],
      'calendar',
      handleRescheduleMeeting,
      { requiresApproval: true, approvalCategory: 'REQUEST_APPROVAL' }
    )
  );

  toolRegistry.register(
    createTool(
      'cancel_meeting',
      'Cancel a meeting (always requires approval)',
      {
        eventId: { type: 'string', description: 'Event ID to cancel' },
        notifyAttendees: { type: 'boolean', description: 'Notify attendees of cancellation' },
        cancellationMessage: { type: 'string', description: 'Message to send to attendees' },
      },
      ['eventId'],
      'calendar',
      handleCancelMeeting,
      { requiresApproval: true, approvalCategory: 'ALWAYS_ASK' }
    )
  );

  toolRegistry.register(
    createTool(
      'add_buffer_time',
      'Add buffer time before and/or after a meeting',
      {
        eventId: { type: 'string', description: 'Event ID' },
        bufferBefore: { type: 'number', description: 'Minutes before meeting' },
        bufferAfter: { type: 'number', description: 'Minutes after meeting' },
      },
      ['eventId'],
      'calendar',
      handleAddBufferTime,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'calculate_travel_time',
      'Calculate travel time to a meeting location',
      {
        eventId: { type: 'string', description: 'Event ID' },
        fromLocation: { type: 'string', description: 'Starting location (optional)' },
      },
      ['eventId'],
      'calendar',
      handleCalculateTravelTime,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'detect_conflicts',
      'Detect scheduling conflicts in a date range',
      {
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string', description: 'Start date (ISO format)' },
            end: { type: 'string', description: 'End date (ISO format)' },
          },
          required: ['start', 'end'],
        },
      },
      ['dateRange'],
      'calendar',
      handleDetectConflicts,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'optimize_day',
      'Analyze and suggest optimizations for a day\'s schedule',
      {
        date: { type: 'string', description: 'Date to optimize (ISO format)' },
      },
      ['date'],
      'calendar',
      handleOptimizeDay,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'block_focus_time',
      'Block focus/deep work time in the calendar',
      {
        duration: { type: 'number', description: 'Duration in minutes' },
        preferredTimes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Preferred start times (HH:mm format)',
        },
        recurring: { type: 'boolean', description: 'Make it recurring' },
        recurrenceRule: { type: 'string', description: 'RRULE for recurrence' },
      },
      ['duration'],
      'calendar',
      handleBlockFocusTime,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  logger.info('Calendar tools registered', { count: 9 });
}
