/**
 * TelegramWebhookHandler
 * Handles Telegram webhook updates
 */

import { telegramBot } from './TelegramBot.js';
import { webhookManager } from '../common/WebhookManager.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  inline_query?: TelegramInlineQuery;
  chosen_inline_result?: TelegramChosenInlineResult;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  date: number;
  chat: TelegramChat;
  text?: string;
  entities?: TelegramMessageEntity[];
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  voice?: TelegramVoice;
  video?: TelegramVideo;
  reply_to_message?: TelegramMessage;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVideo {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  inline_message_id?: string;
  chat_instance: string;
  data?: string;
}

export interface TelegramInlineQuery {
  id: string;
  from: TelegramUser;
  query: string;
  offset: string;
}

export interface TelegramChosenInlineResult {
  result_id: string;
  from: TelegramUser;
  query: string;
  inline_message_id?: string;
}

export interface WebhookResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// TelegramWebhookHandler Class
// ============================================================================

class TelegramWebhookHandlerImpl {
  /**
   * Handle incoming webhook update
   */
  async handleUpdate(
    update: TelegramUpdate,
    secretToken?: string
  ): Promise<WebhookResult> {
    try {
      // Verify secret token
      const verification = webhookManager.verifyTelegramSecret(secretToken || '');
      if (!verification.valid) {
        logger.warn('Invalid Telegram webhook secret', { error: verification.error });
        return { success: false, error: 'Invalid secret token' };
      }

      logger.debug('Telegram update received', {
        updateId: update.update_id,
        type: this.getUpdateType(update),
      });

      // Pass to bot for handling
      await telegramBot.handleWebhook(update, secretToken);

      return { success: true };
    } catch (error) {
      logger.error('Telegram webhook handling failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Verify webhook is set up correctly
   */
  async verifyWebhook(): Promise<{
    url: string | null;
    hasCustomCertificate: boolean;
    pendingUpdateCount: number;
    lastErrorDate?: Date;
    lastErrorMessage?: string;
  } | null> {
    try {
      const bot = telegramBot.getBot();
      if (!bot) {
        return null;
      }

      const info = await bot.telegram.getWebhookInfo();

      return {
        url: info.url || null,
        hasCustomCertificate: info.has_custom_certificate || false,
        pendingUpdateCount: info.pending_update_count || 0,
        lastErrorDate: info.last_error_date
          ? new Date(info.last_error_date * 1000)
          : undefined,
        lastErrorMessage: info.last_error_message,
      };
    } catch (error) {
      logger.error('Failed to get webhook info', { error });
      return null;
    }
  }

  /**
   * Set webhook URL
   */
  async setWebhook(url: string, secretToken?: string): Promise<boolean> {
    try {
      const bot = telegramBot.getBot();
      if (!bot) {
        throw new Error('Bot not initialized');
      }

      await bot.telegram.setWebhook(url, {
        secret_token: secretToken,
      });

      logger.info('Telegram webhook set', { url });
      return true;
    } catch (error) {
      logger.error('Failed to set webhook', { error, url });
      return false;
    }
  }

  /**
   * Remove webhook
   */
  async removeWebhook(): Promise<boolean> {
    try {
      const bot = telegramBot.getBot();
      if (!bot) {
        throw new Error('Bot not initialized');
      }

      await bot.telegram.deleteWebhook();

      logger.info('Telegram webhook removed');
      return true;
    } catch (error) {
      logger.error('Failed to remove webhook', { error });
      return false;
    }
  }

  /**
   * Get pending updates (for polling mode or debugging)
   */
  async getPendingUpdates(
    limit: number = 100,
    offset?: number
  ): Promise<TelegramUpdate[]> {
    try {
      const bot = telegramBot.getBot();
      if (!bot) {
        return [];
      }

      // Telegraf's getUpdates has specific signature
      const updates = await (bot.telegram as unknown as {
        getUpdates: (offset?: number, limit?: number, timeout?: number, allowedUpdates?: string[]) => Promise<unknown[]>;
      }).getUpdates(offset, limit, 0, []);
      return updates as unknown as TelegramUpdate[];
    } catch (error) {
      logger.error('Failed to get updates', { error });
      return [];
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private getUpdateType(update: TelegramUpdate): string {
    if (update.message) return 'message';
    if (update.edited_message) return 'edited_message';
    if (update.channel_post) return 'channel_post';
    if (update.edited_channel_post) return 'edited_channel_post';
    if (update.callback_query) return 'callback_query';
    if (update.inline_query) return 'inline_query';
    if (update.chosen_inline_result) return 'chosen_inline_result';
    return 'unknown';
  }

  /**
   * Parse message text and extract command if present
   */
  parseCommand(message: TelegramMessage): {
    command: string | null;
    args: string;
    botMentioned: boolean;
  } {
    if (!message.text) {
      return { command: null, args: '', botMentioned: false };
    }

    const text = message.text;
    const entities = message.entities || [];

    // Check for bot_command entity
    const commandEntity = entities.find(e => e.type === 'bot_command' && e.offset === 0);

    if (!commandEntity) {
      return { command: null, args: text, botMentioned: false };
    }

    const commandText = text.substring(0, commandEntity.length);
    const args = text.substring(commandEntity.length).trim();

    // Parse command (remove @botname if present)
    const [command, botName] = commandText.substring(1).split('@');

    return {
      command,
      args,
      botMentioned: !!botName,
    };
  }

  /**
   * Check if message is from a private chat
   */
  isPrivateChat(message: TelegramMessage): boolean {
    return message.chat.type === 'private';
  }

  /**
   * Check if message is from a group
   */
  isGroupChat(message: TelegramMessage): boolean {
    return message.chat.type === 'group' || message.chat.type === 'supergroup';
  }

  /**
   * Check if message mentions the bot
   */
  mentionsBot(message: TelegramMessage, botUsername: string): boolean {
    if (!message.text || !message.entities) {
      return false;
    }

    return message.entities.some(
      e => e.type === 'mention' &&
           message.text!.substring(e.offset, e.offset + e.length).toLowerCase() ===
             `@${botUsername.toLowerCase()}`
    );
  }
}

export const telegramWebhookHandler = new TelegramWebhookHandlerImpl();
export default telegramWebhookHandler;
