import { api } from './client';
import type { ApiResponse } from './types';
import type { DashboardData, ActivityItem, CalendarEvent, Approval, ProductivityData } from '@/types';

export const dashboardApi = {
  getDashboard: async () => {
    const { data } = await api.get<ApiResponse<DashboardData>>('/api/dashboard');
    return data;
  },

  getMetrics: async () => {
    const { data } = await api.get<ApiResponse<DashboardData['stats']>>('/api/dashboard/metrics');
    return data;
  },

  getActivity: async (limit = 10) => {
    const { data } = await api.get<ApiResponse<ActivityItem[]>>('/api/dashboard/activity', { params: { limit } });
    return data;
  },

  getUpcoming: async (limit = 5) => {
    const { data } = await api.get<ApiResponse<CalendarEvent[]>>('/api/dashboard/upcoming', { params: { limit } });
    return data;
  },

  getInsights: async () => {
    const { data } = await api.get<ApiResponse<string[]>>('/api/dashboard/insights');
    return data;
  },

  getProductivity: async (days = 7) => {
    const { data } = await api.get<ApiResponse<ProductivityData[]>>('/api/dashboard/productivity', { params: { days } });
    return data;
  },

  getTrends: async () => {
    const { data } = await api.get<ApiResponse<ProductivityData[]>>('/api/dashboard/trends');
    return data;
  },

  getPendingApprovals: async () => {
    const { data } = await api.get<ApiResponse<Approval[]>>('/api/approvals/pending');
    return data;
  },
};
