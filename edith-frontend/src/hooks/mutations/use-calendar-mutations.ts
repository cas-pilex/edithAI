import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { calendarApi } from '@/lib/api/calendar';
import type { CreateEventPayload, UpdateEventPayload } from '@/lib/api/calendar';

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateEventPayload) => calendarApi.createEvent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      toast.success('Event created');
    },
    onError: () => toast.error('Failed to create event'),
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateEventPayload & { id: string }) => calendarApi.updateEvent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      toast.success('Event updated');
    },
    onError: () => toast.error('Failed to update event'),
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => calendarApi.deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      toast.success('Event deleted');
    },
    onError: () => toast.error('Failed to delete event'),
  });
}

export function useRsvp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => calendarApi.rsvp(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      toast.success('RSVP updated');
    },
  });
}

export function useGenerateEventPrep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => calendarApi.generateEventPrep(eventId),
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'prep', eventId] });
      toast.success('Meeting prep generated');
    },
    onError: () => toast.error('Failed to generate meeting prep'),
  });
}

export function useSaveEventPrepNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, notes }: { eventId: string; notes: string }) => calendarApi.saveEventPrepNotes(eventId, notes),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'prep', eventId] });
      toast.success('Notes saved');
    },
    onError: () => toast.error('Failed to save notes'),
  });
}
