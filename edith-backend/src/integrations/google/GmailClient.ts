/**
 * Gmail Client Interface, Real and Mock Implementations
 * Provides email operations through Gmail API
 */

import { google, gmail_v1 } from 'googleapis';
import type { Auth } from 'googleapis';
import { config } from '../../config/index.js';
import { googleOAuthClient } from './GoogleOAuthClient.js';
import { rateLimiter } from '../common/RateLimiter.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: {
    mimeType: string;
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string; size: number };
    parts?: Array<{
      mimeType: string;
      filename?: string;
      body?: { data?: string; size: number };
      parts?: Array<{
        mimeType: string;
        filename?: string;
        body?: { data?: string; size: number };
      }>;
    }>;
  };
}

export interface GmailQuery {
  q?: string;
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
  includeSpamTrash?: boolean;
}

export interface GmailDraft {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  replyToMessageId?: string;
  threadId?: string;
}

export interface GmailSendResult {
  id: string;
  threadId: string;
  labelIds: string[];
}

export interface GmailListResult {
  messages: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export interface GmailHistoryResult {
  history: gmail_v1.Schema$History[];
  historyId: string;
  nextPageToken?: string;
}

export interface GmailWatchResult {
  historyId: string;
  expiration: string;
}

// ============================================================================
// Interface
// ============================================================================

export interface IGmailClient {
  listMessages(query: GmailQuery): Promise<GmailListResult>;
  getMessage(messageId: string): Promise<GmailMessage>;
  sendMessage(draft: GmailDraft): Promise<GmailSendResult>;
  createDraft(draft: GmailDraft): Promise<string>;
  archiveMessages(messageIds: string[]): Promise<void>;
  markAsRead(messageIds: string[]): Promise<void>;
  markAsUnread(messageIds: string[]): Promise<void>;
  addLabels(messageIds: string[], labelIds: string[]): Promise<void>;
  removeLabels(messageIds: string[], labelIds: string[]): Promise<void>;
  deleteMessages(messageIds: string[]): Promise<void>;
}

export interface IGmailClientExtended extends IGmailClient {
  getHistoryList(startHistoryId: string, pageToken?: string): Promise<GmailHistoryResult>;
  watchMailbox(topicName: string): Promise<GmailWatchResult>;
  stopWatch(): Promise<void>;
  getLabels(): Promise<gmail_v1.Schema$Label[]>;
}

// ============================================================================
// Real Implementation
// ============================================================================

export class RealGmailClient implements IGmailClientExtended {
  private gmail: gmail_v1.Gmail;
  private userId: string;
  private userEmail: string = 'me';

  constructor(auth: Auth.OAuth2Client, userId: string) {
    this.gmail = google.gmail({ version: 'v1', auth });
    this.userId = userId;
  }

  async listMessages(query: GmailQuery): Promise<GmailListResult> {
    return rateLimiter.executeForProvider('GMAIL', this.userId, 'listMessages', async () => {
      const response = await this.gmail.users.messages.list({
        userId: this.userEmail,
        q: query.q,
        maxResults: query.maxResults || 20,
        pageToken: query.pageToken,
        labelIds: query.labelIds,
        includeSpamTrash: query.includeSpamTrash || false,
      });

      return {
        messages: (response.data.messages || []).map(m => ({
          id: m.id!,
          threadId: m.threadId!,
        })),
        nextPageToken: response.data.nextPageToken || undefined,
        resultSizeEstimate: response.data.resultSizeEstimate || 0,
      };
    });
  }

  async getMessage(messageId: string): Promise<GmailMessage> {
    return rateLimiter.executeForProvider('GMAIL', this.userId, 'getMessage', async () => {
      const response = await this.gmail.users.messages.get({
        userId: this.userEmail,
        id: messageId,
        format: 'full',
      });

      return this.mapGmailMessage(response.data);
    });
  }

  async sendMessage(draft: GmailDraft): Promise<GmailSendResult> {
    return rateLimiter.executeForProvider('GMAIL', this.userId, 'sendMessage', async () => {
      const raw = this.createRawMessage(draft);

      const response = await this.gmail.users.messages.send({
        userId: this.userEmail,
        requestBody: {
          raw,
          threadId: draft.threadId,
        },
      });

      return {
        id: response.data.id!,
        threadId: response.data.threadId!,
        labelIds: response.data.labelIds || [],
      };
    });
  }

