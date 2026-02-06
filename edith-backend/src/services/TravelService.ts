/**
 * TravelService
 * Business logic for travel and booking management
 */

import { prisma } from '../database/client.js';

// TripStatus: PLANNING, BOOKED, IN_PROGRESS, COMPLETED, CANCELLED
// BookingType: FLIGHT, HOTEL, RESTAURANT, CAR, TRAIN, OTHER
// BookingStatus: PENDING, CONFIRMED, CANCELLED, COMPLETED

export interface TripFilters {
  status?: string;
  destination?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface CreateTripInput {
  name: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  purpose?: string;
  notes?: string;
  totalBudget?: number;
  currency?: string;
}

export interface CreateBookingInput {
  tripId: string;
  type: 'FLIGHT' | 'HOTEL' | 'RESTAURANT' | 'CAR' | 'TRAIN' | 'OTHER';
  provider?: string;
  confirmationNumber?: string;
  details?: Record<string, unknown>;
  startDateTime: Date;
  endDateTime: Date;
  price?: number;
  currency?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
}

class TravelServiceImpl {
  /**
   * Get trips with filters
   */
  async getTrips(
    userId: string,
    filters: TripFilters = {},
    pagination: { limit?: number; offset?: number } = {}
  ): Promise<{ trips: unknown[]; total: number }> {
    const { limit = 50, offset = 0 } = pagination;

    const where: Record<string, unknown> = { userId };

    if (filters.status) where.status = filters.status;
    if (filters.destination) where.destination = { contains: filters.destination, mode: 'insensitive' };
    if (filters.startDate) where.startDate = { gte: filters.startDate };
    if (filters.endDate) where.endDate = { lte: filters.endDate };

    const [trips, total] = await Promise.all([
      prisma.trip.findMany({
        where,
        include: { bookings: true },
        orderBy: { startDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.trip.count({ where }),
    ]);

    return { trips, total };
  }

  /**
   * Get trip by ID
   */
  async getTripById(id: string, userId: string) {
    return prisma.trip.findFirst({
      where: { id, userId },
      include: {
        bookings: {
          orderBy: { startDateTime: 'asc' },
        },
      },
    });
  }

  /**
   * Create trip
   */
  async createTrip(userId: string, data: CreateTripInput) {
    return prisma.trip.create({
      data: {
        userId,
        name: data.name,
        destination: data.destination,
        startDate: data.startDate,
        endDate: data.endDate,
        purpose: data.purpose,
        notes: data.notes,
        totalBudget: data.totalBudget,
        currency: data.currency || 'EUR',
        status: 'PLANNING',
      },
    });
  }

  /**
   * Update trip
   */
  async updateTrip(id: string, userId: string, data: Partial<CreateTripInput> & { status?: 'PLANNING' | 'BOOKED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' }) {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.destination !== undefined) updateData.destination = data.destination;
    if (data.startDate !== undefined) updateData.startDate = data.startDate;
    if (data.endDate !== undefined) updateData.endDate = data.endDate;
    if (data.purpose !== undefined) updateData.purpose = data.purpose;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.totalBudget !== undefined) updateData.totalBudget = data.totalBudget;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.status !== undefined) updateData.status = data.status;

    return prisma.trip.updateMany({
      where: { id, userId },
      data: updateData,
    });
  }

  /**
   * Delete trip
   */
  async deleteTrip(id: string, userId: string) {
    const trip = await prisma.trip.findFirst({
      where: { id, userId },
    });

    if (!trip) {
      throw new Error('Trip not found');
    }

    await prisma.trip.delete({ where: { id } });
    return true;
  }

  /**
   * Add booking to trip
   */
  async addBooking(userId: string, data: CreateBookingInput) {
    // Verify trip ownership
    const trip = await prisma.trip.findFirst({
      where: { id: data.tripId, userId },
    });

    if (!trip) {
      throw new Error('Trip not found');
    }

    const booking = await prisma.booking.create({
      data: {
        tripId: data.tripId,
        type: data.type,
        provider: data.provider,
        confirmationNumber: data.confirmationNumber,
        details: data.details as object || {},
        startDateTime: data.startDateTime,
        endDateTime: data.endDateTime,
        price: data.price,
        currency: data.currency || 'EUR',
        status: data.status || 'CONFIRMED',
      },
    });

    // Update trip total spent
    await this.updateTripSpent(data.tripId);

    return booking;
  }

