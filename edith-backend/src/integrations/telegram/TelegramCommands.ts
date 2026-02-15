/**
 * TelegramCommands
 * Command handlers for Telegram bot
 */

import crypto from 'crypto';
import { Markup } from 'telegraf';
import type { TelegramContext } from './TelegramBot.js';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { clearConversation } from '../../database/redis.js';

// ============================================================================
// TelegramCommands Class
// ============================================================================

class TelegramCommandsImpl {
  /**
   * Handle /start command
   */
  async handleStart(ctx: TelegramContext): Promise<void> {
    const user = ctx.from;
    if (!user) return;

    const firstName = user.first_name;

    if (ctx.session.isAuthenticated) {
      await ctx.reply(
        `Welcome back, ${firstName}! 👋\n\n` +
        `I'm Edith, your AI executive assistant. How can I help you today?\n\n` +
        `Use /help to see available commands, or just send me a message.`
      );
      return;
    }

    // User not linked yet - provide linking instructions
    const chatId = ctx.chat?.id || user.id;
    const linkToken = await this.generateLinkToken(user.id, chatId);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const linkUrl = `${frontendUrl}/settings?telegram_token=${linkToken}`;

    // Telegram rejects localhost URLs in inline keyboard buttons,
    // so we send the link as text (works in both dev and prod).
    // In production with an HTTPS URL, we could use an inline button instead.
    await ctx.reply(
      `Hello ${firstName}! 👋\n\n` +
      `I'm Edith, your AI executive assistant. To get started, you need to connect your Edith account.\n\n` +
      `Open this link to connect:\n${linkUrl}\n\n` +
      `The link expires in 10 minutes.`
    );
  }