  async createDraft(draft: GmailDraft): Promise<string> {
    return rateLimiter.executeForProvider('GMAIL', this.userId, 'createDraft', async () => {
      const raw = this.createRawMessage(draft);

      const response = await this.gmail.users.drafts.create({
        userId: this.userEmail,
        requestBody: {
          message: {
            raw,
            threadId: draft.threadId,
          },
        },
      });

      return response.data.id!;
    });
  }

  async archiveMessages(messageIds: string[]): Promise<void> {
    await this.removeLabels(messageIds, ['INBOX']);
  }

  async markAsRead(messageIds: string[]): Promise<void> {
    await this.removeLabels(messageIds, ['UNREAD']);
  }

  async markAsUnread(messageIds: string[]): Promise<void> {
    await this.addLabels(messageIds, ['UNREAD']);
  }

  async addLabels(messageIds: string[], labelIds: string[]): Promise<void> {
    return rateLimiter.executeForProvider('GMAIL', this.userId, 'addLabels', async () => {
      await this.gmail.users.messages.batchModify({
        userId: this.userEmail,
        requestBody: {
          ids: messageIds,
          addLabelIds: labelIds,
        },
      });
    });
  }

  async removeLabels(messageIds: string[], labelIds: string[]): Promise<void> {
    return rateLimiter.executeForProvider('GMAIL', this.userId, 'removeLabels', async () => {
      await this.gmail.users.messages.batchModify({
        userId: this.userEmail,
        requestBody: {
          ids: messageIds,
          removeLabelIds: labelIds,
        },
      });
    });
  }

  async deleteMessages(messageIds: string[]): Promise<void> {
    return rateLimiter.executeForProvider('GMAIL', this.userId, 'deleteMessages', async () => {
      await this.gmail.users.messages.batchDelete({
        userId: this.userEmail,
        requestBody: {
          ids: messageIds,
        },
      });
    });
  }

  async getHistoryList(startHistoryId: string, pageToken?: string): Promise<GmailHistoryResult> {
    return rateLimiter.executeForProvider('GMAIL', this.userId, 'getHistory', async () => {
      const response = await this.gmail.users.history.list({
        userId: this.userEmail,
        startHistoryId,
        pageToken,
        historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
      });

      return {
        history: response.data.history || [],
        historyId: response.data.historyId!,
        nextPageToken: response.data.nextPageToken || undefined,
      };
    });
  }

  async watchMailbox(topicName: string): Promise<GmailWatchResult> {
    return rateLimiter.executeForProvider('GMAIL', this.userId, 'watch', async () => {
      const response = await this.gmail.users.watch({
        userId: this.userEmail,
        requestBody: {
          topicName,
          labelIds: ['INBOX'],
          labelFilterBehavior: 'INCLUDE',
        },
      });

      return {
        historyId: response.data.historyId!,
        expiration: response.data.expiration!,
      };
    });
  }

  async stopWatch(): Promise<void> {
    return rateLimiter.executeForProvider('GMAIL', this.userId, 'stopWatch', async () => {
      await this.gmail.users.stop({ userId: this.userEmail });
    });
  }

