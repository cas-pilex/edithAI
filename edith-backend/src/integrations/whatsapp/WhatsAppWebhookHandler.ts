/**
 * WhatsAppWebhookHandler
 * Handles Twilio WhatsApp webhooks for incoming messages and status callbacks
 */

import { prisma } from '../../database/client.js';
import { webhookManager } from '../common/WebhookManager.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';

// ============================================================================
// Types
// ============================================================================

export interface TwilioWhatsAppMessage {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  MediaContentType0?: string;
  MediaUrl0?: string;
  MediaContentType1?: string;
  MediaUrl1?: string;
  // More media fields as needed
  ProfileName?: string;
  WaId: string; // WhatsApp ID (phone number)
  Latitude?: string;
  Longitude?: string;
  Address?: string;
}

export interface TwilioStatusCallback {
  MessageSid: string;
  MessageStatus: TwilioMessageStatus;
  AccountSid: string;
  From: string;
  To: string;
  ErrorCode?: string;
  ErrorMessage?: string;
}

export type TwilioMessageStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'undelivered';

export interface WebhookResult {
  success: boolean;
  response?: string; // TwiML response
  error?: string;
}

export interface ParsedInboundMessage {
  messageId: string;
  from: string;
  to: string;
  body: string;
  profileName?: string;
  media: Array<{
    contentType: string;
    url: string;
  }>;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
}

// ============================================================================
// WhatsAppWebhookHandler Class
// ============================================================================

