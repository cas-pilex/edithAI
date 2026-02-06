/**
 * Integrations Index
 * Central export point for all integration components
 */

// ============================================================================
// Common Infrastructure
// ============================================================================

export {
  oauthManager,
  type OAuthConfig,
  type TokenResponse,
  type ValidTokens,
} from './common/OAuthManager.js';

export {
  rateLimiter,
  PROVIDER_RATE_LIMITS,
  type RateLimitConfig,
  type RateLimitResult,
  type BackoffConfig,
} from './common/RateLimiter.js';

export {
  syncManager,
  type SyncConfig,
  type SyncResult,
  type SyncError,
} from './common/SyncManager.js';

// Re-export SyncStatus from Prisma
export { SyncStatus } from '@prisma/client';

export {
  webhookManager,
  type WebhookVerificationResult,
  type GooglePubSubMessage,
  type TwilioWebhookParams,
} from './common/WebhookManager.js';

// ============================================================================
// Google Integrations (Gmail + Calendar)
// ============================================================================

export {
  // OAuth
  googleOAuthClient,
  GMAIL_SCOPES,
  CALENDAR_SCOPES,
  ALL_GOOGLE_SCOPES,
  // Gmail
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
  // Gmail Sync
  gmailSyncWorker,
  gmailWebhookHandler,
  // Calendar
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
  // Calendar Sync
  calendarSyncWorker,
  calendarWebhookHandler,
  type CalendarWebhookHeaders,
} from './google/index.js';

// ============================================================================
// Slack Integration
// ============================================================================

export {
  // OAuth
  slackOAuthClient,
  SLACK_BOT_SCOPES,
  SLACK_USER_SCOPES,
  type SlackOAuthConfig,
  type SlackTokenResponse,
  type SlackCredentials,
  // Client
  slackClient,
  createSlackClient,
  createMockSlackClient,
  RealSlackClient,
  MockSlackClient,
  type ISlackClient,
  type SlackChannel,
  type SlackUser,
  type SlackMessage,
  type SlackDndStatus,
  type SendMessageOptions,
  // Sync & Events
  slackSyncWorker,
  slackEventHandler,
  slackBotHandler,
  type SlackEventPayload,
  type SlackEvent,
  type AppMentionEvent,
  type MessageEvent,
  type ReactionAddedEvent,
  type ReactionRemovedEvent,
  type AppHomeOpenedEvent,
  type EventHandlerResult,
  type SlashCommand,
  type SlashCommandResponse,
  type InteractivePayload,
} from './slack/index.js';

// ============================================================================
// Telegram Integration
// ============================================================================

export {
  // Bot
  telegramBot,
  BOT_COMMANDS,
  type TelegramConfig,
  type TelegramUser,
  type TelegramSessionData,
  type TelegramContext,
  type BotCommand,
  // Commands & Notifications
  telegramCommands,
  telegramNotifications,
  type DailyBriefingData as TelegramDailyBriefingData,
  type EmailAlertData as TelegramEmailAlertData,
  type MeetingReminderData as TelegramMeetingReminderData,
  type ApprovalRequestData as TelegramApprovalRequestData,
  type TaskReminderData as TelegramTaskReminderData,
  // Webhook
  telegramWebhookHandler,
  type TelegramUpdate,
  type TelegramMessage,
  type TelegramCallbackQuery,
  type TelegramInlineQuery,
  type WebhookResult as TelegramWebhookResult,
} from './telegram/index.js';

// ============================================================================
// WhatsApp Integration
// ============================================================================

export {
  // Client
  whatsappClient,
  createWhatsAppClient,
  getWhatsAppClientForUser,
  RealWhatsAppClient,
  MockWhatsAppClient,
  type IWhatsAppClient,
  type WhatsAppConfig,
  type WhatsAppMessage,
  type WhatsAppSendResult,
  type ConversationSession,
  // Templates
  TEMPLATES as WHATSAPP_TEMPLATES,
  WhatsAppTemplatesHelper,
  type WhatsAppTemplate,
  type TemplateCategory,
  type TemplateSendOptions,
  // Notifications
  whatsappNotifications,
  type DailyBriefingData as WhatsAppDailyBriefingData,
  type MeetingReminderData as WhatsAppMeetingReminderData,
  type EmailAlertData as WhatsAppEmailAlertData,
  type ApprovalRequestData as WhatsAppApprovalRequestData,
  type TaskReminderData as WhatsAppTaskReminderData,
  type FlightUpdateData,
  // Webhook
  whatsappWebhookHandler,
  type TwilioWhatsAppMessage,
  type TwilioStatusCallback,
  type TwilioMessageStatus,
  type WebhookResult as WhatsAppWebhookResult,
  type ParsedInboundMessage,
} from './whatsapp/index.js';

// ============================================================================
// Travel Integration
// ============================================================================

export {
  // Amadeus (Flights & Hotels)
  amadeusClient,
  createAmadeusClient,
  RealAmadeusClient,
  MockAmadeusClient,
  type IAmadeusClient,
  type FlightSearchParams,
  type FlightOffer,
  type HotelSearchParams,
  type HotelOffer,
  type Passenger,
  type GuestInfo,
  type BookingConfirmation,
  // Google Places
  googlePlacesClient,
  createGooglePlacesClient,
  RealGooglePlacesClient,
  MockGooglePlacesClient,
  type IGooglePlacesClient,
  type LatLng,
  type RestaurantSearchParams,
  type Restaurant,
  type PlaceDetails,
  type DirectionsResult,
  // Uber/Lyft
  uberClient,
  createUberClient,
  RealUberClient,
  MockUberClient,
  type IUberClient,
  type RideEstimate,
  type RideDeepLink,
  // Helpers
  TravelHelpers,
} from './travel/index.js';
