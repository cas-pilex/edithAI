import { useQuery } from '@tanstack/react-query';
import { crmApi, type ContactFilters } from '@/lib/api/crm';

export function useContacts(filters?: ContactFilters) {
  return useQuery({
    queryKey: ['contacts', filters],
    queryFn: () => crmApi.getContacts(filters),
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: ['contacts', id],
    queryFn: () => crmApi.getContact(id),
    enabled: !!id,
  });
}

export function useInteractions(contactId: string) {
  return useQuery({
    queryKey: ['contacts', contactId, 'interactions'],
    queryFn: () => crmApi.getInteractions(contactId),
    enabled: !!contactId,
  });
}

export function useFollowUps() {
  return useQuery({
    queryKey: ['crm', 'follow-ups'],
    queryFn: () => crmApi.getFollowUps(),
  });
}

export function useNeedingAttention() {
  return useQuery({
    queryKey: ['crm', 'attention'],
    queryFn: () => crmApi.getNeedingAttention(),
  });
}
