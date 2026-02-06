/**
 * InboxAgent
 * Specialized agent for email management, categorization, drafting, and follow-up tracking
 */

import { BaseAgent } from './BaseAgent.js';
import { registerInboxTools } from './tools/inbox.tools.js';
import type {
  AIAgentContext,
  EnhancedAgentResult,
  AgentDomain,
} from '../types/index.js';

// Register inbox tools on import
registerInboxTools();

const INBOX_SYSTEM_PROMPT = `You are Edith's Inbox Agent, an intelligent email assistant that helps manage the user's email inbox efficiently.

## Your Capabilities
- Categorize emails by type (WORK, PERSONAL, NEWSLETTER, PROMOTIONAL, TRANSACTIONAL, SOCIAL, URGENT, SPAM)
- Summarize emails to help the user quickly understand their content
- Draft replies matching the user's communication style
- Extract action items, dates, and tasks from emails
- Archive and organize emails
- Set follow-up reminders for important messages
- Update sender importance based on interactions

## Guidelines
1. **Prioritization**: Always prioritize urgent and important emails. Look for deadline mentions, keywords like "ASAP", "urgent", "deadline", or messages from VIP contacts.

2. **Categorization Logic**:
   - URGENT: Contains time-sensitive requests, deadlines within 24 hours
   - WORK: From work domains, contains project/task discussions
   - PERSONAL: From known personal contacts, informal tone
   - NEWSLETTER: Regular updates, subscription content
   - PROMOTIONAL: Sales, discounts, marketing content
   - TRANSACTIONAL: Receipts, confirmations, notifications
   - SOCIAL: Social network notifications, invites
   - SPAM: Suspicious content, unknown senders with promotional intent

3. **Communication Style**: When drafting replies, match the user's preferred tone (formal/casual) and typical response length. Mirror the sender's level of formality when appropriate.

4. **Action Extraction**: When extracting action items, include:
   - Clear task description
   - Due date if mentioned
   - People involved
   - Priority level

5. **Follow-ups**: Suggest follow-ups for:
   - Unanswered questions after 2-3 days
   - Pending decisions
   - Important threads that went quiet

## Best Practices
- Be concise in summaries - capture the essence, not every detail
- For urgent matters, surface them immediately
- When drafting, provide options when the appropriate response isn't clear
- Consider thread context when responding
- Note any attachments or links that require action`;

export class InboxAgent extends BaseAgent {
  protected agentType = 'InboxAgent';
  protected domain: AgentDomain = 'inbox';
  protected systemPrompt = INBOX_SYSTEM_PROMPT;

  /**
   * Process an inbox-related request
   */
  async process(
    context: AIAgentContext,
    message: string,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const enhancedContext = await this.createEnhancedContext(
      context,
      sessionId || crypto.randomUUID(),
      crypto.randomUUID()
    );

    return this.executeWithTools<string>(enhancedContext, message);
  }

  /**
   * Process with streaming
   */
  async processStream(
    context: AIAgentContext,
    message: string,
    onChunk: (chunk: import('../types/index.js').StreamChunk) => void,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const enhancedContext = await this.createEnhancedContext(
      context,
      sessionId || crypto.randomUUID(),
      crypto.randomUUID()
    );

    return this.executeWithToolsStream(enhancedContext, message, onChunk);
  }

  /**
   * Categorize a specific email
   */
  async categorizeEmail(
    context: AIAgentContext,
    emailId: string,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const message = `Please categorize the email with ID ${emailId}. Analyze its content, sender, and subject to determine the most appropriate category and priority score.`;
    return this.process(context, message, sessionId);
  }

  /**
   * Summarize emails
   */
  async summarizeEmails(
    context: AIAgentContext,
    emailIds: string[],
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const message = `Please provide a concise summary of the following emails: ${emailIds.join(', ')}. Highlight key points, action items, and any urgent matters.`;
    return this.process(context, message, sessionId);
  }

  /**
   * Draft a reply to an email
   */
  async draftReply(
    context: AIAgentContext,
    emailId: string,
    instructions?: string,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const message = instructions
      ? `Draft a reply to email ${emailId} with the following instructions: ${instructions}`
      : `Draft an appropriate reply to email ${emailId} based on its content and context.`;
    return this.process(context, message, sessionId);
  }

  /**
   * Extract action items from emails
   */
  async extractActionItems(
    context: AIAgentContext,
    emailIds: string[],
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const message = `Extract all action items, tasks, and deadlines from the following emails: ${emailIds.join(', ')}. Include who is responsible and any mentioned due dates.`;
    return this.process(context, message, sessionId);
  }

  /**
   * Process inbox triage (daily/batch operation)
   */
  async triageInbox(
    context: AIAgentContext,
    options: {
      maxEmails?: number;
      categorize?: boolean;
      extractTasks?: boolean;
      suggestFollowUps?: boolean;
    } = {},
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const {
      maxEmails = 50,
      categorize = true,
      extractTasks = true,
      suggestFollowUps = true
    } = options;

    const tasks = [];
    if (categorize) tasks.push('categorize all emails');
    if (extractTasks) tasks.push('extract action items and tasks');
    if (suggestFollowUps) tasks.push('suggest follow-ups for important threads');

    const message = `Please perform an inbox triage. Process up to ${maxEmails} unread emails and: ${tasks.join(', ')}. Prioritize urgent and important messages.`;
    return this.process(context, message, sessionId);
  }
}

export const inboxAgent = new InboxAgent();
export default inboxAgent;
