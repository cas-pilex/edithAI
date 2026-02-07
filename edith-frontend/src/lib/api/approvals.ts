import { api } from './client';
import type { ApiResponse, PaginatedResponse } from './types';
import type { Approval } from '@/types';

export const approvalsApi = {
  getPending: async () => {
    const { data } = await api.get<PaginatedResponse<Approval>>('/api/approvals/pending');
    return data;
  },

  getHistory: async () => {
    const { data } = await api.get<PaginatedResponse<Approval>>('/api/approvals/history');
    return data;
  },

  approve: async (id: string) => {
    const { data } = await api.post<ApiResponse<Approval>>(`/api/approvals/${id}/approve`);
    return data;
  },

  reject: async (id: string, reason?: string) => {
    const { data } = await api.post<ApiResponse<Approval>>(`/api/approvals/${id}/reject`, { reason });
    return data;
  },

  modify: async (id: string, modifiedData: Record<string, unknown>) => {
    const { data } = await api.post<ApiResponse<Approval>>(`/api/approvals/${id}/modify`, { modifiedData });
    return data;
  },

  bulkAction: async (ids: string[], action: 'approve' | 'reject') => {
    const { data } = await api.post<ApiResponse<null>>('/api/approvals/bulk', { ids, action });
    return data;
  },
};
