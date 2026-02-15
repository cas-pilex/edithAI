import { api } from './client';

// ============================================================================
// Types
// ============================================================================

export interface ActivityLogEntry {
  id: string;
  agentType: string;
  action: string;
  input: unknown;
  output: unknown;
  status: 'SUCCESS' | 'FAILURE' | 'PENDING';
  duration: number | null;
  executedAt: string;
}

export interface ActivityLogFilters {
  agentType?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface ActivityStats {
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  averageDuration: number;
  actionsByAgent: Record<string, number>;
  actionsByType: Record<string, number>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// API Methods
// ============================================================================

export const activityApi = {
  getLog: async (filters: ActivityLogFilters = {}, pagination: { page?: number; limit?: number } = {}) => {
    const { data } = await api.get<PaginatedResponse<ActivityLogEntry>>('/api/activity/log', {
      params: {
        ...filters,
        page: pagination.page || 1,
        limit: pagination.limit || 20,
      },
    });
    return data;
  },

  getStats: async (dateRange?: { startDate?: string; endDate?: string }) => {
    const { data } = await api.get<{ data: ActivityStats }>('/api/activity/stats', {
      params: dateRange,
    });
    return data;
  },
};
