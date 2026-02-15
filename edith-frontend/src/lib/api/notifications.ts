import { api } from './client';
import type { ApiResponse, PaginatedResponse } from './types';

export interface NotificationPreference {
  type: string;
  channel: string;
  enabled: boolean;
}

export interface NotificationHistoryItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  channel: string;
  priority: string;
  status: string;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export const notificationsApi = {
  getPreferences: async () => {
    const { data } = await api.get<ApiResponse<NotificationPreference[]>>('/api/notifications/preferences');
    return data;
  },

  updatePreferences: async (preferences: NotificationPreference[]) => {
    const { data } = await api.put<ApiResponse<NotificationPreference[]>>('/api/notifications/preferences', { preferences });
    return data;
  },

  getHistory: async (params?: { page?: number; limit?: number; type?: string }) => {
    const { data } = await api.get<PaginatedResponse<NotificationHistoryItem>>('/api/notifications/history', { params });
    return data;
  },
};
