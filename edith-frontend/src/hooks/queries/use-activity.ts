import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { activityApi } from '@/lib/api/activity';
import type { ActivityLogFilters } from '@/lib/api/activity';

export function useActivityLog(filters: ActivityLogFilters = {}, pagination: { page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ['activity', 'log', filters, pagination],
    queryFn: () => activityApi.getLog(filters, pagination),
    placeholderData: keepPreviousData,
  });
}

export function useActivityStats(dateRange?: { startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: ['activity', 'stats', dateRange],
    queryFn: () => activityApi.getStats(dateRange),
  });
}
