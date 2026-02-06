/**
 * Google Calendar Client Interface, Real and Mock Implementations
 * Provides calendar operations through Google Calendar API
 */

import { google, calendar_v3 } from 'googleapis';
import type { Auth } from 'googleapis';
import { config } from '../../config/index.js';
import { googleOAuthClient } from './GoogleOAuthClient.js';
import { rateLimiter } from '../common/RateLimiter.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
    organizer?: boolean;
  }>;
  organizer?: {
    email: string;
    displayName?: string;
  };
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType: string;
      uri: string;
    }>;
  };
  recurrence?: string[];
  recurringEventId?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  created: string;
  updated: string;
  iCalUID?: string;
}

export interface CalendarQuery {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  singleEvents?: boolean;
  orderBy?: 'startTime' | 'updated';
  q?: string;
  pageToken?: string;
  syncToken?: string;
  showDeleted?: boolean;
}

export interface CreateEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
  }>;
  conferenceDataVersion?: number;
  recurrence?: string[];
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
}

export interface UpdateEventInput extends Partial<CreateEventInput> {
  status?: 'confirmed' | 'tentative' | 'cancelled';
}

export interface FreeBusyQuery {
  timeMin: string;
  timeMax: string;
  items: Array<{ id: string }>;
}

export interface FreeBusyResult {
  calendars: Record<string, {
    busy: Array<{
      start: string;
      end: string;
    }>;
  }>;
}

export interface CalendarListResult {
  items: CalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface CalendarInfo {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  accessRole: string;
  backgroundColor?: string;
}

export interface WatchResponse {
  channelId: string;
  resourceId: string;
  resourceUri: string;
  expiration: string;
}

// ============================================================================
// Interface
// ============================================================================

export interface ICalendarClient {
  listEvents(query: CalendarQuery): Promise<CalendarListResult>;
  getEvent(eventId: string, calendarId?: string): Promise<CalendarEvent>;
  createEvent(event: CreateEventInput, calendarId?: string): Promise<CalendarEvent>;
  updateEvent(eventId: string, update: UpdateEventInput, calendarId?: string): Promise<CalendarEvent>;
  deleteEvent(eventId: string, calendarId?: string): Promise<void>;
  getFreeBusy(query: FreeBusyQuery): Promise<FreeBusyResult>;
}

export interface ICalendarClientExtended extends ICalendarClient {
  listCalendars(): Promise<CalendarInfo[]>;
  syncEvents(calendarId: string, syncToken?: string): Promise<CalendarListResult>;
  watchCalendar(calendarId: string, webhookUrl: string, channelId: string): Promise<WatchResponse>;
  stopWatch(channelId: string, resourceId: string): Promise<void>;
}

// ============================================================================
// Real Implementation
// ============================================================================

export class RealCalendarClient implements ICalendarClientExtended {
  private calendar: calendar_v3.Calendar;
  private userId: string;

  constructor(auth: Auth.OAuth2Client, userId: string) {
    this.calendar = google.calendar({ version: 'v3', auth });
    this.userId = userId;
  }

  async listEvents(query: CalendarQuery): Promise<CalendarListResult> {
    return rateLimiter.executeForProvider('GOOGLE_CALENDAR', this.userId, 'listEvents', async () => {
      const response = await this.calendar.events.list({
        calendarId: query.calendarId || 'primary',
        timeMin: query.timeMin,
        timeMax: query.timeMax,
        maxResults: query.maxResults || 250,
        singleEvents: query.singleEvents ?? true,
        orderBy: query.orderBy || 'startTime',
        q: query.q,
        pageToken: query.pageToken,
        showDeleted: query.showDeleted,
      });

      return {
        items: (response.data.items || []).map(e => this.mapEvent(e)),
        nextPageToken: response.data.nextPageToken || undefined,
        nextSyncToken: response.data.nextSyncToken || undefined,
      };
    });
  }

  async getEvent(eventId: string, calendarId: string = 'primary'): Promise<CalendarEvent> {
    return rateLimiter.executeForProvider('GOOGLE_CALENDAR', this.userId, 'getEvent', async () => {
      const response = await this.calendar.events.get({
        calendarId,
        eventId,
      });

      return this.mapEvent(response.data);
    });
  }

