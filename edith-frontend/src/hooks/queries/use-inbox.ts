import { useQuery } from '@tanstack/react-query';
import { inboxApi, type EmailFilters } from '@/lib/api/inbox';

export function useEmails(filters?: EmailFilters) {
  return useQuery({
    queryKey: ['emails', filters],
    queryFn: () => inboxApi.getEmails(filters),
  });
}

export function useEmail(id: string) {
  return useQuery({
    queryKey: ['emails', id],
    queryFn: () => inboxApi.getEmail(id),
    enabled: !!id,
  });
}

export function useEmailThread(threadId: string) {
  return useQuery({
    queryKey: ['emails', 'thread', threadId],
    queryFn: () => inboxApi.getThread(threadId),
    enabled: !!threadId,
  });
}

export function useEmailStats() {
  return useQuery({
    queryKey: ['emails', 'stats'],
    queryFn: () => inboxApi.getStats(),
  });
}

export function useBriefing() {
  return useQuery({
    queryKey: ['emails', 'briefing'],
    queryFn: () => inboxApi.getBriefing(),
    staleTime: 5 * 60 * 1000, // Cache for 5 min
    retry: 1,
  });
}

