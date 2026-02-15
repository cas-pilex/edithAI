import { api } from './client';
import type { ApiResponse, PaginatedResponse, PaginationParams } from './types';
import type { CalendarEvent } from '@/types';

export interface CalendarFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
  search?: string;
}

export interface CreateEventPayload {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  meetingUrl?: string;
  isAllDay?: boolean;
  attendees?: { email: string; name?: string }[];
  recurrenceRule?: string;
}

export interface UpdateEventPayload extends Partial<CreateEventPayload> {}

export interface MeetingPrep {
  id: string;
  eventId: string;
  researchNotes?: string;
  attendeeProfiles?: unknown;
  suggestedTalkingPoints: string[];
  relevantEmails: string[];
  userNotes?: string;
  generatedAt?: string;
}

export interface MeetingBriefData {
  event: {
    id: string;
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
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
    };
  }>;
  emailHistory?: Array<{
    id: string;
    subject: string;
    from: string;
    date: string;
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
    dueDate?: string;
  }>;
  aiSummary?: string;
}

export const calendarApi = {
  getEvents: async (filters?: CalendarFilters, pagination?: PaginationParams) => {
    const { data } = await api.get<PaginatedResponse<CalendarEvent>>('/api/calendar/events', {
      params: { ...filters, ...pagination },
    });
    return data;
  },

  getEvent: async (id: string) => {
    const { data } = await api.get<ApiResponse<CalendarEvent>>(`/api/calendar/events/${id}`);
    return data;
  },

  createEvent: async (payload: CreateEventPayload) => {
    const { data } = await api.post<ApiResponse<CalendarEvent>>('/api/calendar/events', payload);
    return data;
  },

  updateEvent: async ({ id, ...payload }: UpdateEventPayload & { id: string }) => {
    const { data } = await api.patch<ApiResponse<CalendarEvent>>(`/api/calendar/events/${id}`, payload);
    return data;
  },

  deleteEvent: async (id: string) => {
    const { data } = await api.delete<ApiResponse<null>>(`/api/calendar/events/${id}`);
    return data;
  },

  getToday: async () => {
    const { data } = await api.get<ApiResponse<CalendarEvent[]>>('/api/calendar/today');
    return data;
  },

  getStats: async () => {
    const { data } = await api.get<ApiResponse<Record<string, number>>>('/api/calendar/stats');
    return data;
  },

  getAvailability: async (date: string) => {
    const { data } = await api.get<ApiResponse<{ slots: string[] }>>('/api/calendar/availability', { params: { date } });
    return data;
  },

  rsvp: async (id: string, status: string) => {
    const { data } = await api.post<ApiResponse<CalendarEvent>>(`/api/calendar/events/${id}/rsvp`, { status });
    return data;
  },

  getEventPrep: async (eventId: string) => {
    const { data } = await api.get<ApiResponse<MeetingPrep | null>>(`/api/calendar/events/${eventId}/prep`);
    return data;
  },

  generateEventPrep: async (eventId: string) => {
    const { data } = await api.post<ApiResponse<MeetingBriefData>>(`/api/calendar/events/${eventId}/prep/generate`);
    return data;
  },

  saveEventPrepNotes: async (eventId: string, notes: string) => {
    const { data } = await api.patch<ApiResponse<MeetingPrep>>(`/api/calendar/events/${eventId}/prep/notes`, { notes });
    return data;
  },

  sync: async () => {
    const { data } = await api.post<ApiResponse<null>>('/api/calendar/sync');
    return data;
  },
};