  /**
   * Handle /today command - Daily briefing
   */
  async handleToday(ctx: TelegramContext): Promise<void> {
    if (!(await this.requireAuth(ctx))) return;

    const userId = ctx.session.userId!;

    await ctx.reply('🌅 *Preparing your daily briefing...*', { parse_mode: 'Markdown' });

    try {
      // In a full implementation, this would:
      // 1. Fetch today's calendar events
      // 2. Fetch today's tasks
      // 3. Get email summary
      // 4. Get weather (optional)

      // Fetch calendar events
      const events = await this.getTodayEvents(userId);
      const tasks = await this.getTodayTasks(userId);
      const emailSummary = await this.getEmailSummary(userId);

      let message = `☀️ *Your Day at a Glance*\n\n`;

      // Calendar section
      message += `📅 *Today's Schedule*\n`;
      if (events.length === 0) {
        message += `No meetings scheduled today.\n`;
      } else {
        for (const event of events.slice(0, 5)) {
          message += `• ${event.time} - ${event.title}\n`;
        }
        if (events.length > 5) {
          message += `_...and ${events.length - 5} more_\n`;
        }
      }

      message += `\n`;

      // Tasks section
      message += `✅ *Tasks Due Today*\n`;
      if (tasks.length === 0) {
        message += `No tasks due today.\n`;
      } else {
        for (const task of tasks.slice(0, 5)) {
          message += `• ${task.priority === 'HIGH' ? '🔴' : '🟡'} ${task.title}\n`;
        }
        if (tasks.length > 5) {
          message += `_...and ${tasks.length - 5} more_\n`;
        }
      }

      message += `\n`;

      // Email section
      message += `📧 *Inbox*\n`;
      message += `${emailSummary.unread} unread emails`;
      if (emailSummary.important > 0) {
        message += ` (${emailSummary.important} important)`;
      }
      message += `\n`;

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('📧 View Inbox', 'view_inbox'),
            Markup.button.callback('📅 Full Schedule', 'view_schedule'),
          ],
          [
            Markup.button.callback('✅ All Tasks', 'view_tasks'),
          ],
        ]),
      });
    } catch (error) {
      logger.error('Failed to generate daily briefing', { userId, error });
      await ctx.reply('Sorry, I couldn\'t generate your briefing. Please try again.');
    }
  }

  /**
   * Handle /inbox command
   */
  async handleInbox(ctx: TelegramContext): Promise<void> {
    if (!(await this.requireAuth(ctx))) return;

    const userId = ctx.session.userId!;

    await ctx.reply('📧 *Fetching your inbox...*', { parse_mode: 'Markdown' });

    try {
      const emails = await this.getRecentEmails(userId);

      if (emails.length === 0) {
        await ctx.reply('Your inbox is empty! 🎉');
        return;
      }

      let message = `📧 *Recent Emails*\n\n`;

      for (const email of emails.slice(0, 5)) {
        const unreadIcon = email.isRead ? '' : '🔵 ';
        const importantIcon = email.isImportant ? '⭐ ' : '';
        message += `${unreadIcon}${importantIcon}*From:* ${email.from}\n`;
        message += `*Subject:* ${email.subject}\n`;
        message += `_${email.snippet}_\n\n`;
      }

      if (emails.length > 5) {
        message += `_...and ${emails.length - 5} more_`;
      }

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('Mark All Read', 'mark_all_read'),
            Markup.button.callback('Refresh', 'refresh_inbox'),
          ],
        ]),
      });
    } catch (error) {
      logger.error('Failed to fetch inbox', { userId, error });
      await ctx.reply('Sorry, I couldn\'t fetch your inbox. Please try again.');
    }
  }

  /**
   * Handle /tasks command
   */
  async handleTasks(ctx: TelegramContext): Promise<void> {
    if (!(await this.requireAuth(ctx))) return;

    const userId = ctx.session.userId!;

    await ctx.reply('✅ *Fetching your tasks...*', { parse_mode: 'Markdown' });

    try {
      const tasks = await this.getAllTasks(userId);

      if (tasks.length === 0) {
        await ctx.reply('No pending tasks! 🎉');
        return;
      }

      let message = `✅ *Your Tasks*\n\n`;

      // Group by priority
      const highPriority = tasks.filter(t => t.priority === 'HIGH');
      const normalPriority = tasks.filter(t => t.priority !== 'HIGH');

      if (highPriority.length > 0) {
        message += `🔴 *High Priority*\n`;
        for (const task of highPriority.slice(0, 3)) {
          message += `• ${task.title}`;
          if (task.dueDate) message += ` (due ${task.dueDate})`;
          message += `\n`;
        }
        message += `\n`;
      }

      if (normalPriority.length > 0) {
        message += `🟡 *Other Tasks*\n`;
        for (const task of normalPriority.slice(0, 5)) {
          message += `• ${task.title}`;
          if (task.dueDate) message += ` (due ${task.dueDate})`;
          message += `\n`;
        }
      }

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('➕ Add Task', 'add_task'),
            Markup.button.callback('🔄 Refresh', 'refresh_tasks'),
          ],
        ]),
      });
    } catch (error) {
      logger.error('Failed to fetch tasks', { userId, error });
      await ctx.reply('Sorry, I couldn\'t fetch your tasks. Please try again.');
    }
  }

  /**
   * Handle /schedule command
   */
  async handleSchedule(ctx: TelegramContext): Promise<void> {
    if (!(await this.requireAuth(ctx))) return;

    const userId = ctx.session.userId!;

    await ctx.reply('📅 *Fetching your schedule...*', { parse_mode: 'Markdown' });

    try {
      const events = await this.getTodayEvents(userId);

      if (events.length === 0) {
        await ctx.reply('No meetings scheduled for today! 📅');
        return;
      }

      let message = `📅 *Today's Schedule*\n\n`;

      for (const event of events) {
        message += `*${event.time}* - ${event.title}\n`;
        if (event.location) message += `📍 ${event.location}\n`;
        if (event.meetingUrl) message += `🔗 [Join Meeting](${event.meetingUrl})\n`;
        message += `\n`;
      }

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('📅 Tomorrow', 'schedule_tomorrow'),
            Markup.button.callback('📅 This Week', 'schedule_week'),
          ],
        ]),
      });
    } catch (error) {
      logger.error('Failed to fetch schedule', { userId, error });
      await ctx.reply('Sorry, I couldn\'t fetch your schedule. Please try again.');
    }
  }

  /**
   * Handle /search command
   */
  async handleSearch(ctx: TelegramContext): Promise<void> {
    if (!(await this.requireAuth(ctx))) return;

    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const query = text.replace('/search', '').trim();

    if (!query) {
      await ctx.reply('What would you like to search for?\n\nUsage: `/search [query]`', {
        parse_mode: 'Markdown',
      });
      ctx.session.awaitingInput = 'search_query';
      return;
    }

    await this.performSearch(ctx, query);
  }

  /**
   * Handle /settings command
   */
  async handleSettings(ctx: TelegramContext): Promise<void> {
    if (!(await this.requireAuth(ctx))) return;

    await ctx.reply(
      '⚙️ *Settings*\n\n' +
      'Configure your Edith preferences:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔔 Notifications', 'settings_notifications')],
          [Markup.button.callback('🌅 Daily Briefing', 'settings_briefing')],
          [Markup.button.callback('🔗 Connected Services', 'settings_services')],
          [Markup.button.callback('🔓 Disconnect', 'settings_disconnect')],
        ]),
      }
    );
  }

  /**
   * Handle /help command
   */
  async handleHelp(ctx: TelegramContext): Promise<void> {
    await ctx.reply(
      '🤖 *Edith Commands*\n\n' +
      '/today - Get your daily briefing\n' +
      '/inbox - View unread emails\n' +
      '/tasks - View pending tasks\n' +
      '/schedule - View today\'s calendar\n' +
      '/search - Search across all data\n' +
      '/new - Start a new conversation\n' +
      '/notifications - Notification settings\n' +
      '/settings - Manage preferences\n' +
      '/help - Show this message\n\n' +
      '_You can also send me natural language messages!_\n' +
      '_I remember our conversation context, so you can refer to previous messages._',
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * Handle /new command - Reset conversation
   */
  async handleNew(ctx: TelegramContext): Promise<void> {
    if (!(await this.requireAuth(ctx))) return;

    const telegramId = ctx.from!.id;
    const sessionId = `telegram:${telegramId}`;

    try {
      await clearConversation(sessionId);
      await ctx.reply('🔄 Conversation reset! I\'ve forgotten our previous context.\n\nHow can I help you?');
    } catch (error) {
      logger.error('Failed to clear conversation', { sessionId, error });
      await ctx.reply('Failed to reset conversation. Please try again.');
    }
  }

  /**
   * Handle /notifications command - Show notification preferences
   */
  async handleNotifications(ctx: TelegramContext): Promise<void> {
    if (!(await this.requireAuth(ctx))) return;

    const userId = ctx.session.userId!;

    try {
      const prefs = await prisma.notificationPreference.findMany({
        where: { userId },
      });

      const TYPES = [
        { type: 'DAILY_BRIEFING', label: 'Ochtend Briefing' },
        { type: 'MEETING_PREP', label: 'Meeting Prep' },
        { type: 'MEETING_REMINDER', label: 'Meeting Reminder' },
        { type: 'EMAIL_ALERT', label: 'Email Alerts' },
        { type: 'EMAIL_DIGEST', label: 'Email Digest' },
        { type: 'TASK_REMINDER', label: 'Taak Reminders' },
        { type: 'APPROVAL_REQUEST', label: 'Goedkeuringen' },
      ];

      const prefMap = new Map(prefs.map(p => [p.type, p]));

      let message = '🔔 *Notification Settings*\n\n';
      for (const t of TYPES) {
        const pref = prefMap.get(t.type);
        const enabled = pref ? pref.enabled : true;
        const channel = pref ? pref.channel : 'IN_APP';
        const statusIcon = enabled ? '✅' : '❌';
        message += `${statusIcon} *${t.label}* → ${channel}\n`;
      }
      message += '\n_Use the buttons below to toggle notifications._';

      const buttons = TYPES.map(t => {
        const pref = prefMap.get(t.type);
        const enabled = pref ? pref.enabled : true;
        return [Markup.button.callback(
          `${enabled ? '❌ Disable' : '✅ Enable'} ${t.label}`,
          `notif_toggle:${t.type}`
        )];
      });

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      });
    } catch (error) {
      logger.error('Failed to show notification settings', { userId, error });
      await ctx.reply('Failed to load notification settings. Please try again.');
    }
  }

  /**
   * Handle plain text messages
   */
  async handleText(ctx: TelegramContext): Promise<void> {
    if (!ctx.message || !('text' in ctx.message)) return;

    // Check for awaiting input
    if (ctx.session.awaitingInput === 'search_query') {
      ctx.session.awaitingInput = undefined;
      await this.performSearch(ctx, ctx.message.text);
      return;
    }

    // Check authentication for general messages
    if (!(await this.requireAuth(ctx))) return;

    const rawText = ctx.message.text;
    const text = this.sanitizeInput(rawText);
    if (!text) return;

    const userId = ctx.session.userId!;
    const sessionId = `telegram:${ctx.from!.id}`;

    // Store interaction
    const interaction = await prisma.telegramInteraction.create({
      data: {
        userId,
        telegramId: String(ctx.from!.id),
        chatId: String(ctx.chat?.id || ctx.from!.id),
        type: 'MESSAGE',
        text,
        status: 'PROCESSING',
      },
    });

    // Send thinking indicator
    await ctx.reply('⏳ Even denken...');

    const startTime = Date.now();

    try {
      const { orchestratorAgent } = await import('../../agents/OrchestratorAgent.js');
      const { auditService } = await import('../../services/AuditService.js');

      // Load user data for proper context (timezone, email, preferences)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true, timezone: true, preferences: true },
      });

      const context = {
        userId,
        userEmail: user?.email,
        userName: user?.name || ctx.from?.first_name,
        timezone: user?.timezone || 'Europe/Amsterdam',
        preferences: (user?.preferences || {}) as Record<string, unknown>,
      };

      const result = await orchestratorAgent.process(context, text, sessionId);

      // Truncate response for Telegram's 4096 char limit
      let response = result.data || result.error || 'Done, but I have no specific response.';
      if (response.length > 4000) {
        response = response.substring(0, 3997) + '...';
      }

      await ctx.reply(response);

      await prisma.telegramInteraction.update({
        where: { id: interaction.id },
        data: { status: 'COMPLETED', response: { text: response } },
      });

      // Log to ActionLog for Activity Log UI
      await auditService.logAgentAction(
        userId,
        'TelegramBot',
        'TELEGRAM_MESSAGE',
        { text: text.substring(0, 200), telegramId: ctx.from!.id },
        { response: response.substring(0, 500) },
        'SUCCESS',
        undefined,
        Date.now() - startTime,
      );
    } catch (error) {
      logger.error('Failed to process message via orchestrator', { userId, error });

      await prisma.telegramInteraction.update({
        where: { id: interaction.id },
        data: { status: 'FAILED' },
      });

      // Log failure to ActionLog
      const { auditService } = await import('../../services/AuditService.js');
      await auditService.logAgentAction(
        userId,
        'TelegramBot',
        'TELEGRAM_MESSAGE',
        { text: text.substring(0, 200), telegramId: ctx.from!.id },
        { error: (error as Error).message },
        'FAILURE',
        undefined,
        Date.now() - startTime,
      ).catch(() => {});

      await ctx.reply('Sorry, I couldn\'t process your request. Please try again.');
    }
  }

  /**
   * Handle voice messages
   */
  async handleVoice(ctx: TelegramContext): Promise<void> {
    if (!(await this.requireAuth(ctx))) return;

    await ctx.reply(
      '🎤 Voice messages received!\n\n' +
      '_Voice transcription coming soon..._',
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * Handle photo messages
   */
  async handlePhoto(ctx: TelegramContext): Promise<void> {
    if (!(await this.requireAuth(ctx))) return;

    await ctx.reply(
      '📷 Photo received!\n\n' +
      '_Image analysis coming soon..._',
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * Handle document messages
   */
  async handleDocument(ctx: TelegramContext): Promise<void> {
    if (!(await this.requireAuth(ctx))) return;

    await ctx.reply(
      '📄 Document received!\n\n' +
      '_Document processing coming soon..._',
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * Handle callback queries (inline buttons)
   */
  async handleCallback(ctx: TelegramContext): Promise<void> {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const data = ctx.callbackQuery.data;

    // Acknowledge the callback
    await ctx.answerCbQuery();

    // Handle parameterized callbacks
    if (data.startsWith('approve:')) {
      await this.handleApproveCallback(ctx, data.split(':')[1]);
      return;
    }
    if (data.startsWith('reject:')) {
      await this.handleRejectCallback(ctx, data.split(':')[1]);
      return;
    }
    if (data.startsWith('modify:')) {
      const approvalId = data.split(':')[1];
      ctx.session.awaitingInput = `modify:${approvalId}`;
      await ctx.reply('Type your modifications:');
      return;
    }
    if (data.startsWith('notif_toggle:')) {
      await this.handleNotificationToggle(ctx, data.replace('notif_toggle:', ''));
      return;
    }
    if (data.startsWith('task_complete_')) {
      await this.handleCompleteTask(ctx, data.replace('task_complete_', ''));
      return;
    }
    if (data.startsWith('email_archive_')) {
      await this.handleArchiveEmail(ctx, data.replace('email_archive_', ''));
      return;
    }
    if (data.startsWith('email_reply_')) {
      const emailId = data.replace('email_reply_', '');
      ctx.session.awaitingInput = `reply_email:${emailId}`;
      await ctx.reply('Type your reply:');
      return;
    }

    switch (data) {
      case 'view_inbox':
        await this.handleInbox(ctx);
        break;
      case 'view_schedule':
        await this.handleSchedule(ctx);
        break;
      case 'view_tasks':
        await this.handleTasks(ctx);
        break;
      case 'refresh_inbox':
        await this.handleInbox(ctx);
        break;
      case 'refresh_tasks':
        await this.handleTasks(ctx);
        break;
      case 'mark_all_read':
        await this.handleMarkAllRead(ctx);
        break;
      case 'archive_read':
        await this.handleArchiveReadEmails(ctx);
        break;
      case 'add_task':
      case 'new_task':
        await ctx.reply('What task would you like to add?');
        ctx.session.awaitingInput = 'new_task';
        break;
      case 'schedule_tomorrow':
        await this.handleScheduleTomorrow(ctx);
        break;
      case 'schedule_week':
        await this.handleScheduleWeek(ctx);
        break;
      case 'dismiss_reminder':
        await ctx.editMessageText('✓ Dismissed');
        break;
      case 'settings_notifications':
        await this.handleNotifications(ctx);
        break;
      case 'settings_briefing':
        await this.handleNotifications(ctx);
        break;
      case 'settings_services':
        await ctx.reply('Connected services: check your Settings page in the web app.');
        break;
      case 'settings_disconnect':
        await ctx.reply(
          '⚠️ Are you sure you want to disconnect your Telegram account?',
          Markup.inlineKeyboard([
            [
              Markup.button.callback('Yes, Disconnect', 'confirm_disconnect'),
              Markup.button.callback('Cancel', 'cancel_disconnect'),
            ],
          ])
        );
        break;
      case 'confirm_disconnect':
        if (ctx.session.userId) {
          await prisma.userIntegration.update({
            where: { userId_provider: { userId: ctx.session.userId, provider: 'TELEGRAM' } },
            data: { isActive: false },
          });
          ctx.session.isAuthenticated = false;
          ctx.session.userId = undefined;
        }
        await ctx.reply('Your account has been disconnected.');
        break;
      case 'cancel_disconnect':
        await ctx.reply('Disconnect cancelled.');
        break;
      default:
        logger.debug('Unknown callback data', { data });
    }
  }

  // ============================================================================
  // Approval Callbacks
  // ============================================================================

  private async handleApproveCallback(ctx: TelegramContext, approvalId: string): Promise<void> {
    if (!ctx.session.userId) return;

    try {
      const { approvalService } = await import('../../services/ApprovalService.js');
      await approvalService.approve(approvalId, ctx.session.userId);

      // Try to execute the approved action
      await this.executeApprovedAction(ctx, approvalId);
    } catch (error) {
      logger.error('Failed to approve', { approvalId, error });
      await ctx.reply('Failed to approve. The request may have expired.');
    }
  }

  private async handleRejectCallback(ctx: TelegramContext, approvalId: string): Promise<void> {
    if (!ctx.session.userId) return;

    try {
      const { approvalService } = await import('../../services/ApprovalService.js');
      await approvalService.reject(approvalId, ctx.session.userId, 'Rejected via Telegram');
      await ctx.editMessageText('❌ Rejected.');
    } catch (error) {
      logger.error('Failed to reject', { approvalId, error });
      await ctx.reply('Failed to reject. The request may have expired.');
    }
  }

  private async executeApprovedAction(ctx: TelegramContext, approvalId: string): Promise<void> {
    const userId = ctx.session.userId!;

    try {
      // Get the approval/notification details
      const notification = await prisma.notification.findFirst({
        where: {
          userId,
          type: 'APPROVAL_REQUEST',
          data: { path: ['approvalId'], equals: approvalId },
        },
      });

      if (!notification) {
        await ctx.editMessageText('✅ Approved! (Action will be processed.)');
        return;
      }

      const data = notification.data as Record<string, unknown>;
      const agentType = data.agentType as string;
      const toolName = data.toolName as string;
      const toolInput = data.toolInput as Record<string, unknown>;

      if (agentType && toolName && toolInput) {
        const { orchestratorAgent } = await import('../../agents/OrchestratorAgent.js');
        const context = { userId, timezone: 'Europe/Amsterdam' };
        const sessionId = `telegram:${ctx.from!.id}`;
        const result = await orchestratorAgent.process(
          context,
          `Execute approved action: ${toolName} with params ${JSON.stringify(toolInput)}`,
          sessionId
        );

        const response = result.data || 'Action executed.';
        await ctx.editMessageText(`✅ Approved and executed!\n\n${response.substring(0, 500)}`);
      } else {
        await ctx.editMessageText('✅ Approved!');
      }
    } catch (error) {
      logger.error('Failed to execute approved action', { approvalId, error });
      await ctx.editMessageText('✅ Approved! (Action execution failed, please retry manually.)');
    }
  }

  // ============================================================================
  // Inline Action Callbacks
  // ============================================================================

  private async handleMarkAllRead(ctx: TelegramContext): Promise<void> {
    if (!ctx.session.userId) return;

    try {
      await prisma.email.updateMany({
        where: { userId: ctx.session.userId, isRead: false },
        data: { isRead: true },
      });
      await ctx.reply('✅ All emails marked as read.');
    } catch (error) {
      logger.error('Failed to mark all read', { error });
      await ctx.reply('Failed to mark emails as read.');
    }
  }

  private async handleArchiveReadEmails(ctx: TelegramContext): Promise<void> {
    if (!ctx.session.userId) return;

    try {
      const result = await prisma.email.updateMany({
        where: { userId: ctx.session.userId, isRead: true, isArchived: false },
        data: { isArchived: true },
      });
      await ctx.reply(`✅ Archived ${result.count} read emails.`);
    } catch (error) {
      logger.error('Failed to archive read emails', { error });
      await ctx.reply('Failed to archive emails.');
    }
  }

  private async handleCompleteTask(ctx: TelegramContext, taskId: string): Promise<void> {
    if (!ctx.session.userId) return;

    try {
      await prisma.task.updateMany({
        where: { id: taskId, userId: ctx.session.userId },
        data: { status: 'DONE', completedAt: new Date() },
      });
      await ctx.reply('✅ Task completed!');
    } catch (error) {
      logger.error('Failed to complete task', { taskId, error });
      await ctx.reply('Failed to complete task.');
    }
  }

  private async handleArchiveEmail(ctx: TelegramContext, emailId: string): Promise<void> {
    if (!ctx.session.userId) return;

    try {
      await prisma.email.updateMany({
        where: { id: emailId, userId: ctx.session.userId },
        data: { isArchived: true },
      });
      await ctx.reply('📁 Email archived.');
    } catch (error) {
      logger.error('Failed to archive email', { emailId, error });
      await ctx.reply('Failed to archive email.');
    }
  }

  private async handleNotificationToggle(ctx: TelegramContext, notifType: string): Promise<void> {
    if (!ctx.session.userId) return;
    const userId = ctx.session.userId;

    try {
      const existing = await prisma.notificationPreference.findUnique({
        where: { userId_type: { userId, type: notifType } },
      });

      if (existing) {
        await prisma.notificationPreference.update({
          where: { id: existing.id },
          data: { enabled: !existing.enabled },
        });
      } else {
        // Create with disabled (was implicitly enabled before)
        await prisma.notificationPreference.create({
          data: { userId, type: notifType, channel: 'TELEGRAM', enabled: false },
        });
      }

      // Refresh the notifications view
      await this.handleNotifications(ctx);
    } catch (error) {
      logger.error('Failed to toggle notification', { notifType, error });
      await ctx.reply('Failed to update notification setting.');
    }
  }

  private async handleScheduleTomorrow(ctx: TelegramContext): Promise<void> {
    if (!ctx.session.userId) return;
    const userId = ctx.session.userId;

    try {
      const tz = await this.getUserTimezone(userId);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);

      const events = await prisma.calendarEvent.findMany({
        where: {
          userId,
          startTime: { gte: tomorrow, lt: dayAfter },
          status: 'CONFIRMED',
        },
        orderBy: { startTime: 'asc' },
      });

      if (events.length === 0) {
        await ctx.reply('📅 No meetings scheduled for tomorrow!');
        return;
      }

      let message = '📅 *Tomorrow\'s Schedule*\n\n';
      for (const event of events) {
        const time = new Date(event.startTime).toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
        });
        message += `*${time}* - ${event.title}\n`;
        if (event.location) message += `📍 ${event.location}\n`;
        message += '\n';
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Failed to fetch tomorrow schedule', { error });
      await ctx.reply('Failed to fetch tomorrow\'s schedule.');
    }
  }

  private async handleScheduleWeek(ctx: TelegramContext): Promise<void> {
    if (!ctx.session.userId) return;
    const userId = ctx.session.userId;

    try {
      const tz = await this.getUserTimezone(userId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const events = await prisma.calendarEvent.findMany({
        where: {
          userId,
          startTime: { gte: today, lt: weekEnd },
          status: 'CONFIRMED',
        },
        orderBy: { startTime: 'asc' },
      });

      if (events.length === 0) {
        await ctx.reply('📅 No meetings this week!');
        return;
      }

      let message = '📅 *This Week*\n\n';
      let currentDay = '';
      for (const event of events) {
        const day = new Date(event.startTime).toLocaleDateString('en-US', {
          weekday: 'long', month: 'short', day: 'numeric', timeZone: tz,
        });
        if (day !== currentDay) {
          currentDay = day;
          message += `\n*${day}*\n`;
        }
        const time = new Date(event.startTime).toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
        });
        message += `  ${time} - ${event.title}\n`;
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Failed to fetch week schedule', { error });
      await ctx.reply('Failed to fetch this week\'s schedule.');
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Hardened auth check — validates session AND verifies user exists in DB
   */
  private async requireAuth(ctx: TelegramContext): Promise<boolean> {
    if (!ctx.session.isAuthenticated || !ctx.session.userId) {
      await ctx.reply(
        '🔒 Please connect your Edith account first.\n\n' +
        'Use /start to get started.'
      );
      return false;
    }

    // Verify user still exists in DB
    const user = await prisma.user.findUnique({
      where: { id: ctx.session.userId },
      select: { id: true },
    });

    if (!user) {
      logger.warn('Telegram session references deleted user', {
        userId: ctx.session.userId,
        telegramId: ctx.from?.id,
      });
      ctx.session.isAuthenticated = false;
      ctx.session.userId = undefined;
      await ctx.reply(
        '⛔ Your account could not be found. Please reconnect.\n\n' +
        'Use /start to link your account again.'
      );
      return false;
    }

    return true;
  }

  /**
   * Sanitize user input before processing
   */
  private sanitizeInput(text: string): string {
    return text
      // Strip control characters except newlines and tabs
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim()
      .substring(0, 4000);
  }

  private async generateLinkToken(telegramId: number, chatId: number): Promise<string> {
    const token = crypto.randomBytes(32).toString('base64url');

    await prisma.telegramLinkToken.create({
      data: {
        token,
        telegramId: String(telegramId),
        chatId: String(chatId),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    return token;
  }

  private async performSearch(ctx: TelegramContext, query: string): Promise<void> {
    // userId will be used in full implementation
    const _userId = ctx.session.userId!;

    await ctx.reply(`🔍 Searching for "${query}"...`);

    // In full implementation, search across emails, calendar, tasks
    await ctx.reply(
      `Search results for "${query}":\n\n` +
      `_Full search functionality coming soon..._`,
      { parse_mode: 'Markdown' }
    );
  }

  // ============================================================================
  // Data Fetching — wired to real services
  // ============================================================================

  /**
   * Get the user's timezone from DB, defaulting to Europe/Amsterdam
   */
  private async getUserTimezone(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return user?.timezone || 'Europe/Amsterdam';
  }

  private async getTodayEvents(userId: string): Promise<Array<{
    time: string;
    title: string;
    location?: string;
    meetingUrl?: string;
  }>> {
    const tz = await this.getUserTimezone(userId);
    const { calendarService } = await import('../../services/CalendarService.js');
    const events = await calendarService.getDayEvents(userId, new Date());
    return events.map((e) => ({
      time: new Date(e.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }),
      title: e.title,
      location: e.location ?? undefined,
      meetingUrl: e.meetingUrl ?? undefined,
    }));
  }

  private async getTodayTasks(userId: string): Promise<Array<{
    title: string;
    priority: string;
    dueDate?: string;
  }>> {
    const tz = await this.getUserTimezone(userId);
    // Calculate end of day in user's timezone
    const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const endOfDay = new Date(nowInTz);
    endOfDay.setHours(23, 59, 59, 999);

    const tasks = await prisma.task.findMany({
      where: {
        userId,
        status: { not: 'DONE' },
        dueDate: { lte: endOfDay },
      },
      orderBy: { dueDate: 'asc' },
      take: 20,
    });

    return tasks.map((t) => ({
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString('nl-NL', { timeZone: tz }) : undefined,
    }));
  }

  private async getAllTasks(userId: string): Promise<Array<{
    title: string;
    priority: string;
    dueDate?: string;
  }>> {
    const tasks = await prisma.task.findMany({
      where: {
        userId,
        status: { not: 'DONE' },
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      take: 20,
    });

    return tasks.map((t) => ({
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString() : undefined,
    }));
  }

  private async getEmailSummary(userId: string): Promise<{ unread: number; important: number }> {
    const { inboxService } = await import('../../services/InboxService.js');
    const stats = await inboxService.getStats(userId);
    const byCategory = stats.byCategory as Record<string, number>;
    return {
      unread: stats.unread,
      important: byCategory['IMPORTANT'] ?? 0,
    };
  }

  private async getRecentEmails(userId: string): Promise<Array<{
    from: string;
    subject: string;
    snippet: string;
    isRead: boolean;
    isImportant: boolean;
  }>> {
    const { inboxService } = await import('../../services/InboxService.js');
    const { emails } = await inboxService.getEmails(userId, {}, { limit: 10 });
    return (emails as Array<{ from: string; subject: string; snippet: string; isRead: boolean; category?: string }>).map((e) => ({
      from: e.from,
      subject: e.subject,
      snippet: e.snippet || '',
      isRead: e.isRead,
      isImportant: e.category === 'IMPORTANT',
    }));
  }
}

export const telegramCommands = new TelegramCommandsImpl();
export default telegramCommands;
