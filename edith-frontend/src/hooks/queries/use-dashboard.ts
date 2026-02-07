import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api/dashboard';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.getDashboard(),
  });
}

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: () => dashboardApi.getMetrics(),
  });
}

export function useDashboardActivity() {
  return useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => dashboardApi.getActivity(),
  });
}

export function useUpcomingEvents() {
  return useQuery({
    queryKey: ['dashboard', 'upcoming'],
    queryFn: () => dashboardApi.getUpcoming(),
  });
}

export function useProductivity() {
  return useQuery({
    queryKey: ['dashboard', 'productivity'],
    queryFn: () => dashboardApi.getProductivity(),
  });
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => dashboardApi.getPendingApprovals(),
  });
}
