/**
 * SlackClient
 * Main Slack API client for messaging, status, and workspace operations
 */

import { WebClient, type ChatPostMessageArguments, type Block, type KnownBlock } from '@slack/web-api';
import { slackOAuthClient, type SlackCredentials } from './SlackOAuthClient.js';
import { rateLimiter } from '../common/RateLimiter.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  isMember: boolean;
  topic?: string;
  purpose?: string;
  memberCount?: number;
}

export interface SlackUser {
  id: string;
  name: string;
  realName: string;
  email?: string;
  isBot: boolean;
  isAdmin: boolean;
  status?: {
    text: string;
    emoji: string;
    expiration?: number;
  };
  profile?: {
    title?: string;
    phone?: string;
    image?: string;
  };
}

export interface SlackMessage {
  ts: string;
  text: string;
  userId: string;
  channelId: string;
  threadTs?: string;
  reactions?: Array<{
    name: string;
    count: number;
    users: string[];
  }>;
  files?: Array<{
    id: string;
    name: string;
    url: string;
    mimetype: string;
  }>;
  blocks?: (Block | KnownBlock)[];
}

export interface SlackDndStatus {
  dndEnabled: boolean;
  nextDndStartTs?: number;
  nextDndEndTs?: number;
  snoozeEnabled: boolean;
  snoozeEndtime?: number;
}

export interface SendMessageOptions {
  blocks?: (Block | KnownBlock)[];
  threadTs?: string;
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
  mrkdwn?: boolean;
}

// ============================================================================
// ISlackClient Interface
// ============================================================================

export interface ISlackClient {
  // Messaging
  sendMessage(channel: string, text: string, options?: SendMessageOptions): Promise<string>;
  sendDM(userId: string, text: string, options?: SendMessageOptions): Promise<string>;
  postEphemeral(channel: string, userId: string, text: string, options?: Omit<SendMessageOptions, 'threadTs'>): Promise<void>;
  updateMessage(channel: string, ts: string, text: string, options?: Omit<SendMessageOptions, 'threadTs'>): Promise<void>;
  deleteMessage(channel: string, ts: string): Promise<void>;

  // Status & DND
  setStatus(emoji: string, text: string, expiration?: number): Promise<void>;
  clearStatus(): Promise<void>;
  setDnd(numMinutes: number): Promise<SlackDndStatus>;
  endDnd(): Promise<void>;
  getDndStatus(): Promise<SlackDndStatus>;

  // Reactions
  addReaction(channel: string, timestamp: string, emoji: string): Promise<void>;
  removeReaction(channel: string, timestamp: string, emoji: string): Promise<void>;

  // Data retrieval
  getChannels(excludeArchived?: boolean): Promise<SlackChannel[]>;
  getUsers(includeDeactivated?: boolean): Promise<SlackUser[]>;
  getMessages(channel: string, limit?: number): Promise<SlackMessage[]>;
  getThreadReplies(channel: string, threadTs: string): Promise<SlackMessage[]>;
  getUserInfo(userId: string): Promise<SlackUser | null>;
  searchMessages(query: string, limit?: number): Promise<SlackMessage[]>;
}

// ============================================================================
// RealSlackClient Implementation
// ============================================================================

export class RealSlackClient implements ISlackClient {
  private botClient: WebClient;
  private userClient: WebClient | null;
  private userId: string;
  private _teamId: string;

  constructor(
    credentials: SlackCredentials,
    private edithUserId: string // Our internal user ID
  ) {
    this.botClient = new WebClient(credentials.botToken);
    this.userClient = credentials.userToken ? new WebClient(credentials.userToken) : null;
    this.userId = credentials.userId;
    this._teamId = credentials.teamId;
  }

  // ============================================================================
  // Messaging
  // ============================================================================

