/**
 * Google Integrations
 * Exports all Google-related integration components
 */

// OAuth
export {
  googleOAuthClient,
  GMAIL_SCOPES,
  CALENDAR_SCOPES,
  ALL_GOOGLE_SCOPES,
} from './GoogleOAuthClient.js';

// Gmail
export {
  gmailClient,
  createGmailClient,
  createGmailClientForUser,
  RealGmailClient,
  MockGmailClient,
  type IGmailClient,
  type IGmailClientExtended,
  type GmailMessage,
  type GmailQuery,
  type GmailDraft,
  type GmailSendResult,
  type GmailListResult,
  type GmailHistoryResult,
  type GmailWatchResult,
} from './GmailClient.js';

export { gmailSyncWorker } from './GmailSyncWorker.js';
export { gmailWebhookHandler } from './GmailWebhookHandler.js';

// Calendar
export {
  calendarClient,
  createCalendarClient,
  createCalendarClientForUser,
  RealCalendarClient,
  MockCalendarClient,
  type ICalendarClient,
  type ICalendarClientExtended,
  type CalendarEvent,
  type CalendarQuery,
  type CreateEventInput,
  type UpdateEventInput,
  type FreeBusyQuery,
  type FreeBusyResult,
  type CalendarListResult,
  type CalendarInfo,
  type WatchResponse,
} from './CalendarClient.js';

export { calendarSyncWorker } from './CalendarSyncWorker.js';
export { calendarWebhookHandler, type CalendarWebhookHeaders } from './CalendarWebhookHandler.js';
