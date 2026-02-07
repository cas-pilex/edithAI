import { useQuery } from '@tanstack/react-query';
import { tasksApi, type TaskFilters } from '@/lib/api/tasks';

export function useTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => tasksApi.getTasks(filters),
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: () => tasksApi.getTask(id),
    enabled: !!id,
  });
}

export function useTaskStats() {
  return useQuery({
    queryKey: ['tasks', 'stats'],
    queryFn: () => tasksApi.getStats(),
  });
}

export function useOverdueTasks() {
  return useQuery({
    queryKey: ['tasks', 'overdue'],
    queryFn: () => tasksApi.getOverdue(),
  });
}

export function useTodayTasks() {
  return useQuery({
    queryKey: ['tasks', 'today'],
    queryFn: () => tasksApi.getToday(),
  });
}

export function useTaskTags() {
  return useQuery({
    queryKey: ['tasks', 'tags'],
    queryFn: () => tasksApi.getTags(),
  });
}