  async sendMessage(channel: string, text: string, options?: SendMessageOptions): Promise<string> {
    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'sendMessage', async () => {
      const args: ChatPostMessageArguments = {
        channel,
        text,
        blocks: options?.blocks,
        thread_ts: options?.threadTs,
        unfurl_links: options?.unfurlLinks ?? true,
        unfurl_media: options?.unfurlMedia ?? true,
        mrkdwn: options?.mrkdwn ?? true,
      };

      const result = await this.botClient.chat.postMessage(args);

      if (!result.ok || !result.ts) {
        throw new Error(`Failed to send message: ${result.error}`);
      }

      return result.ts;
    });
  }

  async sendDM(userId: string, text: string, options?: SendMessageOptions): Promise<string> {
    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'sendDM', async () => {
      // Open DM channel first
      const conversation = await this.botClient.conversations.open({
        users: userId,
      });

      if (!conversation.ok || !conversation.channel?.id) {
        throw new Error('Failed to open DM channel');
      }

      return this.sendMessage(conversation.channel.id, text, options);
    });
  }

  async postEphemeral(
    channel: string,
    userId: string,
    text: string,
    options?: Omit<SendMessageOptions, 'threadTs'>
  ): Promise<void> {
    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'postEphemeral', async () => {
      const result = await this.botClient.chat.postEphemeral({
        channel,
        user: userId,
        text,
        blocks: options?.blocks,
      });

      if (!result.ok) {
        throw new Error(`Failed to post ephemeral: ${result.error}`);
      }
    });
  }

  async updateMessage(
    channel: string,
    ts: string,
    text: string,
    options?: Omit<SendMessageOptions, 'threadTs'>
  ): Promise<void> {
    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'updateMessage', async () => {
      const result = await this.botClient.chat.update({
        channel,
        ts,
        text,
        blocks: options?.blocks,
      });

      if (!result.ok) {
        throw new Error(`Failed to update message: ${result.error}`);
      }
    });
  }

  async deleteMessage(channel: string, ts: string): Promise<void> {
    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'deleteMessage', async () => {
      const result = await this.botClient.chat.delete({
        channel,
        ts,
      });

      if (!result.ok) {
        throw new Error(`Failed to delete message: ${result.error}`);
      }
    });
  }

  // ============================================================================
  // Status & DND
  // ============================================================================

  async setStatus(emoji: string, text: string, expiration?: number): Promise<void> {
    if (!this.userClient) {
      throw new Error('User token required for status operations');
    }

    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'setStatus', async () => {
      const result = await this.userClient!.users.profile.set({
        profile: {
          status_emoji: emoji,
          status_text: text,
          status_expiration: expiration || 0,
        },
      });

      if (!result.ok) {
        throw new Error(`Failed to set status: ${result.error}`);
      }
    });
  }

  async clearStatus(): Promise<void> {
    return this.setStatus('', '', 0);
  }

  async setDnd(numMinutes: number): Promise<SlackDndStatus> {
    if (!this.userClient) {
      throw new Error('User token required for DND operations');
    }

    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'setDnd', async () => {
      const result = await this.userClient!.dnd.setSnooze({
        num_minutes: numMinutes,
      }) as { ok: boolean; error?: string; snooze_enabled?: boolean; snooze_endtime?: number };

      if (!result.ok) {
        throw new Error(`Failed to set DND: ${result.error}`);
      }

      return {
        dndEnabled: true,
        snoozeEnabled: result.snooze_enabled || false,
        snoozeEndtime: result.snooze_endtime,
      };
    });
  }

  async endDnd(): Promise<void> {
    if (!this.userClient) {
      throw new Error('User token required for DND operations');
    }

    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'endDnd', async () => {
      const result = await this.userClient!.dnd.endSnooze();

      if (!result.ok) {
        throw new Error(`Failed to end DND: ${result.error}`);
      }
    });
  }

  async getDndStatus(): Promise<SlackDndStatus> {
    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'getDndStatus', async () => {
      const result = await this.botClient.dnd.info({
        user: this.userId,
      }) as {
        ok: boolean;
        error?: string;
        dnd_enabled?: boolean;
        next_dnd_start_ts?: number;
        next_dnd_end_ts?: number;
        snooze_enabled?: boolean;
        snooze_endtime?: number;
      };

      if (!result.ok) {
        throw new Error(`Failed to get DND status: ${result.error}`);
      }

      return {
        dndEnabled: result.dnd_enabled || false,
        nextDndStartTs: result.next_dnd_start_ts,
        nextDndEndTs: result.next_dnd_end_ts,
        snoozeEnabled: result.snooze_enabled || false,
        snoozeEndtime: result.snooze_endtime,
      };
    });
  }

  // ============================================================================
  // Reactions
  // ============================================================================

  async addReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'addReaction', async () => {
      const result = await this.botClient.reactions.add({
        channel,
        timestamp,
        name: emoji.replace(/:/g, ''), // Remove colons if present
      });

      if (!result.ok) {
        throw new Error(`Failed to add reaction: ${result.error}`);
      }
    });
  }

  async removeReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'removeReaction', async () => {
      const result = await this.botClient.reactions.remove({
        channel,
        timestamp,
        name: emoji.replace(/:/g, ''),
      });

      if (!result.ok) {
        throw new Error(`Failed to remove reaction: ${result.error}`);
      }
    });
  }

  // ============================================================================
  // Data Retrieval
  // ============================================================================

  async getChannels(excludeArchived: boolean = true): Promise<SlackChannel[]> {
    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'getChannels', async () => {
      const channels: SlackChannel[] = [];
      let cursor: string | undefined;

      do {
        const result = await this.botClient.conversations.list({
          types: 'public_channel,private_channel',
          exclude_archived: excludeArchived,
          limit: 200,
          cursor,
        });

        if (!result.ok) {
          throw new Error(`Failed to get channels: ${result.error}`);
        }

        for (const channel of result.channels || []) {
          channels.push({
            id: channel.id!,
            name: channel.name!,
            isPrivate: channel.is_private || false,
            isArchived: channel.is_archived || false,
            isMember: channel.is_member || false,
            topic: channel.topic?.value,
            purpose: channel.purpose?.value,
            memberCount: channel.num_members,
          });
        }

        cursor = result.response_metadata?.next_cursor;
      } while (cursor);

      return channels;
    });
  }

  async getUsers(includeDeactivated: boolean = false): Promise<SlackUser[]> {
    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'getUsers', async () => {
      const users: SlackUser[] = [];
      let cursor: string | undefined;

      do {
        const result = await this.botClient.users.list({
          limit: 200,
          cursor,
        });

        if (!result.ok) {
          throw new Error(`Failed to get users: ${result.error}`);
        }

        for (const user of result.members || []) {
          if (!includeDeactivated && user.deleted) {
            continue;
          }

          users.push({
            id: user.id!,
            name: user.name!,
            realName: user.real_name || user.name!,
            email: user.profile?.email,
            isBot: user.is_bot || false,
            isAdmin: user.is_admin || false,
            status: user.profile?.status_text
              ? {
                  text: user.profile.status_text,
                  emoji: user.profile.status_emoji || '',
                  expiration: user.profile.status_expiration,
                }
              : undefined,
            profile: {
              title: user.profile?.title,
              phone: user.profile?.phone,
              image: user.profile?.image_72,
            },
          });
        }

        cursor = result.response_metadata?.next_cursor;
      } while (cursor);

      return users;
    });
  }

  async getMessages(channel: string, limit: number = 100): Promise<SlackMessage[]> {
    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'getMessages', async () => {
      const result = await this.botClient.conversations.history({
        channel,
        limit,
      });

      if (!result.ok) {
        throw new Error(`Failed to get messages: ${result.error}`);
      }

      return (result.messages || []).map((msg) => this.parseMessage(msg as unknown as Record<string, unknown>, channel));
    });
  }

  async getThreadReplies(channel: string, threadTs: string): Promise<SlackMessage[]> {
    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'getThreadReplies', async () => {
      const result = await this.botClient.conversations.replies({
        channel,
        ts: threadTs,
      });

      if (!result.ok) {
        throw new Error(`Failed to get thread replies: ${result.error}`);
      }

      return (result.messages || []).map((msg) => this.parseMessage(msg as unknown as Record<string, unknown>, channel));
    });
  }

  async getUserInfo(userId: string): Promise<SlackUser | null> {
    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'getUserInfo', async () => {
      try {
        const result = await this.botClient.users.info({
          user: userId,
        });

        if (!result.ok || !result.user) {
          return null;
        }

        const user = result.user;

        return {
          id: user.id!,
          name: user.name!,
          realName: user.real_name || user.name!,
          email: user.profile?.email,
          isBot: user.is_bot || false,
          isAdmin: user.is_admin || false,
          status: user.profile?.status_text
            ? {
                text: user.profile.status_text,
                emoji: user.profile.status_emoji || '',
                expiration: user.profile.status_expiration,
              }
            : undefined,
          profile: {
            title: user.profile?.title,
            phone: user.profile?.phone,
            image: user.profile?.image_72,
          },
        };
      } catch (error) {
        logger.error('Failed to get user info', { userId, error });
        return null;
      }
    });
  }

  async searchMessages(query: string, limit: number = 20): Promise<SlackMessage[]> {
    if (!this.userClient) {
      throw new Error('User token required for search operations');
    }

    return rateLimiter.executeForProvider('SLACK', this.edithUserId, 'searchMessages', async () => {
      const result = await this.userClient!.search.messages({
        query,
        count: limit,
      });

      if (!result.ok) {
        throw new Error(`Failed to search messages: ${result.error}`);
      }

      const messages: SlackMessage[] = [];
      const matches = result.messages?.matches as Array<{
        ts?: string;
        text?: string;
        user?: string;
        channel?: { id?: string };
        thread_ts?: string;
      }> || [];

      for (const match of matches) {
        messages.push({
          ts: match.ts || '',
          text: match.text || '',
          userId: match.user || '',
          channelId: match.channel?.id || '',
          threadTs: match.thread_ts,
        });
      }

      return messages;
    });
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private parseMessage(msg: Record<string, unknown>, channelId: string): SlackMessage {
    return {
      ts: msg.ts as string,
      text: msg.text as string || '',
      userId: msg.user as string || '',
      channelId,
      threadTs: msg.thread_ts as string | undefined,
      reactions: (msg.reactions as Array<{ name: string; count: number; users: string[] }>) || undefined,
      files: (msg.files as Array<{ id: string; name: string; url_private: string; mimetype: string }>)?.map((f) => ({
        id: f.id,
        name: f.name,
        url: f.url_private,
        mimetype: f.mimetype,
      })),
      blocks: msg.blocks as (Block | KnownBlock)[] | undefined,
    };
  }
}

