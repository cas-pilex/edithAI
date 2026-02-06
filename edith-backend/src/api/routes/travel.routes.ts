/**
 * Travel API Routes
 * Trip and booking management
 */

import { Router } from 'express';
import type { Router as RouterType, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody, validateUUID } from '../middleware/validation.middleware.js';
import { travelService } from '../../services/TravelService.js';
import { sendSuccess, sendPaginated, sendError } from '../../utils/helpers.js';
import { NotFoundError } from '../../utils/errors.js';
import {
  createTripSchema,
  updateTripSchema,
  createBookingSchema,
} from '../../utils/validation.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const router: RouterType = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * GET /travel/trips
 * List trips with filters and pagination
 */
router.get(
  '/trips',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { page, limit, status, destination, startDate, endDate } = req.query;

      const pageNum = Number(page) || 1;
      const limitNum = Math.min(Number(limit) || 20, 100);
      const offset = (pageNum - 1) * limitNum;

      // Parse filters
      const parsedFilters = {
        status: status as string | undefined,
        destination: destination as string | undefined,
        startDate: startDate ? new Date(String(startDate)) : undefined,
        endDate: endDate ? new Date(String(endDate)) : undefined,
      };

      const { trips, total } = await travelService.getTrips(
        userId,
        parsedFilters,
        { limit: limitNum, offset }
      );

      sendPaginated(res, trips, pageNum, limitNum, total);
    } catch (error) {
      logger.error('Failed to get trips', { error });
      sendError(res, 'Failed to retrieve trips', 500);
    }
  }
);

/**
 * GET /travel/upcoming
 * Get upcoming trips
 */
router.get('/upcoming', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const days = Number(req.query.days) || 30;

    const trips = await travelService.getUpcomingTrips(userId, days);
    sendSuccess(res, trips);
  } catch (error) {
    logger.error('Failed to get upcoming trips', { error });
    sendError(res, 'Failed to retrieve upcoming trips', 500);
  }
});

/**
 * GET /travel/stats
 * Get travel statistics
 */
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const year = req.query.year ? Number(req.query.year) : undefined;

    const stats = await travelService.getStats(userId, year);
    sendSuccess(res, stats);
  } catch (error) {
    logger.error('Failed to get travel stats', { error });
    sendError(res, 'Failed to retrieve travel statistics', 500);
  }
});

/**
 * GET /travel/search/flights
 * Search for flights
 */
router.get(
  '/search/flights',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { origin, destination, departureDate, returnDate, passengers, cabinClass } = req.query;

      // TODO: Integrate with Amadeus API for real flight search
      // For now, return mock data
      sendSuccess(res, {
        flights: [],
        searchParams: {
          origin: origin as string,
          destination: destination as string,
          departureDate: departureDate as string,
          returnDate: returnDate as string | undefined,
          passengers: passengers ? Number(passengers) : 1,
          cabinClass: (cabinClass as string) || 'economy',
        },
        message: 'Flight search requires Amadeus API integration',
      });
    } catch (error) {
      logger.error('Failed to search flights', { error });
      sendError(res, 'Failed to search flights', 500);
    }
  }
);

/**
 * GET /travel/search/hotels
 * Search for hotels
 */
router.get(
  '/search/hotels',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { destination, checkIn, checkOut, guests, rooms, stars } = req.query;

      // TODO: Integrate with hotel search API
      // For now, return mock data
      sendSuccess(res, {
        hotels: [],
        searchParams: {
          destination: destination as string,
          checkIn: checkIn as string,
          checkOut: checkOut as string,
          guests: guests ? Number(guests) : 1,
          rooms: rooms ? Number(rooms) : 1,
          stars: stars ? Number(stars) : undefined,
        },
        message: 'Hotel search requires API integration',
      });
    } catch (error) {
      logger.error('Failed to search hotels', { error });
      sendError(res, 'Failed to search hotels', 500);
    }
  }
);

/**
 * GET /travel/trips/:id
 * Get a single trip by ID
 */
router.get(
  '/trips/:id',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      const trip = await travelService.getTripById(id, userId);

      if (!trip) {
        throw new NotFoundError('Trip');
      }

      sendSuccess(res, trip);
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to get trip', { error, tripId: req.params.id });
      sendError(res, 'Failed to retrieve trip', 500);
    }
  }
);

