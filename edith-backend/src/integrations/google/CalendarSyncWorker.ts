/**
 * CalendarSyncWorker
 * Background sync worker for Google Calendar data
 */

import { prisma } from '../../database/client.js';
import { syncManager, type SyncResult, type SyncError } from '../common/SyncManager.js';
import { webhookManager } from '../common/WebhookManager.js';
import { createCalendarClientForUser, type CalendarEvent } from './CalendarClient.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

interface CalendarEventCreateData {
  externalId: string;
  userId: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  isOnline: boolean;
  meetingUrl?: string;
  status: string;
  attendees: object;
  organizer?: string;
  recurrence?: string[];
  recurringEventId?: string;
  iCalUID?: string;
}

// ============================================================================
// CalendarSyncWorker Class
// ============================================================================

class CalendarSyncWorkerImpl {
  /**
   * Sync all calendars for a user
   */
  async syncAllCalendars(userId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: SyncError[] = [];
    let itemsSynced = 0;

    const syncConfig = {
      provider: 'GOOGLE_CALENDAR' as const,
      userId,
      syncType: 'full' as const,
    };

    const syncId = await syncManager.startSync(syncConfig);

    try {
      const client = await createCalendarClientForUser(userId);
      if (!client) {
        throw new Error('Calendar client not available for user');
      }

      // Get list of user's calendars
      const calendars = await client.listCalendars();

      await syncManager.updateSyncProgress(syncId, {
        currentPhase: 'syncing calendars',
        totalItems: calendars.length,
      });

      // Sync each calendar
      for (const calendar of calendars) {
        try {
          const calendarResult = await this.syncCalendar(userId, calendar.id);
          itemsSynced += calendarResult.itemsSynced;
          errors.push(...calendarResult.errors);

          // Store calendar info in CalendarSync table
          await prisma.calendarSync.upsert({
            where: {
              userId_calendarId: { userId, calendarId: calendar.id },
            },
            update: {
              calendarName: calendar.summary,
              isPrimary: calendar.primary || false,
              lastSyncAt: new Date(),
            },
            create: {
              userId,
              calendarId: calendar.id,
              calendarName: calendar.summary,
              isPrimary: calendar.primary || false,
              lastSyncAt: new Date(),
            },
          });
        } catch (error) {
          errors.push({
            item: calendar.id,
            message: error instanceof Error ? error.message : 'Failed to sync calendar',
            retryable: true,
          });
        }
      }

      const result: SyncResult = {
        success: errors.length === 0,
        itemsSynced,
        errors,
        duration: Date.now() - startTime,
      };

      await syncManager.completeSync(syncId, syncConfig, result);
      return result;

    } catch (error) {
      logger.error('Calendar sync failed', { userId, error });

      const result: SyncResult = {
        success: false,
        itemsSynced,
        errors: [
          ...errors,
          {
            message: error instanceof Error ? error.message : 'Sync failed',
            retryable: true,
          },
        ],
        duration: Date.now() - startTime,
      };

      await syncManager.completeSync(syncId, syncConfig, result);
      return result;
    }
  }

  /**
   * Sync a specific calendar
   */
  async syncCalendar(
    userId: string,
    calendarId: string,
    syncToken?: string
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: SyncError[] = [];
    let itemsSynced = 0;

    try {
      const client = await createCalendarClientForUser(userId);
      if (!client) {
        throw new Error('Calendar client not available for user');
      }

      // Get sync token from database if not provided
      if (!syncToken) {
        syncToken = await syncManager.getCalendarSyncToken(userId, calendarId) || undefined;
      }

      let pageToken: string | undefined;
      let newSyncToken: string | undefined;

      do {
        const result = await client.syncEvents(calendarId, syncToken);

        // Process events
        for (const event of result.items) {
          try {
            if (event.status === 'cancelled') {
              // Delete cancelled events
              await this.deleteEvent(userId, event.id);
            } else {
              // Upsert event
              await this.upsertEvent(userId, calendarId, event);
            }
            itemsSynced++;
          } catch (error) {
            errors.push({
              item: event.id,
              message: error instanceof Error ? error.message : 'Failed to sync event',
              retryable: true,
            });
          }
        }

        pageToken = result.nextPageToken;
        if (result.nextSyncToken) {
          newSyncToken = result.nextSyncToken;
        }
      } while (pageToken);

      // Store new sync token
      if (newSyncToken) {
        await syncManager.recordCalendarSyncToken(userId, calendarId, newSyncToken);
      }

      return {
        success: errors.length === 0,
        itemsSynced,
        newSyncToken,
        errors,
        duration: Date.now() - startTime,
      };

    } catch (error) {
      // If sync token is invalid, clear it and retry with full sync
      if (error instanceof Error && error.message.includes('Sync token')) {
        logger.info('Sync token invalid, performing full sync', { userId, calendarId });
        await prisma.calendarSync.update({
          where: { userId_calendarId: { userId, calendarId } },
          data: { syncToken: null },
        });
        return this.syncCalendar(userId, calendarId);
      }

      throw error;
    }
  }

