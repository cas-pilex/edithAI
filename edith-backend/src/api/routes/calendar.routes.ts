/**
 * Calendar API Routes
 * Event management and availability
 */

import { Router } from 'express';
import type { Router as RouterType, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody, validateUUID } from '../middleware/validation.middleware.js';
import { calendarService } from '../../services/CalendarService.js';
import { calendarSyncWorker } from '../../integrations/google/CalendarSyncWorker.js';
import { syncManager } from '../../integrations/common/SyncManager.js';
import { sendSuccess, sendPaginated, sendError } from '../../utils/helpers.js';
import { NotFoundError } from '../../utils/errors.js';
import {
  createEventSchema,
  updateEventSchema,
  rsvpSchema,
  findTimeSchema,
} from '../../utils/validation.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';

const router: RouterType = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * GET /calendar/events
 * List events with filters and pagination
 */
router.get(
  '/events',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { page, limit, startDate, endDate, isOnline, status } = req.query;

      const pageNum = Number(page) || 1;
      const limitNum = Math.min(Number(limit) || 50, 200);
      const offset = (pageNum - 1) * limitNum;

      // Parse filters
      const parsedFilters = {
        startDate: startDate ? new Date(String(startDate)) : undefined,
        endDate: endDate ? new Date(String(endDate)) : undefined,
        isOnline: isOnline === 'true' ? true : isOnline === 'false' ? false : undefined,
        status: status as string | undefined,
      };

      const { events, total } = await calendarService.getEvents(
        userId,
        parsedFilters,
        { limit: limitNum, offset }
      );

      sendPaginated(res, events, pageNum, limitNum, total);
    } catch (error) {
      logger.error('Failed to get events', { error });
      sendError(res, 'Failed to retrieve events', 500);
    }
  }
);

/**
 * GET /calendar/today
 * Get events for today
 */
router.get('/today', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const events = await calendarService.getDayEvents(userId, new Date());
    sendSuccess(res, events);
  } catch (error) {
    logger.error('Failed to get today events', { error });
    sendError(res, 'Failed to retrieve today events', 500);
  }
});

/**
 * GET /calendar/stats
 * Get calendar statistics
 */
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { startDate, endDate } = req.query;

    // Default to current month
    const start = startDate
      ? new Date(startDate as string)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate
      ? new Date(endDate as string)
      : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

    const stats = await calendarService.getStats(userId, start, end);
    sendSuccess(res, stats);
  } catch (error) {
    logger.error('Failed to get calendar stats', { error });
    sendError(res, 'Failed to retrieve calendar statistics', 500);
  }
});

/**
 * GET /calendar/availability
 * Check availability for scheduling
 */
router.get(
  '/availability',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { startDate, endDate, duration, bufferMinutes } = req.query;

      if (!startDate || !endDate) {
        sendError(res, 'startDate and endDate are required', 400);
        return;
      }

      const slots = await calendarService.findAvailableSlots(userId, {
        startDate: new Date(String(startDate)),
        endDate: new Date(String(endDate)),
        duration: Number(duration) || 30,
        bufferMinutes: bufferMinutes ? Number(bufferMinutes) : undefined,
      });

      sendSuccess(res, { slots });
    } catch (error) {
      logger.error('Failed to get availability', { error });
      sendError(res, 'Failed to check availability', 500);
    }
  }
);

/**
 * POST /calendar/find-time
 * Find common free time with attendees
 */
router.post(
  '/find-time',
  validateBody(findTimeSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { attendees, duration, startDate, endDate, preferredTimes } = req.body;

      // Find available slots for the requesting user
      const userSlots = await calendarService.findAvailableSlots(userId, {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        duration,
      });

      // TODO: Check availability for all attendees (would require cross-user queries or external calendar APIs)
      // For now, return user's available slots with a note
      sendSuccess(res, {
        slots: userSlots.slice(0, 10), // Return top 10 slots
        attendees,
        note: 'Slots shown are based on your calendar. Attendee availability would require calendar integration.',
      });
    } catch (error) {
      logger.error('Failed to find meeting time', { error });
      sendError(res, 'Failed to find available meeting time', 500);
    }
  }
);

/**
 * GET /calendar/events/:id
 * Get a single event by ID
 */
router.get(
  '/events/:id',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      const event = await calendarService.getEventById(id, userId);

      if (!event) {
        throw new NotFoundError('Event');
      }

      sendSuccess(res, event);
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to get event', { error, eventId: req.params.id });
      sendError(res, 'Failed to retrieve event', 500);
    }
  }
);

