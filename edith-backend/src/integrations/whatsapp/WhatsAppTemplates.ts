/**
 * WhatsAppTemplates
 * Pre-approved WhatsApp Business message templates
 */

import { config } from '../../config/index.js';

// ============================================================================
// Types
// ============================================================================

export interface WhatsAppTemplate {
  sid: string;
  name: string;
  language: string;
  variables: string[];
  category: TemplateCategory;
}

export type TemplateCategory =
  | 'UTILITY'
  | 'MARKETING'
  | 'AUTHENTICATION';

export interface TemplateSendOptions {
  variables: Record<string, string>;
}

// ============================================================================
// Template Definitions
// ============================================================================

/**
 * These SIDs would be created in the Twilio console
 * and registered with WhatsApp Business API
 */
export const TEMPLATES: Record<string, WhatsAppTemplate> = {
  // Daily briefing template
  DAILY_BRIEFING: {
    sid: config.whatsapp?.templates?.dailyBriefing || process.env.WA_TEMPLATE_DAILY_BRIEFING || 'HX_DAILY_BRIEFING',
    name: 'daily_briefing',
    language: 'en',
    variables: ['name', 'date', 'eventCount', 'taskCount', 'emailCount'],
    category: 'UTILITY',
  },

  // Meeting reminder template
  MEETING_REMINDER: {
    sid: config.whatsapp?.templates?.meetingReminder || process.env.WA_TEMPLATE_MEETING_REMINDER || 'HX_MEETING_REMINDER',
    name: 'meeting_reminder',
    language: 'en',
    variables: ['title', 'time', 'location', 'attendees'],
    category: 'UTILITY',
  },

  // Important email alert template
  EMAIL_ALERT: {
    sid: config.whatsapp?.templates?.emailAlert || process.env.WA_TEMPLATE_EMAIL_ALERT || 'HX_EMAIL_ALERT',
    name: 'email_alert',
    language: 'en',
    variables: ['from', 'subject', 'snippet'],
    category: 'UTILITY',
  },

  // Approval request template
  APPROVAL_REQUEST: {
    sid: config.whatsapp?.templates?.approvalRequest || process.env.WA_TEMPLATE_APPROVAL_REQUEST || 'HX_APPROVAL_REQUEST',
    name: 'approval_request',
    language: 'en',
    variables: ['type', 'title', 'requestedBy', 'deadline'],
    category: 'UTILITY',
  },

  // Task reminder template
  TASK_REMINDER: {
    sid: config.whatsapp?.templates?.taskReminder || process.env.WA_TEMPLATE_TASK_REMINDER || 'HX_TASK_REMINDER',
    name: 'task_reminder',
    language: 'en',
    variables: ['title', 'dueDate', 'priority'],
    category: 'UTILITY',
  },

  // Flight update template
  FLIGHT_UPDATE: {
    sid: config.whatsapp?.templates?.flightUpdate || process.env.WA_TEMPLATE_FLIGHT_UPDATE || 'HX_FLIGHT_UPDATE',
    name: 'flight_update',
    language: 'en',
    variables: ['flightNumber', 'status', 'departureTime', 'gate'],
    category: 'UTILITY',
  },

  // Welcome message template
  WELCOME: {
    sid: config.whatsapp?.templates?.welcome || process.env.WA_TEMPLATE_WELCOME || 'HX_WELCOME',
    name: 'welcome',
    language: 'en',
    variables: ['name'],
    category: 'UTILITY',
  },

  // Verification code template
  VERIFICATION_CODE: {
    sid: config.whatsapp?.templates?.verificationCode || process.env.WA_TEMPLATE_VERIFICATION || 'HX_VERIFICATION',
    name: 'verification_code',
    language: 'en',
    variables: ['code'],
    category: 'AUTHENTICATION',
  },
};

// ============================================================================
// Template Helper Functions
// ============================================================================

