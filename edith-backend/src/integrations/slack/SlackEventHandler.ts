/**
 * SlackEventHandler
 * Handles Slack Events API events (messages, mentions, etc.)
 */

import { prisma } from '../../database/client.js';
import { webhookManager } from '../common/WebhookManager.js';
import { createSlackClient } from './SlackClient.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface SlackEventPayload {
  token: string;
  team_id: string;
  api_app_id: string;
  event: SlackEvent;
  type: 'event_callback' | 'url_verification';
  event_id: string;
  event_time: number;
  authorizations?: Array<{
    enterprise_id: string | null;
    team_id: string;
    user_id: string;
    is_bot: boolean;
  }>;
  // URL verification challenge
  challenge?: string;
}

export type SlackEvent =
  | AppMentionEvent
  | MessageEvent
  | MessageChangedEvent
  | MessageDeletedEvent
  | ReactionAddedEvent
  | ReactionRemovedEvent
  | AppHomeOpenedEvent
  | MemberJoinedChannelEvent
  | ChannelCreatedEvent
  | UserChangeEvent;

export interface AppMentionEvent {
  type: 'app_mention';
  user: string;
  text: string;
  ts: string;
  channel: string;
  event_ts: string;
  thread_ts?: string;
}

export interface MessageEvent {
  type: 'message';
  subtype?: string;
  user?: string;
  text?: string;
  ts: string;
  channel: string;
  channel_type: 'channel' | 'group' | 'im' | 'mpim';
  event_ts: string;
  thread_ts?: string;
  bot_id?: string;
}

export interface MessageChangedEvent {
  type: 'message';
  subtype: 'message_changed';
  message: {
    user: string;
    text: string;
    ts: string;
  };
  channel: string;
  ts: string;
  event_ts: string;
}

export interface MessageDeletedEvent {
  type: 'message';
  subtype: 'message_deleted';
  channel: string;
  ts: string;
  deleted_ts: string;
  event_ts: string;
}

export interface ReactionAddedEvent {
  type: 'reaction_added';
  user: string;
  reaction: string;
  item: {
    type: 'message';
    channel: string;
    ts: string;
  };
  item_user: string;
  event_ts: string;
}

export interface ReactionRemovedEvent {
  type: 'reaction_removed';
  user: string;
  reaction: string;
  item: {
    type: 'message';
    channel: string;
    ts: string;
  };
  item_user: string;
  event_ts: string;
}

export interface AppHomeOpenedEvent {
  type: 'app_home_opened';
  user: string;
  channel: string;
  tab: 'home' | 'messages';
  event_ts: string;
}

export interface MemberJoinedChannelEvent {
  type: 'member_joined_channel';
  user: string;
  channel: string;
  channel_type: 'C' | 'G';
  team: string;
  event_ts: string;
}

export interface ChannelCreatedEvent {
  type: 'channel_created';
  channel: {
    id: string;
    name: string;
    created: number;
    creator: string;
  };
  event_ts: string;
}

export interface UserChangeEvent {
  type: 'user_change';
  user: {
    id: string;
    name: string;
    real_name?: string;
    profile?: {
      status_text?: string;
      status_emoji?: string;
    };
  };
  event_ts: string;
}

export interface EventHandlerResult {
  success: boolean;
  response?: string;
  error?: string;
}

// ============================================================================
// SlackEventHandler Class
// ============================================================================