  async createEvent(input: CreateEventInput, calendarId: string = 'primary'): Promise<CalendarEvent> {
    return rateLimiter.executeForProvider('GOOGLE_CALENDAR', this.userId, 'createEvent', async () => {
      const response = await this.calendar.events.insert({
        calendarId,
        conferenceDataVersion: input.conferenceDataVersion,
        requestBody: {
          summary: input.summary,
          description: input.description,
          location: input.location,
          start: input.start,
          end: input.end,
          attendees: input.attendees,
          recurrence: input.recurrence,
          reminders: input.reminders,
        },
      });

      return this.mapEvent(response.data);
    });
  }

  async updateEvent(eventId: string, update: UpdateEventInput, calendarId: string = 'primary'): Promise<CalendarEvent> {
    return rateLimiter.executeForProvider('GOOGLE_CALENDAR', this.userId, 'updateEvent', async () => {
      const response = await this.calendar.events.patch({
        calendarId,
        eventId,
        requestBody: {
          summary: update.summary,
          description: update.description,
          location: update.location,
          start: update.start,
          end: update.end,
          attendees: update.attendees,
          status: update.status,
          recurrence: update.recurrence,
          reminders: update.reminders,
        },
      });

      return this.mapEvent(response.data);
    });
  }

  async deleteEvent(eventId: string, calendarId: string = 'primary'): Promise<void> {
    return rateLimiter.executeForProvider('GOOGLE_CALENDAR', this.userId, 'deleteEvent', async () => {
      await this.calendar.events.delete({
        calendarId,
        eventId,
      });
    });
  }

  async getFreeBusy(query: FreeBusyQuery): Promise<FreeBusyResult> {
    return rateLimiter.executeForProvider('GOOGLE_CALENDAR', this.userId, 'freeBusy', async () => {
      const response = await this.calendar.freebusy.query({
        requestBody: {
          timeMin: query.timeMin,
          timeMax: query.timeMax,
          items: query.items,
        },
      });

      const calendars: Record<string, { busy: Array<{ start: string; end: string }> }> = {};

      for (const [id, data] of Object.entries(response.data.calendars || {})) {
        calendars[id] = {
          busy: (data.busy || []).map(b => ({
            start: b.start || '',
            end: b.end || '',
          })),
        };
      }

      return { calendars };
    });
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    return rateLimiter.executeForProvider('GOOGLE_CALENDAR', this.userId, 'listCalendars', async () => {
      const response = await this.calendar.calendarList.list();

      return (response.data.items || []).map(c => ({
        id: c.id || '',
        summary: c.summary || '',
        description: c.description || undefined,
        primary: c.primary || false,
        accessRole: c.accessRole || '',
        backgroundColor: c.backgroundColor || undefined,
      }));
    });
  }

  async syncEvents(calendarId: string, syncToken?: string): Promise<CalendarListResult> {
    return rateLimiter.executeForProvider('GOOGLE_CALENDAR', this.userId, 'syncEvents', async () => {
      if (syncToken) {
        // Incremental sync
        const response = await this.calendar.events.list({
          calendarId,
          syncToken,
          showDeleted: true,
        });

        return {
          items: (response.data.items || []).map(e => this.mapEvent(e)),
          nextPageToken: response.data.nextPageToken || undefined,
          nextSyncToken: response.data.nextSyncToken || undefined,
        };
      } else {
        // Full sync - get events from past 30 days to future 90 days
        const timeMin = new Date();
        timeMin.setDate(timeMin.getDate() - 30);

        const timeMax = new Date();
        timeMax.setDate(timeMax.getDate() + 90);

        const response = await this.calendar.events.list({
          calendarId,
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: true,
          maxResults: 2500,
          showDeleted: false,
        });

        return {
          items: (response.data.items || []).map(e => this.mapEvent(e)),
          nextPageToken: response.data.nextPageToken || undefined,
          nextSyncToken: response.data.nextSyncToken || undefined,
        };
      }
    });
  }

  async watchCalendar(calendarId: string, webhookUrl: string, channelId: string): Promise<WatchResponse> {
    return rateLimiter.executeForProvider('GOOGLE_CALENDAR', this.userId, 'watch', async () => {
      const response = await this.calendar.events.watch({
        calendarId,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: webhookUrl,
        },
      });

      return {
        channelId: response.data.id || channelId,
        resourceId: response.data.resourceId || '',
        resourceUri: response.data.resourceUri || '',
        expiration: response.data.expiration || '',
      };
    });
  }

  async stopWatch(channelId: string, resourceId: string): Promise<void> {
    return rateLimiter.executeForProvider('GOOGLE_CALENDAR', this.userId, 'stopWatch', async () => {
      await this.calendar.channels.stop({
        requestBody: {
          id: channelId,
          resourceId,
        },
      });
    });
  }