  /**
   * Set up push notifications for all calendars
   */
  async setupWatches(userId: string): Promise<void> {
    const client = await createCalendarClientForUser(userId);
    if (!client) {
      throw new Error('Calendar client not available for user');
    }

    const webhookUrl = `${config.server.apiUrl}/api/webhooks/google/calendar`;

    // Get user's calendars
    const calendarSyncs = await prisma.calendarSync.findMany({
      where: { userId },
    });

    for (const calSync of calendarSyncs) {
      try {
        const channelId = webhookManager.generateCalendarChannelId(userId, calSync.calendarId);

        const watchResult = await client.watchCalendar(
          calSync.calendarId,
          webhookUrl,
          channelId
        );

        // Store watch info
        await prisma.calendarSync.update({
          where: { id: calSync.id },
          data: {
            // Store watch info in a way we can retrieve later
            // Note: You might want to add watchChannelId and watchResourceId fields to CalendarSync model
          },
        });

        logger.info('Calendar watch set up', {
          userId,
          calendarId: calSync.calendarId,
          expiration: watchResult.expiration,
        });
      } catch (error) {
        logger.error('Failed to set up calendar watch', {
          userId,
          calendarId: calSync.calendarId,
          error,
        });
      }
    }
  }

  /**
   * Stop all calendar watches for a user
   */
  async stopAllWatches(userId: string): Promise<void> {
    // This would require storing channelId and resourceId when setting up watches
    // For now, this is a placeholder
    logger.info('Stopping all calendar watches', { userId });
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async upsertEvent(userId: string, calendarId: string, event: CalendarEvent): Promise<void> {
    const eventData = this.parseEvent(userId, calendarId, event);

    await prisma.calendarEvent.upsert({
      where: {
        userId_externalId: {
          externalId: eventData.externalId,
          userId: eventData.userId,
        },
      },
      update: {
        title: eventData.title,
        description: eventData.description,
        location: eventData.location,
        startTime: eventData.startTime,
        endTime: eventData.endTime,
        isOnline: eventData.isOnline,
        meetingUrl: eventData.meetingUrl,
        status: this.mapStatus(eventData.status),
        attendees: eventData.attendees as object,
        organizer: eventData.organizer,
        recurrenceRule: eventData.recurrence?.join('\n'),
        originalEventId: eventData.recurringEventId,
      },
      create: {
        externalId: eventData.externalId,
        userId: eventData.userId,
        calendarId: eventData.calendarId,
        title: eventData.title,
        description: eventData.description,
        location: eventData.location,
        startTime: eventData.startTime,
        endTime: eventData.endTime,
        isAllDay: eventData.isAllDay,
        isOnline: eventData.isOnline,
        meetingUrl: eventData.meetingUrl,
        status: this.mapStatus(eventData.status),
        attendees: eventData.attendees as object,
        organizer: eventData.organizer,
        recurrenceRule: eventData.recurrence?.join('\n'),
        originalEventId: eventData.recurringEventId,
      },
    });
  }

  private mapStatus(status: string | undefined): 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED' {
    switch (status?.toLowerCase()) {
      case 'confirmed': return 'CONFIRMED';
      case 'tentative': return 'TENTATIVE';
      case 'cancelled': return 'CANCELLED';
      default: return 'CONFIRMED';
    }
  }

  private async deleteEvent(userId: string, externalId: string): Promise<void> {
    await prisma.calendarEvent.deleteMany({
      where: {
        userId,
        externalId,
      },
    });
  }

  private parseEvent(userId: string, calendarId: string, event: CalendarEvent): CalendarEventCreateData {
    // Determine if all-day event
    const isAllDay = !event.start.dateTime && !!event.start.date;

    // Parse start and end times
    let startTime: Date;
    let endTime: Date;

    if (isAllDay) {
      startTime = new Date(event.start.date!);
      endTime = new Date(event.end.date!);
    } else {
      startTime = new Date(event.start.dateTime!);
      endTime = new Date(event.end.dateTime!);
    }

    // Check for online meeting
    const meetingUrl = event.conferenceData?.entryPoints?.find(
      ep => ep.entryPointType === 'video'
    )?.uri;

    return {
      externalId: event.id,
      userId,
      calendarId,
      title: event.summary,
      description: event.description,
      location: event.location,
      startTime,
      endTime,
      isAllDay,
      isOnline: !!meetingUrl || event.location?.includes('meet.google.com') || false,
      meetingUrl,
      status: event.status,
      attendees: event.attendees || [],
      organizer: event.organizer?.email,
      recurrence: event.recurrence,
      recurringEventId: event.recurringEventId,
      iCalUID: event.iCalUID,
    };
  }
}

export const calendarSyncWorker = new CalendarSyncWorkerImpl();
export default calendarSyncWorker;
