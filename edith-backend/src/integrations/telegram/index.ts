/**
 * Telegram Integrations
 * Exports all Telegram-related integration components
 */

// Bot
export {
  telegramBot,
  BOT_COMMANDS,
  type TelegramConfig,
  type TelegramUser,
  type TelegramSessionData,
  type TelegramContext,
  type BotCommand,
} from './TelegramBot.js';

// Commands
export {
  telegramCommands,
} from './TelegramCommands.js';

// Notifications
export {
  telegramNotifications,
  type DailyBriefingData,
  type EmailAlertData,
  type MeetingReminderData,
  type ApprovalRequestData,
  type TaskReminderData,
} from './TelegramNotifications.js';

// Webhook Handler
export {
  telegramWebhookHandler,
  type TelegramUpdate,
  type TelegramMessage,
  type TelegramCallbackQuery,
  type TelegramInlineQuery,
  type WebhookResult,
} from './TelegramWebhookHandler.js';
