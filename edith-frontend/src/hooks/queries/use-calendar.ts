import { useQuery } from '@tanstack/react-query';
import { calendarApi, type CalendarFilters } from '@/lib/api/calendar';

export function useCalendarEvents(filters?: CalendarFilters) {
  return useQuery({
    queryKey: ['calendar', filters],
    queryFn: () => calendarApi.getEvents(filters),
  });
}

export function useCalendarEvent(id: string) {
  return useQuery({
    queryKey: ['calendar', id],
    queryFn: () => calendarApi.getEvent(id),
    enabled: !!id,
  });
}

export function useTodayEvents() {
  return useQuery({
    queryKey: ['calendar', 'today'],
    queryFn: () => calendarApi.getToday(),
  });
}

export function useCalendarStats() {
  return useQuery({
    queryKey: ['calendar', 'stats'],
    queryFn: () => calendarApi.getStats(),
  });
}

export function useAvailability(date: string) {
  return useQuery({
    queryKey: ['calendar', 'availability', date],
    queryFn: () => calendarApi.getAvailability(date),
    enabled: !!date,
  });
}
