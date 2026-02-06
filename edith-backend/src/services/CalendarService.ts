/**
 * CalendarService
 * Business logic for calendar and event management
 */

import { prisma } from '../database/client.js';

export interface EventFilters {
  startDate?: Date;
  endDate?: Date;
  isAllDay?: boolean;
  isOnline?: boolean;
  status?: string;
}

export interface AttendeeInput {
  email: string;
  name?: string;
  status?: string;
  isOrganizer?: boolean;
}

export interface CreateEventInput {
  externalId: string;
  calendarId?: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  timezone?: string;
  location?: string;
  isOnline?: boolean;
  meetingUrl?: string;
  recurrenceRule?: string;
  organizer?: string;
  attendees?: AttendeeInput[];
}

class CalendarServiceImpl {
  /**
   * Get events with filters
   */
  async getEvents(
    userId: string,
    filters: EventFilters = {},
    pagination: { limit?: number; offset?: number } = {}
  ): Promise<{ events: unknown[]; total: number }> {
    const { limit = 100, offset = 0 } = pagination;

    const where: Record<string, unknown> = { userId };

    if (filters.startDate || filters.endDate) {
      where.startTime = {};
      if (filters.startDate) (where.startTime as Record<string, Date>).gte = filters.startDate;
      if (filters.endDate) (where.startTime as Record<string, Date>).lte = filters.endDate;
    }
    if (filters.isOnline !== undefined) where.isOnline = filters.isOnline;
    if (filters.status) where.status = filters.status;

    const [events, total] = await Promise.all([
      prisma.calendarEvent.findMany({
        where,
        orderBy: { startTime: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.calendarEvent.count({ where }),
    ]);

    return { events, total };
  }

  /**
   * Get event by ID
   */
  async getEventById(id: string, userId: string) {
    return prisma.calendarEvent.findFirst({
      where: { id, userId },
    });
  }

  /**
   * Create event
   */
  async createEvent(userId: string, data: CreateEventInput) {
    const { attendees, ...eventData } = data;

    return prisma.calendarEvent.create({
      data: {
        userId,
        externalId: eventData.externalId,
        calendarId: eventData.calendarId,
        title: eventData.title,
        description: eventData.description,
        startTime: eventData.startTime,
        endTime: eventData.endTime,
        timezone: eventData.timezone || 'UTC',
        location: eventData.location,
        isOnline: eventData.isOnline || false,
        meetingUrl: eventData.meetingUrl,
        recurrenceRule: eventData.recurrenceRule,
        organizer: eventData.organizer,
        // Attendees is a Json field
        attendees: attendees ? (attendees as object) : [],
      },
    });
  }

  /**
   * Update event
   */
  async updateEvent(
    id: string,
    userId: string,
    data: Partial<CreateEventInput>
  ) {
    // Verify ownership
    const existing = await prisma.calendarEvent.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new Error('Event not found');
    }

    const { attendees, ...eventData } = data;

    const updateData: Record<string, unknown> = { ...eventData };
    if (attendees) {
      updateData.attendees = attendees as object;
    }

    return prisma.calendarEvent.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Delete event
   */
  async deleteEvent(id: string, userId: string) {
    // Verify ownership
    const event = await prisma.calendarEvent.findFirst({
      where: { id, userId },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    await prisma.calendarEvent.delete({ where: { id } });
    return true;
  }

  /**
   * Find available slots
   */
  async findAvailableSlots(
    userId: string,
    params: {
      startDate: Date;
      endDate: Date;
      duration: number; // minutes
      workingHoursStart?: string; // "09:00"
      workingHoursEnd?: string; // "17:00"
      bufferMinutes?: number;
    }
  ): Promise<Array<{ start: Date; end: Date }>> {
    const {
      startDate,
      endDate,
      duration,
      workingHoursStart = '09:00',
      workingHoursEnd = '17:00',
      bufferMinutes = 15,
    } = params;

    // Get all events in the range
    const events = await prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: startDate, lte: endDate },
      },
      orderBy: { startTime: 'asc' },
    });

    const slots: Array<{ start: Date; end: Date }> = [];
    const [startHour, startMin] = workingHoursStart.split(':').map(Number);
    const [endHour, endMin] = workingHoursEnd.split(':').map(Number);

    // Iterate through each day
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      // Skip weekends
      if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
        const dayStart = new Date(currentDate);
        dayStart.setHours(startHour, startMin, 0, 0);

        const dayEnd = new Date(currentDate);
        dayEnd.setHours(endHour, endMin, 0, 0);

        // Get events for this day
        const dayEvents = events.filter(e => {
          const eventDate = new Date(e.startTime);
          return eventDate.toDateString() === currentDate.toDateString();
        });

        // Find gaps
        let slotStart = dayStart;
        for (const event of dayEvents) {
          const eventStart = new Date(event.startTime);
          const eventEnd = new Date(event.endTime);

          // Check if there's a slot before this event
          const gapMinutes = (eventStart.getTime() - slotStart.getTime()) / 60000;
          if (gapMinutes >= duration + bufferMinutes) {
            const slotEnd = new Date(slotStart.getTime() + duration * 60000);
            if (slotEnd <= eventStart) {
              slots.push({ start: new Date(slotStart), end: slotEnd });
            }
          }

          // Move slot start to after this event (with buffer)
          slotStart = new Date(eventEnd.getTime() + bufferMinutes * 60000);
        }

        // Check for slot after last event
        const remainingMinutes = (dayEnd.getTime() - slotStart.getTime()) / 60000;
        if (remainingMinutes >= duration) {
          const slotEnd = new Date(slotStart.getTime() + duration * 60000);
          if (slotEnd <= dayEnd) {
            slots.push({ start: new Date(slotStart), end: slotEnd });
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return slots;
  }

  /**
   * Check for conflicts
   */
  async checkConflicts(
    userId: string,
    startTime: Date,
    endTime: Date,
    excludeEventId?: string
  ) {
    const conflicts = await prisma.calendarEvent.findMany({
      where: {
        userId,
        id: excludeEventId ? { not: excludeEventId } : undefined,
        OR: [
          {
            startTime: { gte: startTime, lt: endTime },
          },
          {
            endTime: { gt: startTime, lte: endTime },
          },
          {
            AND: [
              { startTime: { lte: startTime } },
              { endTime: { gte: endTime } },
            ],
          },
        ],
      },
    });

    return conflicts;
  }

  /**
   * Get events for a specific day
   */
  async getDayEvents(userId: string, date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  /**
   * Get calendar stats
   */
  async getStats(userId: string, startDate: Date, endDate: Date) {
    const events = await prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: startDate, lte: endDate },
      },
    });

    const totalMeetings = events.length;
    const totalMinutes = events.reduce((sum, e) => {
      return sum + (new Date(e.endTime).getTime() - new Date(e.startTime).getTime()) / 60000;
    }, 0);

    const virtualMeetings = events.filter(e => e.isOnline).length;

    // Count meetings with external attendees (parse Json attendees field)
    const meetingsWithExternalAttendees = events.filter(e => {
      const attendees = e.attendees as AttendeeInput[] | null;
      return attendees && Array.isArray(attendees) && attendees.some(a => !a.isOrganizer);
    }).length;

    return {
      totalMeetings,
      totalMinutes,
      averageDuration: totalMeetings > 0 ? totalMinutes / totalMeetings : 0,
      virtualMeetings,
      inPersonMeetings: totalMeetings - virtualMeetings,
      meetingsWithExternalAttendees,
    };
  }
}

export const calendarService = new CalendarServiceImpl();
export default calendarService;
