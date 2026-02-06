/**
 * WhatsAppClient
 * Twilio-based WhatsApp messaging client
 */

import twilio from 'twilio';
import { prisma } from '../../database/client.js';
import { rateLimiter } from '../common/RateLimiter.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface WhatsAppConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string; // WhatsApp Business number
  messagingServiceSid?: string;
}

export interface WhatsAppMessage {
  to: string;
  body?: string;
  mediaUrl?: string[];
  contentSid?: string; // For templates
  contentVariables?: Record<string, string>;
}

export interface WhatsAppSendResult {
  messageId: string;
  status: string;
  dateSent: Date;
}

export interface ConversationSession {
  userId: string;
  phoneNumber: string;
  lastMessageAt: Date;
  isWithin24Hours: boolean;
}

// ============================================================================
// IWhatsAppClient Interface
// ============================================================================

export interface IWhatsAppClient {
  sendMessage(to: string, body: string): Promise<WhatsAppSendResult>;
  sendTemplate(to: string, templateSid: string, variables?: Record<string, string>): Promise<WhatsAppSendResult>;
  sendMedia(to: string, mediaUrl: string, caption?: string): Promise<WhatsAppSendResult>;
  canSendFreeform(to: string): Promise<boolean>;
  getMessageStatus(messageSid: string): Promise<string>;
}

// ============================================================================
// RealWhatsAppClient Implementation
// ============================================================================

export class RealWhatsAppClient implements IWhatsAppClient {
  private client: twilio.Twilio;
  private fromNumber: string;
  private _messagingServiceSid?: string;
  private userId: string;

  constructor(userId: string) {
    const accountSid = config.twilio?.accountSid || process.env.TWILIO_ACCOUNT_SID;
    const authToken = config.twilio?.authToken || process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = config.twilio?.whatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio credentials not configured');
    }