export class WhatsAppTemplatesHelper {
  /**
   * Get template by name
   */
  static getTemplate(name: string): WhatsAppTemplate | undefined {
    return TEMPLATES[name];
  }

  /**
   * Validate template variables
   */
  static validateVariables(
    template: WhatsAppTemplate,
    variables: Record<string, string>
  ): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const varName of template.variables) {
      if (!variables[varName]) {
        missing.push(varName);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Format variables for Twilio API
   * Twilio expects variables as numbered placeholders: {{1}}, {{2}}, etc.
   */
  static formatVariablesForTwilio(
    template: WhatsAppTemplate,
    variables: Record<string, string>
  ): Record<string, string> {
    const formatted: Record<string, string> = {};

    template.variables.forEach((varName, index) => {
      const key = (index + 1).toString();
      formatted[key] = variables[varName] || '';
    });

    return formatted;
  }

  /**
   * Build template body for preview/logging
   */
  static buildPreviewBody(
    templateName: string,
    variables: Record<string, string>
  ): string {
    // This would be based on actual template content
    // For now, return a generic preview
    const varStr = Object.entries(variables)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return `[Template: ${templateName}] Variables: ${varStr}`;
  }

  // ============================================================================
  // Specific Template Builders
  // ============================================================================

  /**
   * Build daily briefing template variables
   */
  static buildDailyBriefingVariables(data: {
    name: string;
    date: Date;
    eventCount: number;
    taskCount: number;
    emailCount: number;
  }): Record<string, string> {
    return {
      name: data.name,
      date: data.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      eventCount: data.eventCount.toString(),
      taskCount: data.taskCount.toString(),
      emailCount: data.emailCount.toString(),
    };
  }

  /**
   * Build meeting reminder template variables
   */
  static buildMeetingReminderVariables(data: {
    title: string;
    time: Date;
    location?: string;
    attendees: string[];
  }): Record<string, string> {
    return {
      title: data.title,
      time: data.time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      location: data.location || 'No location specified',
      attendees: data.attendees.slice(0, 3).join(', ') +
        (data.attendees.length > 3 ? ` +${data.attendees.length - 3} others` : ''),
    };
  }

  /**
   * Build email alert template variables
   */
  static buildEmailAlertVariables(data: {
    from: string;
    subject: string;
    snippet: string;
  }): Record<string, string> {
    return {
      from: data.from,
      subject: data.subject.substring(0, 100),
      snippet: data.snippet.substring(0, 200),
    };
  }

  /**
   * Build approval request template variables
   */
  static buildApprovalRequestVariables(data: {
    type: string;
    title: string;
    requestedBy: string;
    deadline?: Date;
  }): Record<string, string> {
    return {
      type: data.type,
      title: data.title.substring(0, 100),
      requestedBy: data.requestedBy,
      deadline: data.deadline
        ? data.deadline.toLocaleDateString('en-US')
        : 'No deadline',
    };
  }

  /**
   * Build task reminder template variables
   */
  static buildTaskReminderVariables(data: {
    title: string;
    dueDate: Date;
    priority: string;
  }): Record<string, string> {
    return {
      title: data.title.substring(0, 100),
      dueDate: data.dueDate.toLocaleDateString('en-US'),
      priority: data.priority,
    };
  }

  /**
   * Build flight update template variables
   */
  static buildFlightUpdateVariables(data: {
    flightNumber: string;
    status: string;
    departureTime: Date;
    gate?: string;
  }): Record<string, string> {
    return {
      flightNumber: data.flightNumber,
      status: data.status,
      departureTime: data.departureTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      gate: data.gate || 'TBD',
    };
  }

  /**
   * Build welcome template variables
   */
  static buildWelcomeVariables(data: { name: string }): Record<string, string> {
    return {
      name: data.name,
    };
  }

  /**
   * Build verification code template variables
   */
  static buildVerificationCodeVariables(data: { code: string }): Record<string, string> {
    return {
      code: data.code,
    };
  }
}

export default WhatsAppTemplatesHelper;
