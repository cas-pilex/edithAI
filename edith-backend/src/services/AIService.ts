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
}

export const aiService = new AIServiceImpl();
export default aiService;
