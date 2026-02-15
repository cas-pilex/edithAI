import { api } from './client';
import type { ApiResponse, PaginatedResponse, PaginationParams } from './types';
import type { Email } from '@/types';

export interface EmailFilters {
  category?: string;
  priority?: string;
  isRead?: boolean;
  isStarred?: boolean;
  search?: string;
  label?: string;
}

export interface ReplyPayload {
  body: string;
  tone?: string;
}

export interface DailyBriefing {
  summary: string;
  urgentItems: Array<{ emailId: string; subject: string; reason: string }>;
  questionsToAnswer: Array<{ emailId: string; from: string; subject: string; question: string }>;
  fyiItems: Array<{ emailId: string; subject: string; oneLiner: string }>;
  extractedTasks: Array<{ title: string; emailId: string; dueDate?: string; priority: string }>;
  totalUnread: number;
}

export const inboxApi = {
  getEmails: async (filters?: EmailFilters, pagination?: PaginationParams) => {
    const { data } = await api.get<PaginatedResponse<Email>>('/api/inbox', {
      params: { ...filters, ...pagination },
    });
    return data;
  },

  getEmail: async (id: string) => {
    const { data } = await api.get<ApiResponse<Email>>(`/api/inbox/${id}`);
    return data;
  },

  getThread: async (threadId: string) => {
    const { data } = await api.get<ApiResponse<Email[]>>(`/api/inbox/thread/${threadId}`);
    return data;
  },

  getStats: async () => {
    const { data } = await api.get<ApiResponse<Record<string, number>>>('/api/inbox/stats');
    return data;
  },

  markAsRead: async (id: string) => {
    const { data } = await api.post<ApiResponse<null>>('/api/inbox/bulk', { emailIds: [id], action: 'markRead' });
    return data;
  },

  markAsUnread: async (id: string) => {
    const { data } = await api.post<ApiResponse<null>>('/api/inbox/bulk', { emailIds: [id], action: 'markUnread' });
    return data;
  },

  toggleStar: async (id: string) => {
    const { data } = await api.post<ApiResponse<Email>>(`/api/inbox/${id}/star`);
    return data;
  },

  archive: async (id: string) => {
    const { data } = await api.post<ApiResponse<Email>>(`/api/inbox/${id}/archive`);
    return data;
  },

  deleteEmail: async (id: string) => {
    const { data } = await api.delete<ApiResponse<null>>(`/api/inbox/${id}`);
    return data;
  },

  draftReply: async (id: string, payload: ReplyPayload) => {
    const { data } = await api.post<ApiResponse<{ draft: string }>>(`/api/inbox/${id}/draft-reply`, payload);
    return data;
  },

  bulkAction: async (ids: string[], action: string) => {
    const { data } = await api.post<ApiResponse<null>>('/api/inbox/bulk', { emailIds: ids, action });
    return data;
  },

  getBriefing: async () => {
    const { data } = await api.get<ApiResponse<DailyBriefing>>('/api/inbox/briefing');
    return data;
  },

  sync: async () => {
    const { data } = await api.post<ApiResponse<null>>('/api/inbox/sync');
    return data;
  },
};