  private mapEvent(event: calendar_v3.Schema$Event): CalendarEvent {
    return {
      id: event.id || '',
      summary: event.summary || '',
      description: event.description || undefined,
      location: event.location || undefined,
      start: {
        dateTime: event.start?.dateTime || undefined,
        date: event.start?.date || undefined,
        timeZone: event.start?.timeZone || undefined,
      },
      end: {
        dateTime: event.end?.dateTime || undefined,
        date: event.end?.date || undefined,
        timeZone: event.end?.timeZone || undefined,
      },
      attendees: event.attendees?.map(a => ({
        email: a.email || '',
        displayName: a.displayName || undefined,
        responseStatus: (a.responseStatus || 'needsAction') as 'needsAction' | 'declined' | 'tentative' | 'accepted',
        organizer: a.organizer || undefined,
      })),
      organizer: event.organizer ? {
        email: event.organizer.email || '',
        displayName: event.organizer.displayName || undefined,
      } : undefined,
      conferenceData: event.conferenceData ? {
        entryPoints: event.conferenceData.entryPoints?.map(ep => ({
          entryPointType: ep.entryPointType || '',
          uri: ep.uri || '',
        })),
      } : undefined,
      recurrence: event.recurrence || undefined,
      recurringEventId: event.recurringEventId || undefined,
      status: (event.status || 'confirmed') as 'confirmed' | 'tentative' | 'cancelled',
      created: event.created || '',
      updated: event.updated || '',
      iCalUID: event.iCalUID || undefined,
    };
  }
}

// ============================================================================
// Mock Implementation
// ============================================================================

const MOCK_MEETING_TITLES = [
  'Team Standup',
  'Project Review',
  'Client Call',
  '1:1 with Manager',
  'Sprint Planning',
  'Design Review',
  'Product Demo',
  'Strategy Session',
  'Interview',
  'Training Session',
];

const MOCK_ATTENDEES = [
  { email: 'alice@company.com', displayName: 'Alice Johnson' },
  { email: 'bob@company.com', displayName: 'Bob Williams' },
  { email: 'carol@company.com', displayName: 'Carol Martinez' },
  { email: 'david@client.org', displayName: 'David Lee' },
  { email: 'emma@partner.io', displayName: 'Emma Thompson' },
];

export class MockCalendarClient implements ICalendarClient {
  private events: Map<string, CalendarEvent> = new Map();
  private nextId = 1;

  constructor() {
    this.generateMockEvents();
  }