class WhatsAppWebhookHandlerImpl {
  /**
   * Handle incoming WhatsApp message
   */
  async handleIncomingMessage(
    body: TwilioWhatsAppMessage,
    signature: string,
    url: string
  ): Promise<WebhookResult> {
    try {
      // Verify Twilio signature
      const verification = webhookManager.verifyTwilioSignature(
        signature,
        url,
        body as unknown as Record<string, string>
      );

      if (!verification.valid) {
        logger.warn('Invalid Twilio signature', { error: verification.error });
        return { success: false, error: 'Invalid signature' };
      }

      // Parse the message
      const message = this.parseInboundMessage(body);

      logger.info('WhatsApp message received', {
        from: message.from,
        hasMedia: message.media.length > 0,
        hasLocation: !!message.location,
      });

      // Find user by phone number
      const user = await this.findUserByPhoneNumber(message.from);

      if (!user) {
        // Unknown number - could start onboarding flow
        logger.info('Message from unknown number', { from: message.from });
        return {
          success: true,
          response: this.generateTwiML(
            "Hi! I'm Edith, your AI assistant. " +
            "It looks like your number isn't connected to an Edith account yet. " +
            "Visit edith.ai to get started!"
          ),
        };
      }

      // Record inbound message to extend 24h window
      await this.recordInboundMessage(user.userId, message);

      // Process the message
      const responseText = await this.processMessage(user.userId, message);

      return {
        success: true,
        response: this.generateTwiML(responseText),
      };
    } catch (error) {
      logger.error('WhatsApp webhook handling failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle message status callback
   */
  async handleStatusCallback(
    body: TwilioStatusCallback,
    signature: string,
    url: string
  ): Promise<WebhookResult> {
    try {
      // Verify Twilio signature
      const verification = webhookManager.verifyTwilioSignature(
        signature,
        url,
        body as unknown as Record<string, string>
      );

      if (!verification.valid) {
        logger.warn('Invalid Twilio status callback signature');
        return { success: false, error: 'Invalid signature' };
      }

      logger.debug('WhatsApp status update', {
        messageId: body.MessageSid,
        status: body.MessageStatus,
      });

      // Update message status in database
      await this.updateMessageStatus(body);

      // Handle failures
      if (body.MessageStatus === 'failed' || body.MessageStatus === 'undelivered') {
        logger.warn('WhatsApp message delivery failed', {
          messageId: body.MessageSid,
          errorCode: body.ErrorCode,
          errorMessage: body.ErrorMessage,
        });

        // Could trigger retry logic or notify user via different channel
      }

      return { success: true };
    } catch (error) {
      logger.error('Status callback handling failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // Message Processing
  // ============================================================================

  private async processMessage(
    userId: string,
    message: ParsedInboundMessage
  ): Promise<string> {
    const text = message.body.toLowerCase().trim();

    // Handle command shortcuts
    if (text === 'today' || text === 'briefing') {
      return await this.handleTodayCommand(userId);
    }

    if (text === 'inbox' || text === 'emails' || text === 'email') {
      return await this.handleInboxCommand(userId);
    }

    if (text === 'tasks' || text === 'todo') {
      return await this.handleTasksCommand(userId);
    }

    if (text === 'schedule' || text === 'calendar') {
      return await this.handleScheduleCommand(userId);
    }

    if (text === 'help') {
      return this.handleHelpCommand();
    }

    // Handle action responses
    if (text === 'approve' || text === 'yes') {
      return await this.handleApproveAction(userId);
    }

    if (text === 'reject' || text === 'no') {
      return await this.handleRejectAction(userId);
    }

    if (text === 'done' || text === 'complete') {
      return await this.handleDoneAction(userId);
    }

    if (text === 'snooze' || text === 'later') {
      return await this.handleSnoozeAction(userId);
    }

    // Handle media messages
    if (message.media.length > 0) {
      return await this.handleMediaMessage(userId, message);
    }

    // Handle location messages
    if (message.location) {
      return await this.handleLocationMessage(userId, message);
    }

    // Default: treat as natural language query
    return await this.handleNaturalLanguage(userId, message.body);
  }

  // ============================================================================
  // Command Handlers
  // ============================================================================

  private async handleTodayCommand(userId: string): Promise<string> {
    // In full implementation, fetch real data
    return (
      "☀️ *Your Day at a Glance*\n\n" +
      "📅 3 meetings scheduled\n" +
      "✅ 5 tasks due\n" +
      "📧 12 unread emails\n\n" +
      "Reply 'schedule' for meeting details or 'tasks' for your to-do list."
    );
  }

  private async handleInboxCommand(userId: string): Promise<string> {
    return (
      "📧 *Inbox Summary*\n\n" +
      "12 unread emails\n" +
      "3 marked important\n\n" +
      "_Full inbox management coming soon!_"
    );
  }

  private async handleTasksCommand(userId: string): Promise<string> {
    return (
      "✅ *Your Tasks*\n\n" +
      "🔴 2 high priority\n" +
      "🟡 3 medium priority\n\n" +
      "_Task management coming soon!_"
    );
  }

  private async handleScheduleCommand(userId: string): Promise<string> {
    return (
      "📅 *Today's Schedule*\n\n" +
      "9:00 AM - Team standup\n" +
      "11:00 AM - Client call\n" +
      "2:00 PM - Review meeting\n\n" +
      "_Reply with a time to see availability._"
    );
  }

  private handleHelpCommand(): string {
    return (
      "🤖 *Edith Help*\n\n" +
      "*Commands:*\n" +
      "• today - Daily briefing\n" +
      "• inbox - Email summary\n" +
      "• tasks - To-do list\n" +
      "• schedule - Calendar\n" +
      "• help - This message\n\n" +
      "*Actions:*\n" +
      "• approve/reject - Respond to requests\n" +
      "• done - Mark task complete\n" +
      "• snooze - Delay reminder\n\n" +
      "Or just send me a message!"
    );
  }

  private async handleApproveAction(userId: string): Promise<string> {
    // Check for pending approvals
    return "✅ Looking for pending approvals... (Coming soon)";
  }

  private async handleRejectAction(userId: string): Promise<string> {
    return "❌ Looking for pending items to reject... (Coming soon)";
  }

  private async handleDoneAction(userId: string): Promise<string> {
    return "✅ Looking for tasks to mark complete... (Coming soon)";
  }

  private async handleSnoozeAction(userId: string): Promise<string> {
    return "⏰ Snoozing your last reminder... (Coming soon)";
  }

  private async handleMediaMessage(userId: string, message: ParsedInboundMessage): Promise<string> {
    const mediaTypes = message.media.map(m => m.contentType.split('/')[0]);

    if (mediaTypes.includes('image')) {
      return "📷 Photo received! I can analyze receipts, documents, and more. (Coming soon)";
    }

    if (mediaTypes.includes('audio')) {
      return "🎤 Voice message received! Transcription coming soon.";
    }

    if (mediaTypes.includes('video')) {
      return "🎥 Video received! Video processing coming soon.";
    }

    return "📎 File received! Document analysis coming soon.";
  }

  private async handleLocationMessage(userId: string, message: ParsedInboundMessage): Promise<string> {
    const location = message.location!;
    return (
      `📍 Location received!\n` +
      `Lat: ${location.latitude}, Lon: ${location.longitude}\n` +
      (location.address ? `Address: ${location.address}\n` : '') +
      `\nI can search for nearby restaurants, set reminders based on location, and more. (Coming soon)`
    );
  }

  private async handleNaturalLanguage(userId: string, text: string): Promise<string> {
    // In full implementation, route to orchestrator agent
    return (
      `I understood: "${text}"\n\n` +
      `_Natural language processing coming soon!_\n\n` +
      `Try 'help' to see available commands.`
    );
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private parseInboundMessage(body: TwilioWhatsAppMessage): ParsedInboundMessage {
    const media: Array<{ contentType: string; url: string }> = [];

    const numMedia = parseInt(body.NumMedia, 10) || 0;
    for (let i = 0; i < numMedia; i++) {
      const contentTypeKey = `MediaContentType${i}` as keyof TwilioWhatsAppMessage;
      const urlKey = `MediaUrl${i}` as keyof TwilioWhatsAppMessage;

      if (body[contentTypeKey] && body[urlKey]) {
        media.push({
          contentType: body[contentTypeKey] as string,
          url: body[urlKey] as string,
        });
      }
    }

    let location: ParsedInboundMessage['location'];
    if (body.Latitude && body.Longitude) {
      location = {
        latitude: parseFloat(body.Latitude),
        longitude: parseFloat(body.Longitude),
        address: body.Address,
      };
    }

    return {
      messageId: body.MessageSid,
      from: body.From.replace('whatsapp:', ''),
      to: body.To.replace('whatsapp:', ''),
      body: body.Body || '',
      profileName: body.ProfileName,
      media,
      location,
    };
  }

  private async findUserByPhoneNumber(phoneNumber: string): Promise<{ userId: string } | null> {
    const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');

    const integration = await prisma.userIntegration.findFirst({
      where: {
        provider: 'WHATSAPP',
        isActive: true,
        metadata: {
          path: ['phoneNumber'],
          string_contains: normalizedPhone.slice(-10), // Match last 10 digits
        },
      },
      select: { userId: true },
    });

    return integration;
  }

  private async recordInboundMessage(userId: string, message: ParsedInboundMessage): Promise<void> {
    try {
      // Update session for 24h window
      await prisma.whatsAppSession.upsert({
        where: {
          userId_phoneNumber: {
            userId,
            phoneNumber: message.from,
          },
        },
        update: {
          lastInboundAt: new Date(),
        },
        create: {
          userId,
          phoneNumber: message.from,
          lastInboundAt: new Date(),
        },
      });

      // Store the message
      await prisma.whatsAppMessage.create({
        data: {
          userId,
          phoneNumber: message.from,
          messageSid: message.messageId,
          direction: 'INBOUND',
          fromNumber: message.from,
          toNumber: message.to || config.twilio.whatsappNumber || '',
          body: message.body.substring(0, 500),
          status: 'RECEIVED',
          sentAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to record inbound message', { error });
    }
  }

  private async updateMessageStatus(callback: TwilioStatusCallback): Promise<void> {
    try {
      await prisma.whatsAppMessage.updateMany({
        where: { messageSid: callback.MessageSid },
        data: {
          status: callback.MessageStatus.toUpperCase(),
          errorCode: callback.ErrorCode,
          errorMessage: callback.ErrorMessage,
        },
      });
    } catch (error) {
      logger.error('Failed to update message status', { error });
    }
  }

  private generateTwiML(message: string): string {
    // Simple TwiML response
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${this.escapeXml(message)}</Message>
</Response>`;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

export const whatsappWebhookHandler = new WhatsAppWebhookHandlerImpl();
export default whatsappWebhookHandler;
