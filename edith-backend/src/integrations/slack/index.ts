/**
 * Slack Integrations
 * Exports all Slack-related integration components
 */

// OAuth
export {
  slackOAuthClient,
  SLACK_BOT_SCOPES,
  SLACK_USER_SCOPES,
  type SlackOAuthConfig,
  type SlackTokenResponse,
  type SlackCredentials,
} from './SlackOAuthClient.js';

// Client
export {
  slackClient,
  createSlackClient,
  createMockSlackClient,
  RealSlackClient,
  MockSlackClient,
  type ISlackClient,
  type SlackChannel,
  type SlackUser,
  type SlackMessage,
  type SlackDndStatus,
  type SendMessageOptions,
} from './SlackClient.js';

// Sync Worker
export {
  slackSyncWorker,
} from './SlackSyncWorker.js';

// Event Handler
export {
  slackEventHandler,
  type SlackEventPayload,
  type SlackEvent,
  type AppMentionEvent,
  type MessageEvent,
  type ReactionAddedEvent,
  type ReactionRemovedEvent,
  type AppHomeOpenedEvent,
  type EventHandlerResult,
} from './SlackEventHandler.js';

// Bot Handler
export {
  slackBotHandler,
  type SlashCommand,
  type SlashCommandResponse,
  type InteractivePayload,
} from './SlackBotHandler.js';
