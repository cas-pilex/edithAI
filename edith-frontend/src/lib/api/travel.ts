import { api } from './client';
import type { ApiResponse, PaginatedResponse, PaginationParams } from './types';
import type { Trip, Booking } from '@/types';

export interface TripFilters {
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateTripPayload {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  purpose?: string;
  totalBudget?: number;
  currency?: string;
  notes?: string;
}

export interface UpdateTripPayload extends Partial<CreateTripPayload> {}

export interface FlightSearchParams {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  passengers?: number;
  cabinClass?: string;
}

export interface HotelSearchParams {
  destination: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
  stars?: number;
}

export const travelApi = {
  getTrips: async (filters?: TripFilters, pagination?: PaginationParams) => {
    const { data } = await api.get<PaginatedResponse<Trip>>('/api/travel/trips', {
      params: { ...filters, ...pagination },
    });
    return data;
  },

  getTrip: async (id: string) => {
    const { data } = await api.get<ApiResponse<Trip>>(`/api/travel/trips/${id}`);
    return data;
  },

  createTrip: async (payload: CreateTripPayload) => {
    const { data } = await api.post<ApiResponse<Trip>>('/api/travel/trips', payload);
    return data;
  },

  updateTrip: async ({ id, ...payload }: UpdateTripPayload & { id: string }) => {
    const { data } = await api.patch<ApiResponse<Trip>>(`/api/travel/trips/${id}`, payload);
    return data;
  },

  deleteTrip: async (id: string) => {
    const { data } = await api.delete<ApiResponse<null>>(`/api/travel/trips/${id}`);
    return data;
  },

  getBookings: async (tripId: string) => {
    const { data } = await api.get<ApiResponse<Booking[]>>(`/api/travel/trips/${tripId}/bookings`);
    return data;
  },

  getUpcoming: async () => {
    const { data } = await api.get<ApiResponse<Trip[]>>('/api/travel/upcoming');
    return data;
  },

  searchFlights: async (params: FlightSearchParams) => {
    const { data } = await api.get<ApiResponse<Booking[]>>('/api/travel/search/flights', { params });
    return data;
  },

  searchHotels: async (params: HotelSearchParams) => {
    const { data } = await api.get<ApiResponse<Booking[]>>('/api/travel/search/hotels', { params });
    return data;
  },

  getStats: async () => {
    const { data } = await api.get<ApiResponse<Record<string, number>>>('/api/travel/stats');
    return data;
  },
};