class SlackEventHandlerImpl {
  /**
   * Handle incoming Slack event
   */
  async handleEvent(
    payload: SlackEventPayload,
    signature: string,
    timestamp: string,
    rawBody: string
  ): Promise<EventHandlerResult> {
    try {
      // URL verification challenge
      if (payload.type === 'url_verification') {
        return {
          success: true,
          response: payload.challenge,
        };
      }

      // Verify signature
      const verification = webhookManager.verifySlackSignature(signature, timestamp, rawBody);
      if (!verification.valid) {
        logger.warn('Invalid Slack signature', { error: verification.error });
        return { success: false, error: 'Invalid signature' };
      }

      // Find user by team ID
      const edithUser = await this.findUserByTeamId(payload.team_id);
      if (!edithUser) {
        logger.warn('No user found for Slack team', { teamId: payload.team_id });
        return { success: false, error: 'User not found' };
      }

      // Route event to appropriate handler
      const event = payload.event;

      switch (event.type) {
        case 'app_mention':
          return this.handleAppMention(edithUser.userId, event as AppMentionEvent);

        case 'message':
          return this.handleMessage(edithUser.userId, event as MessageEvent);

        case 'reaction_added':
          return this.handleReactionAdded(edithUser.userId, event as ReactionAddedEvent);

        case 'reaction_removed':
          return this.handleReactionRemoved(edithUser.userId, event as ReactionRemovedEvent);

        case 'app_home_opened':
          return this.handleAppHomeOpened(edithUser.userId, event as AppHomeOpenedEvent);

        case 'member_joined_channel':
          return this.handleMemberJoinedChannel(edithUser.userId, event as MemberJoinedChannelEvent);

        case 'channel_created':
          return this.handleChannelCreated(edithUser.userId, event as ChannelCreatedEvent);

        case 'user_change':
          return this.handleUserChange(edithUser.userId, event as UserChangeEvent);

        default:
          logger.debug('Unhandled Slack event type', { type: (event as SlackEvent).type });
          return { success: true };
      }
    } catch (error) {
      logger.error('Slack event handling failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async handleAppMention(userId: string, event: AppMentionEvent): Promise<EventHandlerResult> {
    logger.info('App mention received', {
      userId,
      channel: event.channel,
      text: event.text.substring(0, 100),
    });

    try {
      const client = await createSlackClient(userId);
      if (!client) {
        return { success: false, error: 'Slack client not available' };
      }

      // Extract the message text (remove the bot mention)
      const messageText = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

      // Queue this for processing by the orchestrator agent
      // For now, we'll send a simple acknowledgment
      await client.addReaction(event.channel, event.ts, 'eyes');

      // In a full implementation, this would:
      // 1. Parse the message for intent
      // 2. Route to the appropriate agent
      // 3. Send back the response

      // Store the interaction for later processing
      await this.storeInteraction(userId, {
        type: 'app_mention',
        channel: event.channel,
        slackUserId: event.user,
        text: messageText,
        timestamp: event.ts,
        threadTs: event.thread_ts,
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to handle app mention', { userId, error });
      return { success: false, error: 'Failed to handle mention' };
    }
  }

  private async handleMessage(userId: string, event: MessageEvent): Promise<EventHandlerResult> {
    // Ignore bot messages and subtypes (edits, deletes, etc.)
    if (event.bot_id || event.subtype) {
      return { success: true };
    }

    // Only handle DMs to the bot
    if (event.channel_type !== 'im') {
      return { success: true };
    }

    logger.info('DM received', {
      userId,
      channel: event.channel,
      from: event.user,
    });

    try {
      const client = await createSlackClient(userId);
      if (!client) {
        return { success: false, error: 'Slack client not available' };
      }

      // Acknowledge receipt
      await client.addReaction(event.channel, event.ts, 'robot_face');

      // Store for processing
      await this.storeInteraction(userId, {
        type: 'direct_message',
        channel: event.channel,
        slackUserId: event.user || '',
        text: event.text || '',
        timestamp: event.ts,
        threadTs: event.thread_ts,
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to handle message', { userId, error });
      return { success: false, error: 'Failed to handle message' };
    }
  }

  private async handleReactionAdded(userId: string, event: ReactionAddedEvent): Promise<EventHandlerResult> {
    // Handle special reactions that trigger actions
    // e.g., :white_check_mark: to mark task complete
    // :calendar: to add to calendar

    logger.debug('Reaction added', {
      userId,
      reaction: event.reaction,
      channel: event.item.channel,
    });

    // Special reactions handling
    const actionReactions: Record<string, string> = {
      'white_check_mark': 'mark_complete',
      'calendar': 'add_to_calendar',
      'email': 'send_email',
      'bookmark': 'save_for_later',
    };

    const action = actionReactions[event.reaction];
    if (action) {
      await this.storeInteraction(userId, {
        type: 'reaction_action',
        action,
        channel: event.item.channel,
        slackUserId: event.user,
        text: '',
        timestamp: event.item.ts,
      });
    }

    return { success: true };
  }

  private async handleReactionRemoved(userId: string, event: ReactionRemovedEvent): Promise<EventHandlerResult> {
    logger.debug('Reaction removed', {
      userId,
      reaction: event.reaction,
      channel: event.item.channel,
    });

    return { success: true };
  }

  private async handleAppHomeOpened(userId: string, event: AppHomeOpenedEvent): Promise<EventHandlerResult> {
    if (event.tab !== 'home') {
      return { success: true };
    }

    logger.info('App home opened', { userId, slackUser: event.user });

    try {
      const client = await createSlackClient(userId);
      if (!client) {
        return { success: false, error: 'Slack client not available' };
      }

      // In a full implementation, publish a home tab view
      // with the user's daily briefing, tasks, etc.

      return { success: true };
    } catch (error) {
      logger.error('Failed to handle app home opened', { userId, error });
      return { success: false, error: 'Failed to update home tab' };
    }
  }

  private async handleMemberJoinedChannel(
    userId: string,
    event: MemberJoinedChannelEvent
  ): Promise<EventHandlerResult> {
    logger.debug('Member joined channel', {
      userId,
      member: event.user,
      channel: event.channel,
    });

    // Could update local channel membership cache here

    return { success: true };
  }

  private async handleChannelCreated(userId: string, event: ChannelCreatedEvent): Promise<EventHandlerResult> {
    logger.debug('Channel created', {
      userId,
      channel: event.channel.name,
    });

    // Could add channel to local cache here

    return { success: true };
  }

  private async handleUserChange(userId: string, event: UserChangeEvent): Promise<EventHandlerResult> {
    logger.debug('User changed', {
      userId,
      slackUser: event.user.id,
    });

    // Update local user cache
    try {
      await prisma.slackMember.updateMany({
        where: {
          userId,
          externalId: event.user.id,
        },
        data: {
          name: event.user.name,
          realName: event.user.real_name,
          statusText: event.user.profile?.status_text,
          statusEmoji: event.user.profile?.status_emoji,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to update user', { userId, error });
    }

    return { success: true };
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

  private async storeInteraction(
    userId: string,
    interaction: {
      type: string;
      channel: string;
      slackUserId: string;
      text: string;
      timestamp: string;
      threadTs?: string;
      action?: string;
    }
  ): Promise<void> {
    // Store interaction for processing
    // This could go to a queue or a pending interactions table
    await prisma.slackInteraction.create({
      data: {
        userId,
        type: interaction.type,
        channelId: interaction.channel,
        slackUserId: interaction.slackUserId,
        text: interaction.text,
        timestamp: interaction.timestamp,
        threadTs: interaction.threadTs,
        action: interaction.action,
        status: 'PENDING',
      },
    });
  }
}

export const slackEventHandler = new SlackEventHandlerImpl();
export default slackEventHandler;