  private generateMockEvents(): void {
    const now = new Date();

    for (let day = 0; day < 14; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() + day);

      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const numEvents = Math.floor(Math.random() * 4) + 2;

      for (let i = 0; i < numEvents; i++) {
        const id = `event_${this.nextId++}`;
        const title = MOCK_MEETING_TITLES[Math.floor(Math.random() * MOCK_MEETING_TITLES.length)];
        const startHour = 9 + Math.floor(Math.random() * 8);
        const duration = [30, 30, 60, 60, 90][Math.floor(Math.random() * 5)];

        const startTime = new Date(date);
        startTime.setHours(startHour, 0, 0, 0);

        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + duration);

        const numAttendees = Math.floor(Math.random() * 4) + 1;
        const attendees = [...MOCK_ATTENDEES]
          .sort(() => Math.random() - 0.5)
          .slice(0, numAttendees)
          .map(a => ({
            ...a,
            responseStatus: ['accepted', 'tentative', 'needsAction'][Math.floor(Math.random() * 3)] as 'accepted' | 'tentative' | 'needsAction',
          }));

        const event: CalendarEvent = {
          id,
          summary: title,
          description: `${title} meeting`,
          location: Math.random() > 0.5 ? 'Conference Room A' : undefined,
          start: {
            dateTime: startTime.toISOString(),
            timeZone: 'Europe/Amsterdam',
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: 'Europe/Amsterdam',
          },
          attendees,
          organizer: {
            email: 'user@company.com',
            displayName: 'Current User',
          },
          conferenceData: Math.random() > 0.5 ? {
            entryPoints: [{
              entryPointType: 'video',
              uri: `https://meet.google.com/abc-defg-hij`,
            }],
          } : undefined,
          status: 'confirmed',
          created: now.toISOString(),
          updated: now.toISOString(),
        };

        this.events.set(id, event);
      }
    }
  }

  async listEvents(query: CalendarQuery): Promise<CalendarListResult> {
    logger.debug('Mock Calendar: listEvents', { query });
    await this.simulateDelay();

    let events = Array.from(this.events.values());

    if (query.timeMin) {
      const minTime = new Date(query.timeMin);
      events = events.filter(e => {
        const eventStart = new Date(e.start.dateTime || e.start.date || '');
        return eventStart >= minTime;
      });
    }

    if (query.timeMax) {
      const maxTime = new Date(query.timeMax);
      events = events.filter(e => {
        const eventStart = new Date(e.start.dateTime || e.start.date || '');
        return eventStart <= maxTime;
      });
    }

    if (query.q) {
      const searchLower = query.q.toLowerCase();
      events = events.filter(e =>
        e.summary.toLowerCase().includes(searchLower) ||
        e.description?.toLowerCase().includes(searchLower)
      );
    }

    if (query.orderBy === 'startTime') {
      events.sort((a, b) => {
        const aStart = new Date(a.start.dateTime || a.start.date || '');
        const bStart = new Date(b.start.dateTime || b.start.date || '');
        return aStart.getTime() - bStart.getTime();
      });
    }

    const maxResults = query.maxResults || 250;
    events = events.slice(0, maxResults);

    return { items: events, nextPageToken: undefined };
  }

  async getEvent(eventId: string): Promise<CalendarEvent> {
    logger.debug('Mock Calendar: getEvent', { eventId });
    await this.simulateDelay();

    const event = this.events.get(eventId);
    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    return event;
  }

  async createEvent(input: CreateEventInput): Promise<CalendarEvent> {
    logger.debug('Mock Calendar: createEvent', { summary: input.summary });
    await this.simulateDelay(200);

    const id = `event_${this.nextId++}`;
    const now = new Date().toISOString();

    const event: CalendarEvent = {
      id,
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: input.start,
      end: input.end,
      attendees: input.attendees?.map(a => ({
        ...a,
        responseStatus: 'needsAction' as const,
      })),
      organizer: {
        email: 'user@company.com',
        displayName: 'Current User',
      },
      status: 'confirmed',
      created: now,
      updated: now,
    };

    this.events.set(id, event);
    return event;
  }

  async updateEvent(eventId: string, update: UpdateEventInput): Promise<CalendarEvent> {
    logger.debug('Mock Calendar: updateEvent', { eventId, update });
    await this.simulateDelay(200);

    const event = this.events.get(eventId);
    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    const updatedEvent: CalendarEvent = {
      ...event,
      ...update,
      updated: new Date().toISOString(),
    } as CalendarEvent;

    this.events.set(eventId, updatedEvent);
    return updatedEvent;
  }

  async deleteEvent(eventId: string): Promise<void> {
    logger.debug('Mock Calendar: deleteEvent', { eventId });
    await this.simulateDelay(100);

    if (!this.events.has(eventId)) {
      throw new Error(`Event not found: ${eventId}`);
    }

    this.events.delete(eventId);
  }

  async getFreeBusy(query: FreeBusyQuery): Promise<FreeBusyResult> {
    logger.debug('Mock Calendar: getFreeBusy', { query });
    await this.simulateDelay();

    const minTime = new Date(query.timeMin);
    const maxTime = new Date(query.timeMax);

    const events = Array.from(this.events.values()).filter(e => {
      const eventStart = new Date(e.start.dateTime || e.start.date || '');
      const eventEnd = new Date(e.end.dateTime || e.end.date || '');
      return eventStart >= minTime && eventEnd <= maxTime;
    });

    const busy = events.map(e => ({
      start: e.start.dateTime || e.start.date || '',
      end: e.end.dateTime || e.end.date || '',
    }));

    const calendars: Record<string, { busy: typeof busy }> = {};
    for (const item of query.items) {
      calendars[item.id] = { busy };
    }

    return { calendars };
  }

  private simulateDelay(ms: number = 100): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory
// ============================================================================

export async function createCalendarClientForUser(userId: string): Promise<ICalendarClientExtended | null> {
  if (!googleOAuthClient.isConfigured()) {
    logger.debug('Google OAuth not configured, using mock');
    return null;
  }

  const auth = await googleOAuthClient.getClientForUser(userId, 'GOOGLE_CALENDAR');
  if (!auth) {
    logger.debug('No Calendar auth for user', { userId });
    return null;
  }

  return new RealCalendarClient(auth, userId);
}

export function createCalendarClient(_accessToken?: string): ICalendarClient {
  if (config.isDevelopment && !config.google.clientId) {
    return new MockCalendarClient();
  }

  return new MockCalendarClient();
}

export const calendarClient = createCalendarClient();
export default calendarClient;
