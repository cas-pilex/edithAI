/**
 * SlackBotHandler
 * Handles Slack slash commands, interactive components, and shortcuts
 */

import { prisma } from '../../database/client.js';
import { webhookManager } from '../common/WebhookManager.js';
import { logger } from '../../utils/logger.js';
import type { Block, KnownBlock } from '@slack/web-api';

// ============================================================================
// Types
// ============================================================================

export interface SlashCommand {
  token: string;
  team_id: string;
  team_domain: string;
  enterprise_id?: string;
  enterprise_name?: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  api_app_id: string;
  is_enterprise_install?: string;
  response_url: string;
  trigger_id: string;
}

export interface SlashCommandResponse {
  response_type?: 'in_channel' | 'ephemeral';
  text?: string;
  blocks?: (Block | KnownBlock)[];
  attachments?: Array<Record<string, unknown>>;
  replace_original?: boolean;
  delete_original?: boolean;
}

export interface InteractivePayload {
  type: 'block_actions' | 'shortcut' | 'message_action' | 'view_submission' | 'view_closed';
  user: {
    id: string;
    username: string;
    team_id: string;
  };
  team: {
    id: string;
    domain: string;
  };
  channel?: {
    id: string;
    name: string;
  };
  trigger_id: string;
  response_url?: string;
  actions?: Array<{
    type: string;
    action_id: string;
    block_id?: string;
    value?: string;
    selected_option?: {
      value: string;
      text: { text: string };
    };
  }>;
  view?: {
    id: string;
    type: string;
    callback_id: string;
    state?: {
      values: Record<string, Record<string, { value?: string; selected_option?: { value: string } }>>;
    };
  };
  message?: {
    ts: string;
    text: string;
  };
}

// ============================================================================
// SlackBotHandler Class
// ============================================================================

class SlackBotHandlerImpl {
  /**
   * Handle slash command
   */
  async handleSlashCommand(
    command: SlashCommand,
    signature: string,
    timestamp: string,
    rawBody: string
  ): Promise<SlashCommandResponse> {
    try {
      // Verify signature
      const verification = webhookManager.verifySlackSignature(signature, timestamp, rawBody);
      if (!verification.valid) {
        logger.warn('Invalid Slack signature for slash command', { error: verification.error });
        return { text: 'Authentication failed' };
      }

      // Find user
      const edithUser = await this.findUserByTeamId(command.team_id);
      if (!edithUser) {
        return {
          response_type: 'ephemeral',
          text: 'Your Slack workspace is not connected to Edith. Please set up the integration first.',
        };
      }

      // Route to appropriate handler based on command
      switch (command.command) {
        case '/edith':
          return this.handleEdithCommand(edithUser.userId, command);

        case '/edith-today':
        case '/today':
          return this.handleTodayCommand(edithUser.userId, command);

        case '/edith-inbox':
        case '/inbox':
          return this.handleInboxCommand(edithUser.userId, command);

        case '/edith-tasks':
        case '/tasks':
          return this.handleTasksCommand(edithUser.userId, command);

        case '/edith-schedule':
        case '/schedule':
          return this.handleScheduleCommand(edithUser.userId, command);

        case '/edith-help':
        case '/help':
          return this.handleHelpCommand();

        default:
          return {
            response_type: 'ephemeral',
            text: `Unknown command: ${command.command}`,
          };
      }
    } catch (error) {
      logger.error('Slash command handling failed', { error, command: command.command });
      return {
        response_type: 'ephemeral',
        text: 'Something went wrong. Please try again.',
      };
    }
  }

  /**
   * Handle interactive component (button, select, etc.)
   */
  async handleInteractive(
    payload: InteractivePayload,
    signature: string,
    timestamp: string,
    rawBody: string
  ): Promise<SlashCommandResponse | null> {
    try {
      // Verify signature
      const verification = webhookManager.verifySlackSignature(signature, timestamp, rawBody);
      if (!verification.valid) {
        logger.warn('Invalid Slack signature for interactive', { error: verification.error });
        return null;
      }

      const edithUser = await this.findUserByTeamId(payload.team.id);
      if (!edithUser) {
        return null;
      }

      switch (payload.type) {
        case 'block_actions':
          return this.handleBlockAction(edithUser.userId, payload);

        case 'view_submission':
          return this.handleViewSubmission(edithUser.userId, payload);

        case 'shortcut':
        case 'message_action':
          return this.handleShortcut(edithUser.userId, payload);

        default:
          return null;
      }
    } catch (error) {
      logger.error('Interactive handling failed', { error });
      return null;
    }
  }