    this.client = twilio(accountSid, authToken);
    this.fromNumber = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
    this._messagingServiceSid = config.twilio?.messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID;
    this.userId = userId;
  }

  /**
   * Send a text message
   */
  async sendMessage(to: string, body: string): Promise<WhatsAppSendResult> {
    return rateLimiter.executeForProvider('WHATSAPP', this.userId, 'sendMessage', async () => {
      const toNumber = this.formatPhoneNumber(to);

      // Check if we're within 24-hour window
      const canSendFreeform = await this.canSendFreeform(to);

      if (!canSendFreeform) {
        throw new Error('Outside 24-hour messaging window. Use a template instead.');
      }

      const message = await this.client.messages.create({
        from: this.fromNumber,
        to: toNumber,
        body,
      });

      // Log the message
      await this.logMessage(to, body, message.sid, 'outbound');

      return {
        messageId: message.sid,
        status: message.status,
        dateSent: message.dateCreated,
      };
    });
  }

  /**
   * Send a pre-approved template message
   */
  async sendTemplate(
    to: string,
    templateSid: string,
    variables?: Record<string, string>
  ): Promise<WhatsAppSendResult> {
    return rateLimiter.executeForProvider('WHATSAPP', this.userId, 'sendTemplate', async () => {
      const toNumber = this.formatPhoneNumber(to);

      const message = await this.client.messages.create({
        from: this.fromNumber,
        to: toNumber,
        contentSid: templateSid,
        contentVariables: variables ? JSON.stringify(variables) : undefined,
      });

      await this.logMessage(to, `[Template: ${templateSid}]`, message.sid, 'outbound');

      return {
        messageId: message.sid,
        status: message.status,
        dateSent: message.dateCreated,
      };
    });
  }

  /**
   * Send media message
   */
  async sendMedia(to: string, mediaUrl: string, caption?: string): Promise<WhatsAppSendResult> {
    return rateLimiter.executeForProvider('WHATSAPP', this.userId, 'sendMedia', async () => {
      const toNumber = this.formatPhoneNumber(to);

      // Check 24-hour window
      const canSendFreeform = await this.canSendFreeform(to);
      if (!canSendFreeform) {
        throw new Error('Outside 24-hour messaging window. Use a template instead.');
      }

      const message = await this.client.messages.create({
        from: this.fromNumber,
        to: toNumber,
        mediaUrl: [mediaUrl],
        body: caption,
      });

      await this.logMessage(to, caption || '[Media]', message.sid, 'outbound');

      return {
        messageId: message.sid,
        status: message.status,
        dateSent: message.dateCreated,
      };
    });
  }

  /**
   * Check if we can send freeform messages (within 24-hour window)
   */
  async canSendFreeform(to: string): Promise<boolean> {
    const phoneNumber = this.normalizePhoneNumber(to);

    // Check for recent inbound message from this number
    const session = await prisma.whatsAppSession.findFirst({
      where: {
        phoneNumber,
        lastInboundAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Within 24 hours
        },
      },
    });

    return !!session;
  }

  /**
   * Get message delivery status
   */
  async getMessageStatus(messageSid: string): Promise<string> {
    const message = await this.client.messages(messageSid).fetch();
    return message.status;
  }

  /**
   * Record an inbound message to extend 24-hour window
   */
  async recordInboundMessage(from: string): Promise<void> {
    const phoneNumber = this.normalizePhoneNumber(from);

    await prisma.whatsAppSession.upsert({
      where: {
        userId_phoneNumber: {
          userId: this.userId,
          phoneNumber,
        },
      },
      update: {
        lastInboundAt: new Date(),
      },
      create: {
        userId: this.userId,
        phoneNumber,
        lastInboundAt: new Date(),
      },
    });
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private formatPhoneNumber(phone: string): string {
    // Ensure whatsapp: prefix
    if (phone.startsWith('whatsapp:')) {
      return phone;
    }
    // Remove any non-digit characters except +
    const cleaned = phone.replace(/[^\d+]/g, '');
    return `whatsapp:${cleaned}`;
  }

  private normalizePhoneNumber(phone: string): string {
    // Remove whatsapp: prefix and clean
    return phone.replace('whatsapp:', '').replace(/[^\d+]/g, '');
  }

  private async logMessage(
    to: string,
    body: string,
    messageSid: string,
    direction: 'inbound' | 'outbound'
  ): Promise<void> {
    try {
      await prisma.whatsAppMessage.create({
        data: {
          userId: this.userId,
          phoneNumber: this.normalizePhoneNumber(to),
          messageSid,
          direction,
          fromNumber: this.fromNumber,
          toNumber: this.normalizePhoneNumber(to),
          body: body.substring(0, 500), // Truncate for storage
          status: 'SENT',
          sentAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to log WhatsApp message', { error, messageSid });
    }
  }
}

// ============================================================================
// MockWhatsAppClient Implementation
// ============================================================================

export class MockWhatsAppClient implements IWhatsAppClient {
  private messages: Map<string, { body: string; status: string }> = new Map();
  private messageCounter = 0;

  async sendMessage(to: string, body: string): Promise<WhatsAppSendResult> {
    const messageId = `SM_MOCK_${++this.messageCounter}`;
    this.messages.set(messageId, { body, status: 'sent' });
    // Mark as used for mock
    void to;

    return {
      messageId,
      status: 'sent',
      dateSent: new Date(),
    };
  }

  async sendTemplate(
    to: string,
    templateSid: string,
    _variables?: Record<string, string>
  ): Promise<WhatsAppSendResult> {
    return this.sendMessage(to, `[Template: ${templateSid}]`);
  }

  async sendMedia(to: string, _mediaUrl: string, caption?: string): Promise<WhatsAppSendResult> {
    return this.sendMessage(to, caption || '[Media]');
  }

  async canSendFreeform(): Promise<boolean> {
    return true;
  }

  async getMessageStatus(messageSid: string): Promise<string> {
    return this.messages.get(messageSid)?.status || 'unknown';
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createWhatsAppClient(userId: string): IWhatsAppClient {
  const hasConfig = !!(
    config.twilio?.accountSid ||
    process.env.TWILIO_ACCOUNT_SID
  );

  if (!hasConfig && config.isDevelopment) {
    return new MockWhatsAppClient();
  }

  return new RealWhatsAppClient(userId);
}

export async function getWhatsAppClientForUser(userId: string): Promise<IWhatsAppClient | null> {
  // Check if user has WhatsApp integration
  const integration = await prisma.userIntegration.findUnique({
    where: { userId_provider: { userId, provider: 'WHATSAPP' } },
  });

  if (!integration?.isActive) {
    return null;
  }

  return createWhatsAppClient(userId);
}

export const whatsappClient = {
  create: createWhatsAppClient,
  getForUser: getWhatsAppClientForUser,
};

export default whatsappClient;
