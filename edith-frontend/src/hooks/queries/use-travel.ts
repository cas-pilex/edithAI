import { useQuery } from '@tanstack/react-query';
import { travelApi, type TripFilters } from '@/lib/api/travel';

export function useTrips(filters?: TripFilters) {
  return useQuery({
    queryKey: ['trips', filters],
    queryFn: () => travelApi.getTrips(filters),
  });
}

export function useTrip(id: string) {
  return useQuery({
    queryKey: ['trips', id],
    queryFn: () => travelApi.getTrip(id),
    enabled: !!id,
  });
}

export function useUpcomingTrips() {
  return useQuery({
    queryKey: ['trips', 'upcoming'],
    queryFn: () => travelApi.getUpcoming(),
  });
}

export function useTripBookings(tripId: string) {
  return useQuery({
    queryKey: ['trips', tripId, 'bookings'],
    queryFn: () => travelApi.getBookings(tripId),
    enabled: !!tripId,
  });
}

export function useTravelStats() {
  return useQuery({
    queryKey: ['travel', 'stats'],
    queryFn: () => travelApi.getStats(),
  });
}
