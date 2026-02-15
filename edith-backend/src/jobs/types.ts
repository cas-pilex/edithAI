/**
 * Job Types
 * Type definitions for all scheduled job payloads
 */

import type { JobType, JobStatus, UserPreferences } from '@prisma/client';

// ============================================================================
// Base Job Types
// ============================================================================

export interface BaseJobData {
  userId?: string;
  triggeredAt: string;
  retryCount?: number;
  scheduledJobId?: string;
}

export interface JobExecutionContext {
  jobId: string;
  userId: string;
  userTimezone: string;
  userPreferences: UserPreferences | null;
  startTime: Date;
}

export interface UserWithPreferences {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  locale: string;
  isActive: boolean;
  preferences: UserPreferences | null;
}

// ============================================================================
// Specific Job Data Types
// ============================================================================

export interface MorningBriefingJobData extends BaseJobData {
  userId: string;
  includeWeather?: boolean;
}

export interface InboxProcessorJobData extends BaseJobData {
  // System-wide job, processes all users
  batchSize?: number;
  maxEmailsPerUser?: number;
  // Targeted mode: process only a specific user (triggered after sync)
  targetUserId?: string;
}

export interface CalendarOptimizerJobData extends BaseJobData {
  userId: string;
  targetDate?: string; // ISO date string for which date to optimize (default: tomorrow)
  includeMinorSuggestions?: boolean;
}

export interface MeetingPrepJobData extends BaseJobData {
  userId: string;
  eventId: string;
  hoursBeforeMeeting?: number;
}

export interface WeeklyReportJobData extends BaseJobData {
  userId: string;
  weekStart?: string; // ISO date string
  weekEnd?: string;   // ISO date string
}

export interface RelationshipNurtureJobData extends BaseJobData {
  userId: string;
  daysThreshold?: number; // Days without contact to flag
  inactiveDays?: number; // Days of inactivity to consider
  maxContacts?: number; // Max contacts to include
}

export interface EmailDigestJobData extends BaseJobData {
  userId: string;
  // User-specific digest job
  digestType?: 'hourly' | 'daily';
  frequency?: string; // 'HOURLY' | 'EVERY_4_HOURS' | 'DAILY'
}

export interface FollowUpReminderJobData extends BaseJobData {
  // System-wide job, checks all users for due follow-ups
}

export interface SecurityAuditJobData extends BaseJobData {
  // System-wide maintenance job
  checkTokens?: boolean;
  checkLoginPatterns?: boolean;
  cleanupLogs?: boolean;
  retentionDays?: number;
}

export interface MetricAggregationJobData extends BaseJobData {
  // System-wide job, aggregates metrics for all users
  date?: string; // ISO date string (default: yesterday)
}

// ============================================================================
// Job Result Types
// ============================================================================

export interface JobResult {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface MorningBriefingResult extends JobResult {
  data?: {
    eventsCount: number;
    tasksCount: number;
    urgentEmailsCount: number;
    notificationSent: boolean;
  };
}

export interface InboxProcessorResult extends JobResult {
  data?: {
    usersProcessed: number;
    totalEmailsProcessed: number;
    urgentAlertsSent: number;
    errors: string[];
  };
}

export interface CalendarOptimizerResult extends JobResult {
  data?: {
    optimizationsFound: number;
    suggestionsCreated: number;
    details?: Array<{
      type: string;
      severity: string;
      title: string;
    }>;
  };
}

export interface MeetingPrepResult extends JobResult {
  data?: {
    eventId: string;
    attendeesResearched?: number;
    relatedEmailsFound?: number;
    notificationSent?: boolean;
    skipped?: boolean;
    reason?: string;
  };
}

export interface EmailDigestResult extends JobResult {
  data?: {
    emailsIncluded: number;
    urgentCount?: number;
    categories?: string[];
    skipped?: boolean;
    reason?: string;
  };
}

export interface FollowUpReminderResult extends JobResult {
  data?: {
    remindersFound: number;
    remindersSent: number;
    byType?: {
      email: number;
      contact: number;
      task: number;
    };
  };
}

export interface RelationshipNurtureResult extends JobResult {
  data?: {
    contactsAnalyzed: number;
    suggestionsGenerated: number;
    contacts?: Array<{
      name: string;
      daysSinceContact: number;
      suggestedAction: string;
    }>;
  };
}

export interface WeeklyReportResult extends JobResult {
  data?: {
    reportId: string;
    timeSavedMinutes: number;
    emailsProcessed: number;
    tasksCompleted: number;
    meetingsScheduled: number;
  };
}

// ============================================================================
// Notification Types for Jobs
// ============================================================================

export interface DailyBriefingData {
  events: Array<{
    time: string;
    title: string;
    location?: string | null;
    meetingUrl?: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    priority: string;
    dueDate?: string;
  }>;
  emails: {
    unread: number;
    important: number;
    topSenders: string[];
  };
  weather?: {
    temperature: number;
    condition: string;
    location: string;
  };
  crmReminders?: Array<{
    type: string;
    contactName: string;
    message: string;
  }>;
  travelReminders?: Array<{
    tripName: string;
    startDate: string;
    daysUntil: number;
  }>;
}

export interface EmailDigestData {
  emails: Array<{
    id: string;
    from: string;
    subject: string;
    snippet: string;
    category: string;
    receivedAt: string;
  }>;
  totalCount: number;
  urgentCount: number;
  actionRequiredCount: number;
}

export interface OptimizationSuggestion {
  type: 'add_buffer' | 'move_meeting' | 'block_focus_time' | 'reduce_back_to_back';
  description: string;
  reasoning: string;
  proposedChanges: Record<string, unknown>;
  affectedEvents: Array<{
    id: string;
    title: string;
  }>;
  confidence: number;
  requiresApproval: boolean;
}

export interface RelationshipNurtureData {
  contactsNeedingAttention: Array<{
    id: string;
    name: string;
    lastContact: string;
    daysSinceContact: number;
    importance: number;
    suggestedAction: string;
  }>;
  upcomingBirthdays: Array<{
    id: string;
    name: string;
    birthday: string;
    daysUntil: number;
  }>;
}

// ============================================================================
// Error Types
// ============================================================================

export enum JobErrorCode {
  QUIET_HOURS = 'QUIET_HOURS',
  RATE_LIMITED = 'RATE_LIMITED',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INTEGRATION_ERROR = 'INTEGRATION_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export class JobError extends Error {
  constructor(
    public code: JobErrorCode,
    message: string,
    public retryable: boolean = false,
    public retryAfterMs?: number
  ) {
    super(message);
    this.name = 'JobError';
  }
}

// ============================================================================
// Re-exports
// ============================================================================

export { JobType, JobStatus };