// ============================================================================
// MockSlackClient Implementation
// ============================================================================

export class MockSlackClient implements ISlackClient {
  private messages: Map<string, SlackMessage[]> = new Map();
  private messageCounter = 1;

  async sendMessage(channel: string, text: string, options?: SendMessageOptions): Promise<string> {
    const ts = `${Date.now()}.${this.messageCounter++}`;
    const message: SlackMessage = {
      ts,
      text,
      userId: 'U_MOCK_BOT',
      channelId: channel,
      threadTs: options?.threadTs,
      blocks: options?.blocks,
    };

    const channelMessages = this.messages.get(channel) || [];
    channelMessages.push(message);
    this.messages.set(channel, channelMessages);

    return ts;
  }

  async sendDM(userId: string, text: string, options?: SendMessageOptions): Promise<string> {
    return this.sendMessage(`DM_${userId}`, text, options);
  }

  async postEphemeral(): Promise<void> {
    // Ephemeral messages are not stored
  }

  async updateMessage(channel: string, ts: string, text: string): Promise<void> {
    const messages = this.messages.get(channel);
    if (messages) {
      const msg = messages.find((m) => m.ts === ts);
      if (msg) {
        msg.text = text;
      }
    }
  }

  async deleteMessage(channel: string, ts: string): Promise<void> {
    const messages = this.messages.get(channel);
    if (messages) {
      const idx = messages.findIndex((m) => m.ts === ts);
      if (idx >= 0) {
        messages.splice(idx, 1);
      }
    }
  }

