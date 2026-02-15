/**
 * TelegramBot
 * Main Telegram bot setup using Telegraf
 */

import { Telegraf, Context, session } from 'telegraf';
import { message } from 'telegraf/filters';
import { prisma } from '../../database/client.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { incrementRateLimit } from '../../database/redis.js';

// ============================================================================
// Types
// ============================================================================

export interface TelegramConfig {
  botToken: string;
  webhookUrl?: string;
  webhookSecret?: string;
}

export interface TelegramUser {
  telegramId: number;
  username?: string;
  firstName: string;
  lastName?: string;
  languageCode?: string;
}

export interface TelegramSessionData {
  userId?: string;
  isAuthenticated: boolean;
  awaitingInput?: string;
  lastCommand?: string;
  tempData?: Record<string, unknown>;
}

export type TelegramContext = Context & {
  session: TelegramSessionData;
};

export interface BotCommand {
  command: string;
  description: string;
}

// ============================================================================
// Bot Commands Definition
// ============================================================================

export const BOT_COMMANDS: BotCommand[] = [
  { command: 'start', description: 'Start the bot and connect your account' },
  { command: 'today', description: 'Get your daily briefing' },
  { command: 'inbox', description: 'View unread emails summary' },
  { command: 'tasks', description: 'View your pending tasks' },
  { command: 'schedule', description: 'View today\'s calendar' },
  { command: 'search', description: 'Search across all data' },
  { command: 'settings', description: 'Manage your preferences' },
  { command: 'help', description: 'Show available commands' },
];

// ============================================================================
// TelegramBot Class
// ============================================================================

class TelegramBotImpl {
  private bot: Telegraf<TelegramContext> | null = null;
  private isRunning = false;

  /**
   * Initialize the bot
   */
  async initialize(): Promise<void> {
    const botToken = config.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      logger.warn('Telegram bot token not configured, skipping initialization');
      return;
    }

    this.bot = new Telegraf<TelegramContext>(botToken);

    // Set up session middleware
    this.bot.use(session({
      defaultSession: (): TelegramSessionData => ({
        isAuthenticated: false,
      }),
    }));

    // Set up middleware
    this.setupMiddleware();

    // Set up command handlers
    this.setupCommands();

    // Set up message handlers
    this.setupMessageHandlers();

    // Set up error handling
    this.setupErrorHandling();