  async getLabels(): Promise<gmail_v1.Schema$Label[]> {
    return rateLimiter.executeForProvider('GMAIL', this.userId, 'getLabels', async () => {
      const response = await this.gmail.users.labels.list({
        userId: this.userEmail,
      });

      return response.data.labels || [];
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private mapGmailMessage(msg: gmail_v1.Schema$Message): GmailMessage {
    return {
      id: msg.id!,
      threadId: msg.threadId!,
      labelIds: msg.labelIds || [],
      snippet: msg.snippet || '',
      historyId: msg.historyId || '',
      internalDate: msg.internalDate || '',
      payload: {
        mimeType: msg.payload?.mimeType || 'text/plain',
        headers: (msg.payload?.headers || []).map(h => ({
          name: h.name || '',
          value: h.value || '',
        })),
        body: msg.payload?.body
          ? {
              data: msg.payload.body.data || undefined,
              size: msg.payload.body.size || 0,
            }
          : undefined,
        parts: msg.payload?.parts?.map(p => ({
          mimeType: p.mimeType || '',
          filename: p.filename || undefined,
          body: p.body
            ? {
                data: p.body.data || undefined,
                size: p.body.size || 0,
              }
            : undefined,
          parts: p.parts?.map(pp => ({
            mimeType: pp.mimeType || '',
            filename: pp.filename || undefined,
            body: pp.body
              ? {
                  data: pp.body.data || undefined,
                  size: pp.body.size || 0,
                }
              : undefined,
          })),
        })),
      },
    };
  }

  private createRawMessage(draft: GmailDraft): string {
    const boundary = `boundary_${Date.now()}`;
    const headers: string[] = [
      `To: ${draft.to.join(', ')}`,
      `Subject: ${draft.subject}`,
      `MIME-Version: 1.0`,
    ];

    if (draft.cc && draft.cc.length > 0) {
      headers.push(`Cc: ${draft.cc.join(', ')}`);
    }

    if (draft.bcc && draft.bcc.length > 0) {
      headers.push(`Bcc: ${draft.bcc.join(', ')}`);
    }

    if (draft.replyToMessageId) {
      headers.push(`In-Reply-To: ${draft.replyToMessageId}`);
      headers.push(`References: ${draft.replyToMessageId}`);
    }

    if (draft.isHtml) {
      headers.push(`Content-Type: text/html; charset="UTF-8"`);
    } else {
      headers.push(`Content-Type: text/plain; charset="UTF-8"`);
    }

    const message = `${headers.join('\r\n')}\r\n\r\n${draft.body}`;

    // Convert to base64url
    return Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}

// ============================================================================
// Mock Implementation
// ============================================================================

const MOCK_SENDERS = [
  { name: 'John Smith', email: 'john.smith@company.com' },
  { name: 'Sarah Johnson', email: 'sarah.j@client.org' },
  { name: 'Michael Brown', email: 'mbrown@partner.io' },
  { name: 'Emily Davis', email: 'emily.davis@startup.co' },
  { name: 'Newsletter', email: 'newsletter@techweekly.com' },
  { name: 'Support', email: 'support@saasproduct.com' },
  { name: 'HR Team', email: 'hr@company.com' },
  { name: 'Finance', email: 'finance@company.com' },
];

const MOCK_SUBJECTS = [
  'Q4 Planning Meeting - Please Review',
  'Re: Project Update Needed',
  'Invitation: Weekly Sync',
  'Important: Contract Review Required',
  'FYI: Market Analysis Report',
  'Action Required: Submit Timesheet',
  'Your Weekly Newsletter',
  'Meeting Rescheduled',
  'Quick Question About the Proposal',
  'Follow-up: Partnership Discussion',
];

export class MockGmailClient implements IGmailClient {
  private messages: Map<string, GmailMessage> = new Map();
  private nextId = 1;

  constructor() {
    this.generateMockMessages(20);
  }

  private generateMockMessages(count: number): void {
    for (let i = 0; i < count; i++) {
      const id = `msg_${this.nextId++}`;
      const threadId = `thread_${Math.floor(i / 3) + 1}`;
      const sender = MOCK_SENDERS[Math.floor(Math.random() * MOCK_SENDERS.length)];
      const subject = MOCK_SUBJECTS[Math.floor(Math.random() * MOCK_SUBJECTS.length)];
      const daysAgo = Math.floor(Math.random() * 14);
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);

      const message: GmailMessage = {
        id,
        threadId,
        labelIds: Math.random() > 0.3 ? ['INBOX'] : ['INBOX', 'UNREAD'],
        snippet: `This is a preview of the email content for ${subject.toLowerCase()}...`,
        historyId: `history_${i}`,
        internalDate: date.getTime().toString(),
        payload: {
          mimeType: 'text/plain',
          headers: [
            { name: 'From', value: `${sender.name} <${sender.email}>` },
            { name: 'To', value: 'user@company.com' },
            { name: 'Subject', value: subject },
            { name: 'Date', value: date.toISOString() },
          ],
          body: {
            data: Buffer.from(`Full email body for: ${subject}\n\nHello,\n\nThis is the complete email content...`).toString('base64'),
            size: 500,
          },
        },
      };

      this.messages.set(id, message);
    }
  }

  async listMessages(query: GmailQuery): Promise<GmailListResult> {
    logger.debug('Mock Gmail: listMessages', { query });
    await this.simulateDelay();

    let messages = Array.from(this.messages.values());

    if (query.labelIds) {
      messages = messages.filter(m =>
        query.labelIds!.some(label => m.labelIds.includes(label))
      );
    }

    if (query.q) {
      const searchLower = query.q.toLowerCase();
      messages = messages.filter(m => {
        const subject = m.payload.headers.find(h => h.name === 'Subject')?.value || '';
        const from = m.payload.headers.find(h => h.name === 'From')?.value || '';
        return subject.toLowerCase().includes(searchLower) ||
          from.toLowerCase().includes(searchLower) ||
          m.snippet.toLowerCase().includes(searchLower);
      });
    }

    messages.sort((a, b) => parseInt(b.internalDate) - parseInt(a.internalDate));

    const maxResults = query.maxResults || 20;
    const startIndex = query.pageToken ? parseInt(query.pageToken) : 0;
    const paginatedMessages = messages.slice(startIndex, startIndex + maxResults);

    return {
      messages: paginatedMessages.map(m => ({ id: m.id, threadId: m.threadId })),
      nextPageToken: startIndex + maxResults < messages.length
        ? (startIndex + maxResults).toString()
        : undefined,
      resultSizeEstimate: messages.length,
    };
  }

  async getMessage(messageId: string): Promise<GmailMessage> {
    logger.debug('Mock Gmail: getMessage', { messageId });
    await this.simulateDelay();

    const message = this.messages.get(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    return message;
  }

  async sendMessage(draft: GmailDraft): Promise<GmailSendResult> {
    logger.debug('Mock Gmail: sendMessage', { to: draft.to, subject: draft.subject });
    await this.simulateDelay(500);

    const id = `msg_${this.nextId++}`;
    const threadId = draft.replyToMessageId
      ? this.messages.get(draft.replyToMessageId)?.threadId || `thread_${this.nextId}`
      : `thread_${this.nextId}`;

    return { id, threadId, labelIds: ['SENT'] };
  }

  async createDraft(draft: GmailDraft): Promise<string> {
    logger.debug('Mock Gmail: createDraft', { to: draft.to, subject: draft.subject });
    await this.simulateDelay();
    return `draft_${this.nextId++}`;
  }

  async archiveMessages(messageIds: string[]): Promise<void> {
    logger.debug('Mock Gmail: archiveMessages', { messageIds });
    await this.simulateDelay();
    for (const id of messageIds) {
      const message = this.messages.get(id);
      if (message) {
        message.labelIds = message.labelIds.filter(l => l !== 'INBOX');
      }
    }
  }

  async markAsRead(messageIds: string[]): Promise<void> {
    logger.debug('Mock Gmail: markAsRead', { messageIds });
    await this.simulateDelay();
    for (const id of messageIds) {
      const message = this.messages.get(id);
      if (message) {
        message.labelIds = message.labelIds.filter(l => l !== 'UNREAD');
      }
    }
  }

  async markAsUnread(messageIds: string[]): Promise<void> {
    logger.debug('Mock Gmail: markAsUnread', { messageIds });
    await this.simulateDelay();
    for (const id of messageIds) {
      const message = this.messages.get(id);
      if (message && !message.labelIds.includes('UNREAD')) {
        message.labelIds.push('UNREAD');
      }
    }
  }

  async addLabels(messageIds: string[], labelIds: string[]): Promise<void> {
    logger.debug('Mock Gmail: addLabels', { messageIds, labelIds });
    await this.simulateDelay();
    for (const id of messageIds) {
      const message = this.messages.get(id);
      if (message) {
        for (const label of labelIds) {
          if (!message.labelIds.includes(label)) {
            message.labelIds.push(label);
          }
        }
      }
    }
  }

  async removeLabels(messageIds: string[], labelIds: string[]): Promise<void> {
    logger.debug('Mock Gmail: removeLabels', { messageIds, labelIds });
    await this.simulateDelay();
    for (const id of messageIds) {
      const message = this.messages.get(id);
      if (message) {
        message.labelIds = message.labelIds.filter(l => !labelIds.includes(l));
      }
    }
  }

  async deleteMessages(messageIds: string[]): Promise<void> {
    logger.debug('Mock Gmail: deleteMessages', { messageIds });
    await this.simulateDelay();
    for (const id of messageIds) {
      this.messages.delete(id);
    }
  }

  private simulateDelay(ms: number = 100): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory
// ============================================================================

export async function createGmailClientForUser(userId: string): Promise<IGmailClientExtended | null> {
  // Check if Google OAuth is configured
  if (!googleOAuthClient.isConfigured()) {
    logger.debug('Google OAuth not configured, using mock');
    return null;
  }

  // Get authenticated client for user
  const auth = await googleOAuthClient.getClientForUser(userId, 'GMAIL');
  if (!auth) {
    logger.debug('No Gmail auth for user', { userId });
    return null;
  }

  return new RealGmailClient(auth, userId);
}

export function createGmailClient(_accessToken?: string): IGmailClient {
  // For backward compatibility, returns mock in development
  if (config.isDevelopment && !config.google.clientId) {
    return new MockGmailClient();
  }

  // Return mock for now, use createGmailClientForUser for real implementation
  return new MockGmailClient();
}

export const gmailClient = createGmailClient();
export default gmailClient;
