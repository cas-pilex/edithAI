/**
 * WhatsApp Integrations
 * Exports all WhatsApp-related integration components
 */

// Client
export {
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
} from './WhatsAppClient.js';

// Templates
export {
  TEMPLATES,
  WhatsAppTemplatesHelper,
  type WhatsAppTemplate,
  type TemplateCategory,
  type TemplateSendOptions,
} from './WhatsAppTemplates.js';

// Notifications
export {
  whatsappNotifications,
  type DailyBriefingData,
  type MeetingReminderData,
  type EmailAlertData,
  type ApprovalRequestData,
  type TaskReminderData,
  type FlightUpdateData,
} from './WhatsAppNotifications.js';

// Webhook Handler
export {
  whatsappWebhookHandler,
  type TwilioWhatsAppMessage,
  type TwilioStatusCallback,
  type TwilioMessageStatus,
  type WebhookResult,
  type ParsedInboundMessage,
} from './WhatsAppWebhookHandler.js';
