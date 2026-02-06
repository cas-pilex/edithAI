/**
 * CRMAgent
 * Specialized agent for relationship tracking, follow-ups, and network analysis
 */

import { BaseAgent } from './BaseAgent.js';
import { registerCRMTools } from './tools/crm.tools.js';
import type {
  AIAgentContext,
  EnhancedAgentResult,
  AgentDomain,
} from '../types/index.js';

// Register CRM tools on import
registerCRMTools();

const CRM_SYSTEM_PROMPT = `You are Edith's CRM Agent, an intelligent relationship manager that helps the user maintain and strengthen their professional and personal network.

## Your Capabilities
- Get and display contact profiles with full history
- Update contact information and notes
- Log interactions (meetings, calls, emails)
- Set and manage follow-up reminders
- Track overdue follow-ups and stale relationships
- Analyze relationship health and strength
- Search and filter contacts
- Generate network insights
- Suggest personalized outreach messages

## Relationship Management Guidelines

### Contact Importance (1-10 scale)
- 9-10: VIP contacts (executives, key clients, close mentors)
- 7-8: Important professional contacts (direct reports, key partners)
- 5-6: Regular professional network (colleagues, industry contacts)
- 3-4: Casual acquaintances
- 1-2: One-time contacts

### Relationship Strength (0-100%)
Factors that affect relationship strength:
- Frequency of interaction (higher = stronger)
- Recency of contact (recent = stronger)
- Interaction quality (meaningful > brief)
- Response rate (mutual engagement)
- Shared connections and experiences

### Follow-up Guidelines
1. **VIP contacts**: Follow up at least monthly
2. **Important contacts**: Follow up quarterly
3. **Regular network**: Follow up semi-annually
4. **After meetings**: Follow up within 48 hours
5. **Birthdays/milestones**: Always acknowledge

## Best Practices
- Record interactions immediately after they occur
- Note personal details mentioned in conversations (family, hobbies, etc.)
- Track sentiment and relationship trajectory
- Set specific, actionable follow-up reminders
- Consider timezone and preferences when suggesting outreach times
- Reference previous conversations in outreach suggestions
- Monitor for relationship decay (no contact > 90 days)

## Outreach Message Guidelines
- Keep messages personal and genuine
- Reference specific past interactions or shared interests
- Have a clear but non-demanding purpose
- Match the contact's communication style
- Be concise - respect their time`;

export class CRMAgent extends BaseAgent {
  protected agentType = 'CRMAgent';
  protected domain: AgentDomain = 'crm';
  protected systemPrompt = CRM_SYSTEM_PROMPT;

  /**
   * Process a CRM-related request
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
   * Get contact profile
   */
  async getContactProfile(
    context: AIAgentContext,
    identifier: string, // email or contact ID
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const message = `Get the full profile and interaction history for contact: ${identifier}. Include recent interactions, follow-ups, and relationship insights.`;
    return this.process(context, message, sessionId);
  }

  /**
   * Log an interaction
   */
  async logInteraction(
    context: AIAgentContext,
    details: {
      contactId: string;
      type: 'MEETING' | 'CALL' | 'EMAIL' | 'MESSAGE' | 'OTHER';
      summary: string;
      notes?: string;
      sentiment?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { contactId, type, summary, notes, sentiment } = details;

    let message = `Log a ${type.toLowerCase()} interaction with contact ${contactId}. Summary: "${summary}"`;
    if (notes) message += `. Additional notes: ${notes}`;
    if (sentiment) message += `. The interaction sentiment was ${sentiment.toLowerCase()}`;

    return this.process(context, message, sessionId);
  }

  /**
   * Set a follow-up reminder
   */
  async setFollowUp(
    context: AIAgentContext,
    details: {
      contactId: string;
      type: 'CALL' | 'EMAIL' | 'MEETING' | 'CHECK_IN' | 'OTHER';
      dueDate: Date;
      notes?: string;
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { contactId, type, dueDate, notes } = details;

    let message = `Set a ${type.toLowerCase()} follow-up with contact ${contactId} for ${dueDate.toDateString()}`;
    if (notes) message += `. Notes: ${notes}`;

    return this.process(context, message, sessionId);
  }

  /**
   * Get overdue follow-ups
   */
  async getOverdueFollowUps(
    context: AIAgentContext,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const message = `List all overdue follow-ups. For each, show the contact name, follow-up type, original due date, and days overdue. Prioritize by contact importance.`;
    return this.process(context, message, sessionId);
  }

  /**
   * Analyze relationship health
   */
  async analyzeRelationship(
    context: AIAgentContext,
    contactId: string,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const message = `Analyze the relationship health with contact ${contactId}. Consider:
1. Interaction frequency and recency
2. Communication patterns and response rates
3. Sentiment trajectory over time
4. Pending follow-ups or commitments
5. Suggestions to strengthen the relationship`;

    return this.process(context, message, sessionId);
  }

  /**
   * Get network insights
   */
  async getNetworkInsights(
    context: AIAgentContext,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const message = `Provide insights about my professional network:
1. Total contacts and distribution by importance
2. Relationships that need attention (declining strength)
3. Contacts not reached out to in 90+ days
4. Network growth trends
5. Suggestions for strengthening key relationships`;

    return this.process(context, message, sessionId);
  }

  /**
   * Suggest outreach message
   */
  async suggestOutreach(
    context: AIAgentContext,
    contactId: string,
    purpose?: string,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    let message = `Suggest a personalized outreach message for contact ${contactId}`;
    if (purpose) {
      message += `. Purpose: ${purpose}`;
    }
    message += `. Consider our interaction history, any personal details I know about them, and the appropriate tone based on our relationship.`;

    return this.process(context, message, sessionId);
  }

  /**
   * Find contacts
   */
  async findContacts(
    context: AIAgentContext,
    criteria: {
      query?: string;
      company?: string;
      tags?: string[];
      minImportance?: number;
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { query, company, tags, minImportance } = criteria;

    const filters = [];
    if (query) filters.push(`matching "${query}"`);
    if (company) filters.push(`at company "${company}"`);
    if (tags && tags.length > 0) filters.push(`with tags: ${tags.join(', ')}`);
    if (minImportance) filters.push(`with importance >= ${minImportance}`);

    const message = `Find contacts ${filters.length > 0 ? filters.join(' and ') : 'in my network'}. Show their name, company, role, and relationship strength.`;
    return this.process(context, message, sessionId);
  }

  /**
   * Weekly relationship review
   */
  async weeklyReview(
    context: AIAgentContext,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const message = `Perform a weekly relationship review:
1. Interactions logged this week
2. Follow-ups completed vs pending
3. Relationships that strengthened or weakened
4. Upcoming follow-ups for next week
5. Top 5 contacts to prioritize reaching out to
6. Any birthdays or milestones coming up`;

    return this.process(context, message, sessionId);
  }
}

export const crmAgent = new CRMAgent();
export default crmAgent;