  async setStatus(): Promise<void> {
    // Mock - no-op
  }

  async clearStatus(): Promise<void> {
    // Mock - no-op
  }

  async setDnd(): Promise<SlackDndStatus> {
    return { dndEnabled: true, snoozeEnabled: true };
  }

  async endDnd(): Promise<void> {
    // Mock - no-op
  }

  async getDndStatus(): Promise<SlackDndStatus> {
    return { dndEnabled: false, snoozeEnabled: false };
  }

  async addReaction(): Promise<void> {
    // Mock - no-op
  }

  async removeReaction(): Promise<void> {
    // Mock - no-op
  }

  async getChannels(): Promise<SlackChannel[]> {
    return [
      { id: 'C001', name: 'general', isPrivate: false, isArchived: false, isMember: true },
      { id: 'C002', name: 'random', isPrivate: false, isArchived: false, isMember: true },
    ];
  }

  async getUsers(): Promise<SlackUser[]> {
    return [
      { id: 'U001', name: 'john', realName: 'John Doe', isBot: false, isAdmin: true },
      { id: 'U002', name: 'jane', realName: 'Jane Smith', isBot: false, isAdmin: false },
    ];
  }

  async getMessages(channel: string): Promise<SlackMessage[]> {
    return this.messages.get(channel) || [];
  }

  async getThreadReplies(channel: string, threadTs: string): Promise<SlackMessage[]> {
    const messages = this.messages.get(channel) || [];
    return messages.filter((m) => m.threadTs === threadTs);
  }

  async getUserInfo(userId: string): Promise<SlackUser | null> {
    const users = await this.getUsers();
    return users.find((u) => u.id === userId) || null;
  }

  async searchMessages(): Promise<SlackMessage[]> {
    return [];
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export async function createSlackClient(userId: string): Promise<ISlackClient | null> {
  const credentials = await slackOAuthClient.getCredentials(userId);

  if (!credentials) {
    logger.debug('No Slack credentials found for user', { userId });
    return null;
  }

  return new RealSlackClient(credentials, userId);
}

export function createMockSlackClient(): ISlackClient {
  return new MockSlackClient();
}

// Default export for simple import
export const slackClient = {
  create: createSlackClient,
  createMock: createMockSlackClient,
};

export default slackClient;
