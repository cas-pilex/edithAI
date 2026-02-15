/**
 * AIService
 * Claude API wrapper for email analysis, daily briefings, and calendar intelligence
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface EmailForBriefing {
  id: string;
  fromAddress: string;
  fromName?: string | null;
  subject: string;
  snippet?: string | null;
  bodyText?: string | null;
  receivedAt: Date;
  labels: string[];
}

export interface DailyBriefing {
  summary: string;
  urgentItems: Array<{ emailId: string; subject: string; reason: string }>;
  questionsToAnswer: Array<{ emailId: string; from: string; subject: string; question: string }>;
  fyiItems: Array<{ emailId: string; subject: string; oneLiner: string }>;
  extractedTasks: Array<{ title: string; emailId: string; dueDate?: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' }>;
  totalUnread: number;
}

export interface EmailForCategorization {
  id: string;
  fromAddress: string;
  fromName?: string | null;
  subject: string;
  snippet?: string | null;
  labels: string[];
}

export interface EmailCategorization {
  emailId: string;
  category: 'URGENT' | 'ACTION_REQUIRED' | 'FOLLOW_UP' | 'FYI' | 'NEWSLETTER' | 'SPAM';
  priorityScore: number;
}

// ============================================================================
// AIService Class
// ============================================================================

class AIServiceImpl {
  private client: Anthropic | null = null;

  constructor() {
    if (config.ai.apiKey) {
      this.client = new Anthropic({ apiKey: config.ai.apiKey });
      logger.info('AI service initialized');
    } else {
      logger.warn('AI service not configured — ANTHROPIC_API_KEY missing');
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Generate a daily briefing from unread emails
   */
  async generateDailyBriefing(emails: EmailForBriefing[]): Promise<DailyBriefing | null> {
    if (!this.client || emails.length === 0) {
      return null;
    }

    // Prepare email summaries for the prompt (keep it concise)
    const emailSummaries = emails.slice(0, 50).map((e, i) => {
      const body = (e.bodyText || '').slice(0, 500).replace(/\s+/g, ' ').trim();
      return `[${i + 1}] ID: ${e.id}
From: ${e.fromName || e.fromAddress}
Subject: ${e.subject}
Preview: ${e.snippet || body}`;
    }).join('\n\n');

    try {
      const response = await this.client.messages.create({
        model: config.ai.model || 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: `You are Edith, a proactive AI executive assistant. Analyze the user's unread emails and create a concise daily briefing in Dutch.

Respond with valid JSON only, no markdown. Use this exact structure:
{
  "summary": "3-5 sentence overview of what's in the inbox today",
  "urgentItems": [{"emailId": "...", "subject": "...", "reason": "why this is urgent"}],
  "questionsToAnswer": [{"emailId": "...", "from": "...", "subject": "...", "question": "the question being asked"}],
  "fyiItems": [{"emailId": "...", "subject": "...", "oneLiner": "brief description"}],
  "extractedTasks": [{"title": "task description", "emailId": "...", "priority": "LOW|MEDIUM|HIGH|URGENT"}],
  "totalUnread": ${emails.length}
}

Rules:
- urgentItems: emails requiring immediate attention (deadlines, important requests)
- questionsToAnswer: emails that explicitly ask the user a question
- fyiItems: informational emails, newsletters, notifications (keep it brief)
- extractedTasks: actionable items from emails (meetings to schedule, documents to review, etc.)
- Keep arrays concise — max 5 urgent, 5 questions, 10 FYI, 10 tasks
- Write the summary in Dutch, keep other fields in the language of the email`,
        messages: [{
          role: 'user',
          content: `Here are ${emails.length} unread emails to analyze:\n\n${emailSummaries}`,
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = JSON.parse(text) as DailyBriefing;
      parsed.totalUnread = emails.length;

      logger.info('Daily briefing generated', {
        urgentCount: parsed.urgentItems.length,
        questionsCount: parsed.questionsToAnswer.length,
        tasksCount: parsed.extractedTasks.length,
      });

      return parsed;
    } catch (error) {
      logger.error('Failed to generate daily briefing', { error: (error as Error).message });
      return null;
    }
  }

  /**
   * Batch categorize emails (up to 20 at a time)
   */
  async categorizeEmails(emails: EmailForCategorization[]): Promise<EmailCategorization[]> {
    if (!this.client || emails.length === 0) {
      return [];
    }

    const emailList = emails.map((e, i) =>
      `[${i + 1}] ID: ${e.id} | From: ${e.fromName || e.fromAddress} | Subject: ${e.subject} | Preview: ${(e.snippet || '').slice(0, 200)}`
    ).join('\n');

    try {
      const response = await this.client.messages.create({
        model: config.ai.model || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: `Categorize each email. Respond with a JSON array only, no markdown:
[{"emailId": "...", "category": "URGENT|ACTION_REQUIRED|FOLLOW_UP|FYI|NEWSLETTER|SPAM", "priorityScore": 0-100}]

Categories:
- URGENT: deadlines, emergencies, time-sensitive requests (priority 80-100)
- ACTION_REQUIRED: needs a response or action but not urgent (priority 60-79)
- FOLLOW_UP: ongoing conversations, check-ins (priority 40-59)
- FYI: informational, no action needed (priority 20-39)
- NEWSLETTER: subscriptions, marketing, promotions (priority 5-19)
- SPAM: unwanted, phishing, scams (priority 0-4)`,
        messages: [{
          role: 'user',
          content: `Categorize these ${emails.length} emails:\n\n${emailList}`,
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
      return JSON.parse(text) as EmailCategorization[];
    } catch (error) {
      logger.error('Failed to categorize emails', { error: (error as Error).message });
      return [];
    }
  }

  /**
   * Estimate travel time between two locations
   */
  async estimateTravelTime(from: string, to: string): Promise<number> {
    if (!this.client) return 30; // fallback

    try {
      const response = await this.client.messages.create({
        model: config.ai.model || 'claude-sonnet-4-20250514',
        max_tokens: 64,
        system: 'Estimate driving time in minutes between two locations in the Netherlands. Respond with only a single integer (the number of minutes). No other text.',
        messages: [{
          role: 'user',
          content: `From: ${from}\nTo: ${to}`,
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '30';
      const minutes = parseInt(text, 10);
      return isNaN(minutes) ? 30 : minutes;
    } catch (error) {
      logger.error('Failed to estimate travel time', { error: (error as Error).message, from, to });
      return 30;
    }
  }
  /**
   * Generate a contextual draft reply to an email
   */
  async generateDraftReply(context: {
    email: { id: string; fromAddress: string; fromName?: string | null; subject: string; bodyText?: string | null; receivedAt: Date };
    threadEmails: Array<{ fromAddress: string; fromName?: string | null; bodyText?: string | null; receivedAt: Date }>;
    tone: string;
  }): Promise<string | null> {
    if (!this.client) return null;

    const threadContext = context.threadEmails
      .slice(-5)
      .map((e, i) => `[${i + 1}] From: ${e.fromName || e.fromAddress}\n${(e.bodyText || '').slice(0, 500)}`)
      .join('\n---\n');

    const toneInstructions: Record<string, string> = {
      professional: 'Use polished, professional language. Be clear and respectful.',
      friendly: 'Use friendly, conversational language. Be warm but professional.',
      concise: 'Be very brief and to the point. Short sentences, no fluff.',
      formal: 'Use formal, polished language. Address the recipient with proper titles.',
      FORMAL: 'Use formal, polished language. Address the recipient with proper titles.',
      CASUAL: 'Use friendly, conversational language. Be warm but professional.',
      MIXED: 'Balance professionalism with warmth. Be clear and approachable.',
    };

    try {
      const response = await this.client.messages.create({
        model: config.ai.model || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: `You are Edith, an AI executive assistant drafting email replies for a busy CEO/entrepreneur.

${toneInstructions[context.tone] || toneInstructions.professional}

Rules:
- Write ONLY the reply body text (no Subject line, no headers, no "Re:")
- Match the language of the original email
- Be concise but address all points raised
- Include an appropriate greeting and sign-off`,
        messages: [{
          role: 'user',
          content: `Draft a reply to this email:

From: ${context.email.fromName || context.email.fromAddress}
Subject: ${context.email.subject}
Body:
${(context.email.bodyText || '').slice(0, 2000)}

${threadContext ? `Previous messages in thread:\n${threadContext}` : ''}`,
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      logger.info('Draft reply generated', { emailId: context.email.id, tone: context.tone });
      return text;
    } catch (error) {
      logger.error('Failed to generate draft reply', { error: (error as Error).message });
      return null;
    }
  }

  /**
   * Generate an AI-enhanced meeting prep brief
   */
  async generateMeetingBrief(input: {
    eventTitle: string;
    eventDescription?: string;
    attendees: Array<{ email: string; name?: string; company?: string; jobTitle?: string }>;
    emailHistory: Array<{ subject: string; from: string; snippet: string }>;
    talkingPoints: Array<{ category: string; point: string }>;
  }): Promise<string | null> {
    if (!this.client) return null;

    const attendeeList = input.attendees
      .map(a => `${a.name || a.email}${a.jobTitle ? ` (${a.jobTitle}${a.company ? ` at ${a.company}` : ''})` : ''}`)
      .join(', ');

    const emailContext = input.emailHistory.slice(0, 5)
      .map(e => `- "${e.subject}" from ${e.from}: ${e.snippet}`)
      .join('\n');

    try {
      const response = await this.client.messages.create({
        model: config.ai.model || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: 'You are Edith, an AI executive assistant. Create a concise meeting preparation brief. Write in the language suggested by the context (Dutch or English). Be actionable and strategic.',
        messages: [{
          role: 'user',
          content: `Create a meeting prep brief for:

Meeting: ${input.eventTitle}
${input.eventDescription ? `Description: ${input.eventDescription}` : ''}
Attendees: ${attendeeList || 'None listed'}

${emailContext ? `Recent related emails:\n${emailContext}` : ''}
${input.talkingPoints.length > 0 ? `Suggested talking points:\n${input.talkingPoints.map(p => `- [${p.category}] ${p.point}`).join('\n')}` : ''}

Provide:
1. A 2-3 sentence executive summary of what this meeting is likely about
2. Key preparation items (what to review, what to bring)
3. Strategic notes (relationship context, previous commitments)`,
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      logger.info('Meeting brief generated', { eventTitle: input.eventTitle });
      return text;
    } catch (error) {
      logger.error('Failed to generate meeting brief', { error: (error as Error).message });
      return null;
    }
  }
}

export const aiService = new AIServiceImpl();
export default aiService;