  // ============================================================================
  // Command Handlers
  // ============================================================================

  private async handleEdithCommand(userId: string, command: SlashCommand): Promise<SlashCommandResponse> {
    const query = command.text.trim();

    if (!query) {
      return {
        response_type: 'ephemeral',
        text: 'What can I help you with? Try `/edith [your request]`',
      };
    }

    // Store the request for processing
    await prisma.slackInteraction.create({
      data: {
        userId,
        type: 'slash_command',
        channelId: command.channel_id,
        slackUserId: command.user_id,
        text: query,
        timestamp: Date.now().toString(),
        responseUrl: command.response_url,
        triggerId: command.trigger_id,
        status: 'PENDING',
      },
    });

    // Immediate acknowledgment
    return {
      response_type: 'ephemeral',
      text: ':robot_face: Processing your request...',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:robot_face: *Got it!* I'm working on: "${query}"`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'I\'ll get back to you shortly with a response.',
            },
          ],
        },
      ],
    };
  }

  private async handleTodayCommand(userId: string, command: SlashCommand): Promise<SlashCommandResponse> {
    // In a full implementation, this would:
    // 1. Fetch today's calendar events
    // 2. Fetch today's tasks
    // 3. Get email summary
    // 4. Format into blocks

    const blocks: KnownBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':sunny: Your Day at a Glance',
          emoji: true,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Fetching your daily briefing...*',
        },
      },
    ];

    // Queue the actual data fetch
    await prisma.slackInteraction.create({
      data: {
        userId,
        type: 'daily_briefing',
        channelId: command.channel_id,
        slackUserId: command.user_id,
        text: '',
        timestamp: Date.now().toString(),
        responseUrl: command.response_url,
        status: 'PENDING',
      },
    });

    return {
      response_type: 'ephemeral',
      blocks,
    };
  }

  private async handleInboxCommand(userId: string, command: SlashCommand): Promise<SlashCommandResponse> {
    const blocks: KnownBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':email: Inbox Summary',
          emoji: true,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Fetching your unread emails...*',
        },
      },
    ];

    await prisma.slackInteraction.create({
      data: {
        userId,
        type: 'inbox_summary',
        channelId: command.channel_id,
        slackUserId: command.user_id,
        text: '',
        timestamp: Date.now().toString(),
        responseUrl: command.response_url,
        status: 'PENDING',
      },
    });

    return {
      response_type: 'ephemeral',
      blocks,
    };
  }

  private async handleTasksCommand(userId: string, command: SlashCommand): Promise<SlashCommandResponse> {
    const blocks: KnownBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':white_check_mark: Your Tasks',
          emoji: true,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Fetching your pending tasks...*',
        },
      },
    ];

    await prisma.slackInteraction.create({
      data: {
        userId,
        type: 'tasks_list',
        channelId: command.channel_id,
        slackUserId: command.user_id,
        text: '',
        timestamp: Date.now().toString(),
        responseUrl: command.response_url,
        status: 'PENDING',
      },
    });

    return {
      response_type: 'ephemeral',
      blocks,
    };
  }

  private async handleScheduleCommand(userId: string, command: SlashCommand): Promise<SlashCommandResponse> {
    const blocks: KnownBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':calendar: Today\'s Schedule',
          emoji: true,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Fetching your calendar...*',
        },
      },
    ];

    await prisma.slackInteraction.create({
      data: {
        userId,
        type: 'schedule',
        channelId: command.channel_id,
        slackUserId: command.user_id,
        text: '',
        timestamp: Date.now().toString(),
        responseUrl: command.response_url,
        status: 'PENDING',
      },
    });

    return {
      response_type: 'ephemeral',
      blocks,
    };
  }

  private handleHelpCommand(): SlashCommandResponse {
    return {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: ':robot_face: Edith Commands',
            emoji: true,
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Available Commands:*',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              '`/edith [request]` - Ask Edith anything',
              '`/today` - Get your daily briefing',
              '`/inbox` - View unread email summary',
              '`/tasks` - View your pending tasks',
              '`/schedule` - View today\'s calendar',
              '`/help` - Show this help message',
            ].join('\n'),
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'You can also mention @Edith in any channel to ask questions.',
            },
          ],
        },
      ],
    };
  }

  // ============================================================================
  // Interactive Handlers
  // ============================================================================

  private async handleBlockAction(
    userId: string,
    payload: InteractivePayload
  ): Promise<SlashCommandResponse | null> {
    if (!payload.actions || payload.actions.length === 0) {
      return null;
    }

    const action = payload.actions[0];
    const actionId = action.action_id;

    logger.info('Block action received', { userId, actionId });

    // Handle different action types
    if (actionId.startsWith('task_complete_')) {
      const taskId = actionId.replace('task_complete_', '');
      return this.handleTaskComplete(userId, taskId);
    }

    if (actionId.startsWith('email_archive_')) {
      const emailId = actionId.replace('email_archive_', '');
      return this.handleEmailArchive(userId, emailId);
    }

    if (actionId.startsWith('event_accept_')) {
      const eventId = actionId.replace('event_accept_', '');
      return this.handleEventAccept(userId, eventId);
    }

    if (actionId.startsWith('event_decline_')) {
      const eventId = actionId.replace('event_decline_', '');
      return this.handleEventDecline(userId, eventId);
    }

    return null;
  }

  private async handleViewSubmission(
    userId: string,
    payload: InteractivePayload
  ): Promise<SlashCommandResponse | null> {
    if (!payload.view) {
      return null;
    }

    const callbackId = payload.view.callback_id;

    logger.info('View submission received', { userId, callbackId });

    // Handle different modal submissions
    // e.g., task creation, event creation, etc.

    return null;
  }

  private async handleShortcut(
    userId: string,
    payload: InteractivePayload
  ): Promise<SlashCommandResponse | null> {
    logger.info('Shortcut received', { userId, type: payload.type });

    // Handle global shortcuts and message shortcuts
    // These can open modals for quick actions

    return null;
  }

  // ============================================================================
  // Action Handlers
  // ============================================================================

  private async handleTaskComplete(userId: string, taskId: string): Promise<SlashCommandResponse> {
    // Mark task as complete
    // In full implementation, would call TaskService

    return {
      replace_original: true,
      text: `:white_check_mark: Task marked as complete!`,
    };
  }

  private async handleEmailArchive(userId: string, emailId: string): Promise<SlashCommandResponse> {
    // Archive email
    // In full implementation, would call GmailClient

    return {
      replace_original: true,
      text: `:file_folder: Email archived!`,
    };
  }

  private async handleEventAccept(userId: string, eventId: string): Promise<SlashCommandResponse> {
    // Accept calendar event
    // In full implementation, would call CalendarClient

    return {
      replace_original: true,
      text: `:calendar: Event accepted!`,
    };
  }

  private async handleEventDecline(userId: string, eventId: string): Promise<SlashCommandResponse> {
    // Decline calendar event

    return {
      replace_original: true,
      text: `:calendar: Event declined.`,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async findUserByTeamId(teamId: string): Promise<{ userId: string } | null> {
    const integration = await prisma.userIntegration.findFirst({
      where: {
        provider: 'SLACK',
        isActive: true,
        metadata: {
          path: ['teamId'],
          equals: teamId,
        },
      },
      select: { userId: true },
    });

    return integration;
  }

  /**
   * Send a delayed response using response_url
   */
  async sendDelayedResponse(
    responseUrl: string,
    response: SlashCommandResponse
  ): Promise<void> {
    try {
      const res = await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      });

      if (!res.ok) {
        throw new Error(`Failed to send delayed response: ${res.status}`);
      }
    } catch (error) {
      logger.error('Failed to send delayed response', { error });
    }
  }
}

export const slackBotHandler = new SlackBotHandlerImpl();
export default slackBotHandler;
