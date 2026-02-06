/**
 * Webhook Routes
 * Handles incoming webhooks from all integration providers
 */

import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';
import { gmailWebhookHandler, calendarWebhookHandler, type CalendarWebhookHeaders } from '../../integrations/google/index.js';
import { slackEventHandler, slackBotHandler } from '../../integrations/slack/index.js';
import { telegramWebhookHandler } from '../../integrations/telegram/index.js';
import { whatsappWebhookHandler, type TwilioWhatsAppMessage, type TwilioStatusCallback } from '../../integrations/whatsapp/index.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';

const router: RouterType = Router();

// ============================================================================
// Google Webhooks
// ============================================================================

/**
 * POST /webhooks/google/gmail
 * Handle Gmail Pub/Sub push notifications
 */
router.post('/google/gmail', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization || '';
    const message = req.body.message;

    if (!message) {
      logger.warn('Gmail webhook: missing message');
      res.status(400).send('Missing message');
      return;
    }

    const result = await gmailWebhookHandler.handlePubSubNotification(
      message,
      authHeader
    );

    if (result.success) {
      res.status(200).send('OK');
    } else {
      logger.warn('Gmail webhook processing failed', { error: result.error });
      res.status(200).send('OK'); // Still return 200 to prevent retries
    }
  } catch (error) {
    logger.error('Gmail webhook error', { error });
    res.status(200).send('OK'); // Return 200 to prevent infinite retries
  }
});

/**
 * POST /webhooks/google/calendar
 * Handle Google Calendar push notifications
 */
router.post('/google/calendar', async (req: Request, res: Response) => {
  try {
    // Extract headers
    const headers: CalendarWebhookHeaders = {
      'x-goog-channel-id': req.headers['x-goog-channel-id'] as string || '',
      'x-goog-resource-id': req.headers['x-goog-resource-id'] as string || '',
      'x-goog-resource-state': req.headers['x-goog-resource-state'] as 'sync' | 'exists' | 'not_exists' || 'sync',
      'x-goog-resource-uri': req.headers['x-goog-resource-uri'] as string || '',
      'x-goog-channel-expiration': req.headers['x-goog-channel-expiration'] as string,
      'x-goog-message-number': req.headers['x-goog-message-number'] as string,
    };

    const result = await calendarWebhookHandler.handlePushNotification(headers);

    if (result.success) {
      res.status(200).send('OK');
    } else {
      logger.warn('Calendar webhook processing failed', { error: result.error });
      res.status(200).send('OK');
    }
  } catch (error) {
    logger.error('Calendar webhook error', { error });
    res.status(200).send('OK');
  }
});

// ============================================================================
// Slack Webhooks
// ============================================================================

/**
 * POST /webhooks/slack/events
 * Handle Slack Events API
 */
router.post('/slack/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['x-slack-signature'] as string || '';
    const timestamp = req.headers['x-slack-request-timestamp'] as string || '';
    const rawBody = JSON.stringify(req.body);

    // Handle URL verification challenge
    if (req.body.type === 'url_verification') {
      res.send(req.body.challenge);
      return;
    }

    const result = await slackEventHandler.handleEvent(
      req.body,
      signature,
      timestamp,
      rawBody
    );

    if (result.success) {
      res.status(200).send('OK');
    } else {
      logger.warn('Slack event processing failed', { error: result.error });
      res.status(200).send('OK');
    }
  } catch (error) {
    logger.error('Slack events webhook error', { error });
    res.status(200).send('OK');
  }
});

/**
 * POST /webhooks/slack/commands
 * Handle Slack slash commands
 */
router.post('/slack/commands', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-slack-signature'] as string || '';
    const timestamp = req.headers['x-slack-request-timestamp'] as string || '';
    const rawBody = new URLSearchParams(req.body).toString();

    const response = await slackBotHandler.handleSlashCommand(
      req.body,
      signature,
      timestamp,
      rawBody
    );

    res.json(response);
  } catch (error) {
    logger.error('Slack command webhook error', { error });
    res.json({ text: 'Something went wrong. Please try again.' });
  }
});

/**
 * POST /webhooks/slack/interactive
 * Handle Slack interactive components (buttons, menus, etc.)
 */
router.post('/slack/interactive', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-slack-signature'] as string || '';
    const timestamp = req.headers['x-slack-request-timestamp'] as string || '';

    // Payload comes as form-encoded with 'payload' field
    const payload = JSON.parse(req.body.payload || '{}');
    const rawBody = `payload=${encodeURIComponent(req.body.payload)}`;

    const response = await slackBotHandler.handleInteractive(
      payload,
      signature,
      timestamp,
      rawBody
    );

    if (response) {
      res.json(response);
    } else {
      res.status(200).send('');
    }
  } catch (error) {
    logger.error('Slack interactive webhook error', { error });
    res.status(200).send('');
  }
});

// ============================================================================
// Telegram Webhooks
// ============================================================================

/**
 * POST /webhooks/telegram
 * Handle Telegram bot updates
 */
router.post('/telegram', async (req: Request, res: Response) => {
  try {
    const secretToken = req.headers['x-telegram-bot-api-secret-token'] as string;

    const result = await telegramWebhookHandler.handleUpdate(
      req.body,
      secretToken
    );

    if (result.success) {
      res.status(200).send('OK');
    } else {
      logger.warn('Telegram webhook processing failed', { error: result.error });
      res.status(200).send('OK');
    }
  } catch (error) {
    logger.error('Telegram webhook error', { error });
    res.status(200).send('OK');
  }
});

// ============================================================================
// WhatsApp/Twilio Webhooks
// ============================================================================

/**
 * POST /webhooks/whatsapp
 * Handle incoming WhatsApp messages via Twilio
 */
router.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-twilio-signature'] as string || '';
    const webhookUrl = `${config.server?.apiUrl || ''}/webhooks/whatsapp`;

    const result = await whatsappWebhookHandler.handleIncomingMessage(
      req.body as TwilioWhatsAppMessage,
      signature,
      webhookUrl
    );

    if (result.success) {
      // Return TwiML response
      res.type('text/xml');
      res.send(result.response || '<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } else {
      logger.warn('WhatsApp webhook processing failed', { error: result.error });
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  } catch (error) {
    logger.error('WhatsApp webhook error', { error });
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

/**
 * POST /webhooks/whatsapp/status
 * Handle WhatsApp message status callbacks
 */
router.post('/whatsapp/status', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-twilio-signature'] as string || '';
    const webhookUrl = `${config.server?.apiUrl || ''}/webhooks/whatsapp/status`;

    const result = await whatsappWebhookHandler.handleStatusCallback(
      req.body as TwilioStatusCallback,
      signature,
      webhookUrl
    );

    if (result.success) {
      res.status(200).send('OK');
    } else {
      logger.warn('WhatsApp status callback failed', { error: result.error });
      res.status(200).send('OK');
    }
  } catch (error) {
    logger.error('WhatsApp status webhook error', { error });
    res.status(200).send('OK');
  }
});

// ============================================================================
// Health Check for Webhooks
// ============================================================================

/**
 * GET /webhooks/health
 * Webhook endpoint health check
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    endpoints: {
      gmail: '/webhooks/google/gmail',
      calendar: '/webhooks/google/calendar',
      slack_events: '/webhooks/slack/events',
      slack_commands: '/webhooks/slack/commands',
      slack_interactive: '/webhooks/slack/interactive',
      telegram: '/webhooks/telegram',
      whatsapp: '/webhooks/whatsapp',
      whatsapp_status: '/webhooks/whatsapp/status',
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