/**
 * GET /travel/trips/:id/itinerary
 * Get trip itinerary
 */
router.get(
  '/trips/:id/itinerary',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      const itinerary = await travelService.getItinerary(id, userId);
      sendSuccess(res, itinerary);
    } catch (error) {
      if (error instanceof Error && error.message === 'Trip not found') {
        sendError(res, 'Trip not found', 404);
        return;
      }
      logger.error('Failed to get itinerary', { error, tripId: req.params.id });
      sendError(res, 'Failed to retrieve itinerary', 500);
    }
  }
);

/**
 * POST /travel/trips
 * Create a new trip
 */
router.post(
  '/trips',
  validateBody(createTripSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const data = req.body;

      const trip = await travelService.createTrip(userId, {
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      });

      sendSuccess(res, trip, 'Trip created successfully', 201);
    } catch (error) {
      logger.error('Failed to create trip', { error });
      sendError(res, 'Failed to create trip', 500);
    }
  }
);

/**
 * PATCH /travel/trips/:id
 * Update a trip
 */
router.patch(
  '/trips/:id',
  validateUUID('id'),
  validateBody(updateTripSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const data = req.body;

      // Check if trip exists
      const existing = await travelService.getTripById(id, userId);
      if (!existing) {
        throw new NotFoundError('Trip');
      }

      await travelService.updateTrip(id, userId, {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      });

      const updated = await travelService.getTripById(id, userId);
      sendSuccess(res, updated, 'Trip updated successfully');
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to update trip', { error, tripId: req.params.id });
      sendError(res, 'Failed to update trip', 500);
    }
  }
);

/**
 * DELETE /travel/trips/:id
 * Delete a trip
 */
router.delete(
  '/trips/:id',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      await travelService.deleteTrip(id, userId);
      sendSuccess(res, { deleted: true }, 'Trip deleted successfully');
    } catch (error) {
      if (error instanceof Error && error.message === 'Trip not found') {
        sendError(res, 'Trip not found', 404);
        return;
      }
      logger.error('Failed to delete trip', { error, tripId: req.params.id });
      sendError(res, 'Failed to delete trip', 500);
    }
  }
);

/**
 * POST /travel/bookings
 * Create a booking for a trip
 */
router.post(
  '/bookings',
  validateBody(createBookingSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const data = req.body;

      const booking = await travelService.addBooking(userId, {
        ...data,
        startDateTime: new Date(data.startDateTime),
        endDateTime: new Date(data.endDateTime),
      });

      sendSuccess(res, booking, 'Booking created successfully', 201);
    } catch (error) {
      if (error instanceof Error && error.message === 'Trip not found') {
        sendError(res, 'Trip not found', 404);
        return;
      }
      logger.error('Failed to create booking', { error });
      sendError(res, 'Failed to create booking', 500);
    }
  }
);

/**
 * PATCH /travel/bookings/:id
 * Update a booking
 */
router.patch(
  '/bookings/:id',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const data = req.body;

      const booking = await travelService.updateBooking(id, userId, {
        ...data,
        startDateTime: data.startDateTime ? new Date(data.startDateTime) : undefined,
        endDateTime: data.endDateTime ? new Date(data.endDateTime) : undefined,
      });

      sendSuccess(res, booking, 'Booking updated successfully');
    } catch (error) {
      if (error instanceof Error && error.message === 'Booking not found') {
        sendError(res, 'Booking not found', 404);
        return;
      }
      logger.error('Failed to update booking', { error, bookingId: req.params.id });
      sendError(res, 'Failed to update booking', 500);
    }
  }
);

/**
 * DELETE /travel/bookings/:id
 * Cancel a booking
 */
router.delete(
  '/bookings/:id',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      await travelService.cancelBooking(id, userId);
      sendSuccess(res, { cancelled: true }, 'Booking cancelled successfully');
    } catch (error) {
      if (error instanceof Error && error.message === 'Booking not found') {
        sendError(res, 'Booking not found', 404);
        return;
      }
      logger.error('Failed to cancel booking', { error, bookingId: req.params.id });
      sendError(res, 'Failed to cancel booking', 500);
    }
  }
);

export default router;