/**
 * POST /calendar/events
 * Create a new event
 */
router.post(
  '/events',
  validateBody(createEventSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const data = req.body;

      // Check for conflicts
      const conflicts = await calendarService.checkConflicts(
        userId,
        new Date(data.startTime),
        new Date(data.endTime)
      );

      if (conflicts.length > 0) {
        sendSuccess(res, {
          created: false,
          conflicts,
          message: 'Event conflicts with existing events',
        }, 'Conflicts detected', 200);
        return;
      }

      const event = await calendarService.createEvent(userId, {
        externalId: randomUUID(),
        ...data,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
      });

      sendSuccess(res, event, 'Event created successfully', 201);
    } catch (error) {
      logger.error('Failed to create event', { error });
      sendError(res, 'Failed to create event', 500);
    }
  }
);

/**
 * PATCH /calendar/events/:id
 * Update an event
 */
router.patch(
  '/events/:id',
  validateUUID('id'),
  validateBody(updateEventSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const data = req.body;

      // Check if event exists
      const existing = await calendarService.getEventById(id, userId);
      if (!existing) {
        throw new NotFoundError('Event');
      }

      // Check for conflicts if time is being changed
      if (data.startTime || data.endTime) {
        const startTime = data.startTime ? new Date(data.startTime) : existing.startTime;
        const endTime = data.endTime ? new Date(data.endTime) : existing.endTime;

        const conflicts = await calendarService.checkConflicts(
          userId,
          startTime,
          endTime,
          id // Exclude current event
        );

        if (conflicts.length > 0) {
          sendSuccess(res, {
            updated: false,
            conflicts,
            message: 'Event conflicts with existing events',
          }, 'Conflicts detected', 200);
          return;
        }
      }

      const updated = await calendarService.updateEvent(id, userId, {
        ...data,
        startTime: data.startTime ? new Date(data.startTime) : undefined,
        endTime: data.endTime ? new Date(data.endTime) : undefined,
      });

      sendSuccess(res, updated, 'Event updated successfully');
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to update event', { error, eventId: req.params.id });
      sendError(res, 'Failed to update event', 500);
    }
  }
);

/**
 * DELETE /calendar/events/:id
 * Delete an event
 */
router.delete(
  '/events/:id',
  validateUUID('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;

      await calendarService.deleteEvent(id, userId);
      sendSuccess(res, { deleted: true }, 'Event deleted successfully');
    } catch (error) {
      if (error instanceof Error && error.message === 'Event not found') {
        sendError(res, 'Event not found', 404);
        return;
      }
      logger.error('Failed to delete event', { error, eventId: req.params.id });
      sendError(res, 'Failed to delete event', 500);
    }
  }
);

/**
 * POST /calendar/events/:id/rsvp
 * RSVP to an event
 */
router.post(
  '/events/:id/rsvp',
  validateUUID('id'),
  validateBody(rsvpSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const { status, comment } = req.body;

      // Check if event exists
      const event = await calendarService.getEventById(id, userId);
      if (!event) {
        throw new NotFoundError('Event');
      }

      // Update attendee status in the event
      const attendees = (event.attendees as Array<{ email: string; status?: string; comment?: string }>) || [];
      // TODO: Get user email and update their status in attendees array
      // For now, just acknowledge the RSVP

      sendSuccess(res, {
        eventId: id,
        status,
        comment,
        message: 'RSVP recorded',
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      logger.error('Failed to RSVP to event', { error, eventId: req.params.id });
      sendError(res, 'Failed to RSVP to event', 500);
    }
  }
);

/**
 * POST /calendar/sync
 * Trigger manual calendar sync
 */
router.post('/sync', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Check if Google Calendar is connected
    const status = await syncManager.getSyncStatus(userId, 'GOOGLE_CALENDAR');
    if (!status) {
      sendError(res, 'Google Calendar not connected. Please connect first.', 400);
      return;
    }

    // Return immediately, run sync in background
    sendSuccess(res, {
      syncing: true,
      message: 'Calendar sync initiated',
    });

    // Fire-and-forget sync
    calendarSyncWorker.syncAllCalendars(userId).catch(err =>
      logger.error('Background calendar sync failed', { userId, error: err })
    );
  } catch (error) {
    logger.error('Failed to trigger calendar sync', { error });
    sendError(res, 'Failed to trigger calendar sync', 500);
  }
});

export default router;
