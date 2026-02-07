import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { travelApi } from '@/lib/api/travel';
import type { CreateTripPayload, UpdateTripPayload } from '@/lib/api/travel';

export function useCreateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateTripPayload) => travelApi.createTrip(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      toast.success('Trip created');
    },
    onError: () => toast.error('Failed to create trip'),
  });
}

export function useUpdateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateTripPayload & { id: string }) => travelApi.updateTrip(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      toast.success('Trip updated');
    },
    onError: () => toast.error('Failed to update trip'),
  });
}

export function useDeleteTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => travelApi.deleteTrip(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      toast.success('Trip deleted');
    },
    onError: () => toast.error('Failed to delete trip'),
  });
}
