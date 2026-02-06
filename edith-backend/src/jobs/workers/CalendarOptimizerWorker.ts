/**
 * CalendarOptimizerWorker
 * Analyzes calendar and suggests optimizations for better time management
 */

import { Job } from 'bullmq';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';
import { notificationService } from '../../services/NotificationService.js';
import { approvalService } from '../../services/ApprovalService.js';
import { BaseWorker } from './BaseWorker.js';
import type {
  CalendarOptimizerJobData,
  CalendarOptimizerResult,
  JobExecutionContext,
} from '../types.js';

interface CalendarOptimization {
  type: 'buffer' | 'focus_time' | 'travel_time' | 'consolidate' | 'reschedule';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  affectedEvents: string[];
  suggestedAction?: string;
}

export class CalendarOptimizerWorker extends BaseWorker<CalendarOptimizerJobData> {
  protected queueName = 'calendar';
  protected jobType = 'CALENDAR_OPTIMIZER' as const;

  protected async execute(
    job: Job<CalendarOptimizerJobData>,
    context: JobExecutionContext
  ): Promise<CalendarOptimizerResult> {
    const { userId, userTimezone } = context;
    const targetDate = job.data.targetDate
      ? new Date(job.data.targetDate)
      : this.getTomorrowInTimezone(userTimezone);

    logger.info('Running calendar optimization', {
      userId,
      targetDate: targetDate.toISOString(),
      jobId: job.id,
    });

    // Get events for the target date
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const events = await prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: startOfDay, lte: endOfDay },
        status: { not: 'CANCELLED' },
      },
      orderBy: { startTime: 'asc' },
    });

    if (events.length === 0) {
      logger.info('No events to optimize', { userId, targetDate });
      return {
        success: true,
        data: {
          optimizationsFound: 0,
          suggestionsCreated: 0,
        },
      };
    }

    // Convert events with proper typing
    const typedEvents = events.map((e) => ({
      id: e.id,
      title: e.title,
      startTime: e.startTime,
      endTime: e.endTime,
      attendees: (e.attendees as string[]) || [],
      location: e.location,
      isOnline: e.isOnline,
    }));

    // Analyze and find optimizations
    const optimizations: CalendarOptimization[] = [];

    // Check for back-to-back meetings
    optimizations.push(...this.checkBackToBackMeetings(typedEvents));

    // Check for missing focus time
    optimizations.push(...this.checkFocusTime(typedEvents, startOfDay, endOfDay));

    // Check for travel time issues
    optimizations.push(...this.checkTravelTime(typedEvents));

    // Check for meeting consolidation opportunities
    optimizations.push(...this.checkConsolidationOpportunities(typedEvents));

    // Filter to significant optimizations
    const significantOptimizations = optimizations.filter(
      (o) => o.severity !== 'low' || job.data.includeMinorSuggestions
    );

    logger.info('Calendar optimization analysis complete', {
      userId,
      totalFound: optimizations.length,
      significant: significantOptimizations.length,
    });

    // Create approval requests for actionable suggestions
    let suggestionsCreated = 0;
    for (const optimization of significantOptimizations) {
      if (optimization.suggestedAction) {
        await this.createOptimizationSuggestion(userId, optimization);
        suggestionsCreated++;
      }
    }

    // Send summary notification
    if (significantOptimizations.length > 0) {
      await this.sendOptimizationSummary(
        userId,
        targetDate,
        significantOptimizations
      );
    }

    return {
      success: true,
      data: {
        optimizationsFound: significantOptimizations.length,
        suggestionsCreated,
        details: significantOptimizations.map((o) => ({
          type: o.type,
          severity: o.severity,
          title: o.title,
        })),
      },
    };
  }

  /**
   * Get tomorrow's date in user's timezone
   */
  private getTomorrowInTimezone(timezone: string): Date {
    const tomorrow = this.getUserLocalTime(timezone);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  /**
   * Check for back-to-back meetings without buffer time
   */
  private checkBackToBackMeetings(
    events: Array<{ id: string; title: string; startTime: Date; endTime: Date }>
  ): CalendarOptimization[] {
    const optimizations: CalendarOptimization[] = [];
    const minBufferMinutes = 5;

    for (let i = 0; i < events.length - 1; i++) {
      const current = events[i];
      const next = events[i + 1];

      const gapMinutes =
        (next.startTime.getTime() - current.endTime.getTime()) / (1000 * 60);

      if (gapMinutes < minBufferMinutes && gapMinutes >= 0) {
        optimizations.push({
          type: 'buffer',
          severity: gapMinutes === 0 ? 'high' : 'medium',
          title: 'Back-to-back meetings detected',
          description: `"${current.title}" ends at the same time "${next.title}" starts. Consider adding buffer time.`,
          affectedEvents: [current.id, next.id],
          suggestedAction: `Add ${minBufferMinutes}-minute buffer between meetings`,
        });
      }
    }

    return optimizations;
  }

  /**
   * Check for unprotected focus time
   */
  private checkFocusTime(
    events: Array<{ id: string; startTime: Date; endTime: Date }>,
    startOfDay: Date,
    endOfDay: Date
  ): CalendarOptimization[] {
    const optimizations: CalendarOptimization[] = [];

    // Define work hours (9 AM - 5 PM)
    const workStart = new Date(startOfDay);
    workStart.setHours(9, 0, 0, 0);
    const workEnd = new Date(startOfDay);
    workEnd.setHours(17, 0, 0, 0);

    // Calculate total meeting time during work hours
    let totalMeetingMinutes = 0;
    for (const event of events) {
      const eventStart = Math.max(event.startTime.getTime(), workStart.getTime());
      const eventEnd = Math.min(event.endTime.getTime(), workEnd.getTime());
      if (eventEnd > eventStart) {
        totalMeetingMinutes += (eventEnd - eventStart) / (1000 * 60);
      }
    }

    const workHoursMinutes = 8 * 60; // 480 minutes
    const meetingPercentage = (totalMeetingMinutes / workHoursMinutes) * 100;

    if (meetingPercentage > 80) {
      optimizations.push({
        type: 'focus_time',
        severity: 'high',
        title: 'No focus time available',
        description: `${Math.round(meetingPercentage)}% of your work day is in meetings. Consider blocking focus time.`,
        affectedEvents: events.map((e) => e.id),
        suggestedAction: 'Block 1-2 hours of focus time',
      });
    } else if (meetingPercentage > 60) {
      optimizations.push({
        type: 'focus_time',
        severity: 'medium',
        title: 'Limited focus time',
        description: `${Math.round(meetingPercentage)}% of your work day is in meetings.`,
        affectedEvents: events.map((e) => e.id),
      });
    }

    return optimizations;
  }

  /**
   * Check for travel time issues between in-person meetings
   */
  private checkTravelTime(
    events: Array<{
      id: string;
      title: string;
      startTime: Date;
      endTime: Date;
      location: string | null;
      isOnline: boolean;
    }>
  ): CalendarOptimization[] {
    const optimizations: CalendarOptimization[] = [];

    // Only check in-person meetings with locations
    const inPersonEvents = events.filter((e) => !e.isOnline && e.location);

    for (let i = 0; i < inPersonEvents.length - 1; i++) {
      const current = inPersonEvents[i];
      const next = inPersonEvents[i + 1];

      // Check if locations are different
      if (current.location !== next.location) {
        const gapMinutes =
          (next.startTime.getTime() - current.endTime.getTime()) / (1000 * 60);

        // Assume 30 minutes travel time between different locations
        const estimatedTravelTime = 30;

        if (gapMinutes < estimatedTravelTime) {
          optimizations.push({
            type: 'travel_time',
            severity: 'high',
            title: 'Insufficient travel time',
            description: `Only ${Math.round(gapMinutes)} minutes between "${current.title}" at ${current.location} and "${next.title}" at ${next.location}.`,
            affectedEvents: [current.id, next.id],
            suggestedAction: `Consider moving "${next.title}" to allow for travel`,
          });
        }
      }
    }

    return optimizations;
  }

  /**
   * Check for meeting consolidation opportunities
   */
  private checkConsolidationOpportunities(
    events: Array<{
      id: string;
      title: string;
      startTime: Date;
      endTime: Date;
      attendees: string[];
    }>
  ): CalendarOptimization[] {
    const optimizations: CalendarOptimization[] = [];

    // Find meetings with significant attendee overlap
    for (let i = 0; i < events.length - 1; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const event1 = events[i];
        const event2 = events[j];

        if (event1.attendees.length === 0 || event2.attendees.length === 0) {
          continue;
        }

        const overlap = event1.attendees.filter((a) =>
          event2.attendees.includes(a)
        );
        const overlapPercentage =
          (overlap.length /
            Math.min(event1.attendees.length, event2.attendees.length)) *
          100;

        if (overlapPercentage >= 75) {
          optimizations.push({
            type: 'consolidate',
            severity: 'low',
            title: 'Potential meeting consolidation',
            description: `"${event1.title}" and "${event2.title}" have ${Math.round(overlapPercentage)}% attendee overlap. Consider combining.`,
            affectedEvents: [event1.id, event2.id],
          });
        }
      }
    }

    return optimizations;
  }

  /**
   * Create an approval request for an optimization suggestion
   */
  private async createOptimizationSuggestion(
    userId: string,
    optimization: CalendarOptimization
  ): Promise<void> {
    try {
      await approvalService.createRequest({
        userId,
        agentType: 'CalendarOptimizer',
        action: optimization.suggestedAction || optimization.title,
        toolName: 'calendar_update',
        category: 'REQUEST_APPROVAL',
        confidence: optimization.severity === 'high' ? 0.9 : 0.7,
        description: optimization.description,
        details: {
          proposedAction: {
            type: optimization.type,
            suggestedAction: optimization.suggestedAction,
            affectedEvents: optimization.affectedEvents,
          },
          reasoning: optimization.description,
          impact: {
            type: optimization.severity === 'high' ? 'HIGH' : optimization.severity === 'medium' ? 'MEDIUM' : 'LOW',
            affectedAreas: ['calendar'],
          },
          isReversible: true,
          relatedEntities: optimization.affectedEvents.map((eventId) => ({
            type: 'event' as const,
            id: eventId,
            displayName: 'Affected Event',
          })),
        },
        expiresInMinutes: 1440, // 24 hours
      });
    } catch (error) {
      logger.error('Failed to create optimization suggestion', {
        userId,
        optimization: optimization.title,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Send summary notification of optimizations found
   */
  private async sendOptimizationSummary(
    userId: string,
    targetDate: Date,
    optimizations: CalendarOptimization[]
  ): Promise<void> {
    const highPriority = optimizations.filter((o) => o.severity === 'high');
    const dateStr = targetDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    let body = `Found ${optimizations.length} optimization${optimizations.length > 1 ? 's' : ''} for ${dateStr}`;

    if (highPriority.length > 0) {
      body += `\n\nHigh priority:\n`;
      highPriority.forEach((o) => {
        body += `• ${o.title}\n`;
      });
    }

    await notificationService.send({
      userId,
      type: 'CALENDAR_OPTIMIZATION',
      title: 'Calendar Optimization Suggestions',
      body,
      data: {
        targetDate: targetDate.toISOString(),
        optimizationCount: optimizations.length,
        highPriorityCount: highPriority.length,
      },
      priority: highPriority.length > 0 ? 'HIGH' : 'NORMAL',
    });
  }

  protected async updateMetrics(
    context: JobExecutionContext,
    result: CalendarOptimizerResult
  ): Promise<void> {
    // Calendar optimization doesn't directly update success metrics
  }
}

export const calendarOptimizerWorker = new CalendarOptimizerWorker();