  /**
   * Update booking
   */
  async updateBooking(
    bookingId: string,
    userId: string,
    data: Partial<Omit<CreateBookingInput, 'tripId'>>
  ) {
    // Verify ownership through trip
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId },
      include: { trip: true },
    });

    if (!booking || booking.trip.userId !== userId) {
      throw new Error('Booking not found');
    }

    const updateData: Record<string, unknown> = {};
    if (data.type !== undefined) updateData.type = data.type;
    if (data.provider !== undefined) updateData.provider = data.provider;
    if (data.confirmationNumber !== undefined) updateData.confirmationNumber = data.confirmationNumber;
    if (data.details !== undefined) updateData.details = data.details as object;
    if (data.startDateTime !== undefined) updateData.startDateTime = data.startDateTime;
    if (data.endDateTime !== undefined) updateData.endDateTime = data.endDateTime;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.status !== undefined) updateData.status = data.status;

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: updateData,
    });

    // Update trip total spent if price changed
    if (data.price !== undefined) {
      await this.updateTripSpent(booking.tripId);
    }

    return updated;
  }

  /**
   * Cancel booking
   */
  async cancelBooking(bookingId: string, userId: string) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId },
      include: { trip: true },
    });

    if (!booking || booking.trip.userId !== userId) {
      throw new Error('Booking not found');
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
    });

    await this.updateTripSpent(booking.tripId);

    return updated;
  }

  /**
   * Get upcoming trips
   */
  async getUpcomingTrips(userId: string, days: number = 30) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    return prisma.trip.findMany({
      where: {
        userId,
        startDate: {
          gte: new Date(),
          lte: endDate,
        },
        status: { not: 'CANCELLED' },
      },
      include: {
        bookings: {
          where: { status: { not: 'CANCELLED' } },
        },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  /**
   * Get trip itinerary
   */
  async getItinerary(tripId: string, userId: string) {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
      include: {
        bookings: {
          where: { status: { not: 'CANCELLED' } },
          orderBy: { startDateTime: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new Error('Trip not found');
    }

    // Group bookings by day
    const itinerary: Record<string, unknown[]> = {};

    for (const booking of trip.bookings) {
      const day = booking.startDateTime.toISOString().split('T')[0];
      if (!itinerary[day]) {
        itinerary[day] = [];
      }
      itinerary[day].push(booking);
    }

    return {
      trip: {
        id: trip.id,
        name: trip.name,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        purpose: trip.purpose,
        totalSpent: trip.totalSpent,
        totalBudget: trip.totalBudget,
      },
      itinerary,
    };
  }

  /**
   * Get travel stats
   */
  async getStats(userId: string, year?: number) {
    const startDate = new Date(year || new Date().getFullYear(), 0, 1);
    const endDate = new Date(year || new Date().getFullYear(), 11, 31);

    const trips = await prisma.trip.findMany({
      where: {
        userId,
        startDate: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' },
      },
      include: {
        bookings: {
          where: { status: { not: 'CANCELLED' } },
        },
      },
    });

    const totalTrips = trips.length;
    const totalSpend = trips.reduce((sum, t) => sum + (t.totalSpent || 0), 0);

    const byPurpose = trips.reduce((acc, t) => {
      const purpose = t.purpose || 'OTHER';
      acc[purpose] = (acc[purpose] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const destinations = [...new Set(trips.map(t => t.destination))];

    const bookingsByType = trips.flatMap(t => t.bookings).reduce((acc, b) => {
      acc[b.type] = (acc[b.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalDays = trips.reduce((sum, t) => {
      const days = Math.ceil(
        (new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / (24 * 60 * 60 * 1000)
      );
      return sum + days;
    }, 0);

    return {
      totalTrips,
      totalSpend,
      averageSpendPerTrip: totalTrips > 0 ? totalSpend / totalTrips : 0,
      byPurpose,
      uniqueDestinations: destinations.length,
      destinations,
      bookingsByType,
      totalTravelDays: totalDays,
    };
  }

  /**
   * Update trip total spent
   */
  private async updateTripSpent(tripId: string) {
    const bookings = await prisma.booking.findMany({
      where: {
        tripId,
        status: { not: 'CANCELLED' },
      },
    });

    const totalSpent = bookings.reduce((sum, b) => sum + (b.price || 0), 0);

    await prisma.trip.update({
      where: { id: tripId },
      data: { totalSpent },
    });
  }
}

export const travelService = new TravelServiceImpl();
export default travelService;