    logger.info('Telegram bot initialized');
  }

  /**
   * Start the bot (webhook or polling)
   */
  async start(): Promise<void> {
    if (!this.bot) {
      await this.initialize();
    }

    if (!this.bot) {
      logger.warn('Telegram bot not initialized, cannot start');
      return;
    }

    // Set bot commands in Telegram UI
    await this.bot.telegram.setMyCommands(BOT_COMMANDS);

    const webhookUrl = config.telegram?.webhookUrl || process.env.TELEGRAM_WEBHOOK_URL;

    if (webhookUrl) {
      // Use webhook mode
      const webhookSecret = config.telegram?.webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET;

      await this.bot.telegram.setWebhook(webhookUrl, {
        secret_token: webhookSecret,
      });

      logger.info('Telegram bot webhook set', { url: webhookUrl });
    } else {
      // Use polling mode (for development)
      // launch() is long-running, don't await it — let it run in the background
      this.bot.launch().then(() => {
        this.isRunning = true;
      }).catch((err) => {
        logger.error('Telegram bot polling failed', { error: err });
      });

      logger.info('Telegram bot started in polling mode');
    }

    // Enable graceful stop
    process.once('SIGINT', () => this.stop('SIGINT'));
    process.once('SIGTERM', () => this.stop('SIGTERM'));
  }

  /**
   * Stop the bot
   */
  async stop(signal?: string): Promise<void> {
    if (this.bot && this.isRunning) {
      this.bot.stop(signal);
      this.isRunning = false;
      logger.info('Telegram bot stopped');
    }
  }

  /**
   * Get the bot instance for webhook handling
   */
  getBot(): Telegraf<TelegramContext> | null {
    return this.bot;
  }

  /**
   * Handle webhook update
   */
  async handleWebhook(update: unknown, secretToken?: string): Promise<void> {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }

    // Verify secret token if configured
    const expectedSecret = config.telegram?.webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expectedSecret && secretToken !== expectedSecret) {
      throw new Error('Invalid webhook secret');
    }

    await this.bot.handleUpdate(update as Parameters<typeof this.bot.handleUpdate>[0]);
  }

  // ============================================================================
  // Private Setup Methods
  // ============================================================================

  private setupMiddleware(): void {
    if (!this.bot) return;

    // 1. Authentication middleware — lookup linked Edith user
    this.bot.use(async (ctx, next) => {
      const telegramUser = ctx.from;
      if (!telegramUser) {
        return next();
      }

      const linkedUser = await this.findLinkedUser(telegramUser.id);

      if (linkedUser) {
        ctx.session.userId = linkedUser.userId;
        ctx.session.isAuthenticated = true;
      }

      return next();
    });

    // 2. Guard middleware — block unlinked users from everything except /start and /help
    this.bot.use(async (ctx, next) => {
      if (ctx.session.isAuthenticated) {
        return next();
      }

      // Allow /start and /help for unlinked users
      const text = (ctx as unknown as { message?: { text?: string } }).message?.text;
      if (text && (text.startsWith('/start') || text.startsWith('/help'))) {
        return next();
      }

      // Allow callback queries that start with 'link:' for account linking flow
      const callbackData = (ctx as unknown as { callbackQuery?: { data?: string } }).callbackQuery?.data;
      if (callbackData && callbackData.startsWith('link:')) {
        return next();
      }

      // Block everything else
      const telegramId = ctx.from?.id;
      logger.warn('Unauthorized Telegram access attempt', { telegramId, updateType: ctx.updateType });

      if (ctx.callbackQuery) {
        await ctx.answerCbQuery('⛔ Link your account first. Send /start to get started.');
        return;
      }

      await ctx.reply(
        '⛔ Your Telegram account is not linked to Edith.\n\n' +
        'Send /start to connect your account.'
      );
    });

    // 3. Rate limiting middleware — 30 messages per 60 seconds per user
    this.bot.use(async (ctx, next) => {
      const telegramId = ctx.from?.id;
      if (!telegramId) return next();

      const RATE_LIMIT = 30;
      const WINDOW_SECONDS = 60;

      try {
        const { count } = await incrementRateLimit(`telegram:rate:${telegramId}`, WINDOW_SECONDS);

        if (count > RATE_LIMIT) {
          logger.warn('Telegram rate limit exceeded', { telegramId, count });
          await ctx.reply('⚠️ You\'re sending messages too fast. Please wait a moment before trying again.');
          return;
        }
      } catch (error) {
        // Don't block on Redis errors, just log
        logger.error('Rate limit check failed', { telegramId, error });
      }

      return next();
    });

    // 4. Audit logging middleware — log every interaction
    this.bot.use(async (ctx, next) => {
      const start = Date.now();
      const telegramId = ctx.from?.id;
      const updateType = ctx.updateType;
      const isAuthenticated = ctx.session.isAuthenticated;

      try {
        await next();
      } finally {
        const duration = Date.now() - start;

        logger.debug('Telegram request processed', {
          telegramId,
          updateType,
          isAuthenticated,
          duration,
        });

        // Write audit log for authenticated users
        if (ctx.session.userId) {
          prisma.auditLog.create({
            data: {
              userId: ctx.session.userId,
              action: 'TELEGRAM_INTERACTION',
              resource: 'TelegramBot',
              metadata: {
                telegramId,
                updateType,
                duration,
                text: (ctx as unknown as { message?: { text?: string } }).message?.text?.substring(0, 100),
              },
            },
          }).catch((err: unknown) => {
            logger.error('Failed to write Telegram audit log', { error: err });
          });
        }
      }
    });
  }

  private setupCommands(): void {
    if (!this.bot) return;

    // These are placeholders - actual handlers are in TelegramCommands.ts
    // We just set up routing here

    this.bot.command('start', async (ctx) => {
      const { telegramCommands } = await import('./TelegramCommands.js');
      await telegramCommands.handleStart(ctx);
    });

    this.bot.command('today', async (ctx) => {
      const { telegramCommands } = await import('./TelegramCommands.js');
      await telegramCommands.handleToday(ctx);
    });

    this.bot.command('inbox', async (ctx) => {
      const { telegramCommands } = await import('./TelegramCommands.js');
      await telegramCommands.handleInbox(ctx);
    });

    this.bot.command('tasks', async (ctx) => {
      const { telegramCommands } = await import('./TelegramCommands.js');
      await telegramCommands.handleTasks(ctx);
    });

    this.bot.command('schedule', async (ctx) => {
      const { telegramCommands } = await import('./TelegramCommands.js');
      await telegramCommands.handleSchedule(ctx);
    });

    this.bot.command('search', async (ctx) => {
      const { telegramCommands } = await import('./TelegramCommands.js');
      await telegramCommands.handleSearch(ctx);
    });

    this.bot.command('settings', async (ctx) => {
      const { telegramCommands } = await import('./TelegramCommands.js');
      await telegramCommands.handleSettings(ctx);
    });

    this.bot.command('help', async (ctx) => {
      const { telegramCommands } = await import('./TelegramCommands.js');
      await telegramCommands.handleHelp(ctx);
    });
  }

  private setupMessageHandlers(): void {
    if (!this.bot) return;

    // Handle text messages (natural language)
    this.bot.on(message('text'), async (ctx) => {
      const { telegramCommands } = await import('./TelegramCommands.js');
      await telegramCommands.handleText(ctx);
    });

    // Handle voice messages
    this.bot.on(message('voice'), async (ctx) => {
      const { telegramCommands } = await import('./TelegramCommands.js');
      await telegramCommands.handleVoice(ctx);
    });

    // Handle photos (e.g., receipt scanning)
    this.bot.on(message('photo'), async (ctx) => {
      const { telegramCommands } = await import('./TelegramCommands.js');
      await telegramCommands.handlePhoto(ctx);
    });

    // Handle documents
    this.bot.on(message('document'), async (ctx) => {
      const { telegramCommands } = await import('./TelegramCommands.js');
      await telegramCommands.handleDocument(ctx);
    });

    // Handle callback queries (inline buttons)
    this.bot.on('callback_query', async (ctx) => {
      const { telegramCommands } = await import('./TelegramCommands.js');
      await telegramCommands.handleCallback(ctx);
    });
  }

  private setupErrorHandling(): void {
    if (!this.bot) return;

    this.bot.catch((err, ctx) => {
      logger.error('Telegram bot error', {
        error: err,
        updateType: ctx.updateType,
        from: ctx.from?.id,
      });

      // Try to send error message to user
      ctx.reply('Sorry, something went wrong. Please try again.').catch(() => {});
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async findLinkedUser(telegramId: number): Promise<{ userId: string } | null> {
    const integration = await prisma.userIntegration.findFirst({
      where: {
        provider: 'TELEGRAM',
        isActive: true,
        metadata: {
          path: ['telegramId'],
          equals: telegramId,
        },
      },
      select: { userId: true },
    });

    return integration;
  }

  /**
   * Link a Telegram user to an Edith account
   */
  async linkUser(userId: string, telegramUser: TelegramUser): Promise<void> {
    await prisma.userIntegration.upsert({
      where: { userId_provider: { userId, provider: 'TELEGRAM' } },
      update: {
        isActive: true,
        metadata: {
          telegramId: telegramUser.telegramId,
          username: telegramUser.username,
          firstName: telegramUser.firstName,
          lastName: telegramUser.lastName,
          languageCode: telegramUser.languageCode,
        },
      },
      create: {
        userId,
        provider: 'TELEGRAM',
        isActive: true,
        metadata: {
          telegramId: telegramUser.telegramId,
          username: telegramUser.username,
          firstName: telegramUser.firstName,
          lastName: telegramUser.lastName,
          languageCode: telegramUser.languageCode,
        },
      },
    });

    logger.info('Telegram user linked', { userId, telegramId: telegramUser.telegramId });
  }

  /**
   * Unlink a Telegram user from an Edith account
   */
  async unlinkUser(userId: string): Promise<void> {
    await prisma.userIntegration.update({
      where: { userId_provider: { userId, provider: 'TELEGRAM' } },
      data: { isActive: false },
    });

    logger.info('Telegram user unlinked', { userId });
  }

  /**
   * Get Telegram chat ID for a user
   */
  async getChatId(userId: string): Promise<number | null> {
    const integration = await prisma.userIntegration.findUnique({
      where: { userId_provider: { userId, provider: 'TELEGRAM' } },
      select: { metadata: true },
    });

    const metadata = integration?.metadata as Record<string, unknown> | null;
    return (metadata?.telegramId as number) || null;
  }

  /**
   * Send a message to a user
   */
  async sendMessage(userId: string, text: string, options?: {
    parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    replyMarkup?: unknown;
  }): Promise<boolean> {
    if (!this.bot) {
      return false;
    }

    const chatId = await this.getChatId(userId);
    if (!chatId) {
      return false;
    }

    try {
      await this.bot.telegram.sendMessage(chatId, text, {
        parse_mode: options?.parseMode,
        reply_markup: options?.replyMarkup as never,
      });
      return true;
    } catch (error) {
      logger.error('Failed to send Telegram message', { userId, error });
      return false;
    }
  }
}

export const telegramBot = new TelegramBotImpl();
export default telegramBot;
