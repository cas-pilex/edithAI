/**
 * MeetingPrepAgent
 * Specialized agent for meeting preparation, attendee research, and brief generation
 */

import { BaseAgent } from './BaseAgent.js';
import { registerMeetingPrepTools } from './tools/meetingprep.tools.js';
import type {
  AIAgentContext,
  EnhancedAgentResult,
  AgentDomain,
} from '../types/index.js';

// Register meeting prep tools on import
registerMeetingPrepTools();

const MEETING_PREP_SYSTEM_PROMPT = `You are Edith's Meeting Prep Agent, an intelligent assistant that helps prepare for meetings by researching attendees, gathering context, and generating comprehensive briefs.

## Your Capabilities
- Generate comprehensive meeting briefs
- Research attendee backgrounds and history
- Pull relevant email history with attendees
- Suggest talking points and agenda items
- Save and retrieve meeting notes
- Schedule prep reminders before meetings

## Meeting Prep Components

### Attendee Research
For each attendee, gather:
- Name, title, and company
- Relationship history (past interactions)
- Recent communication topics
- Any pending follow-ups with them
- Personal notes (interests, family mentions, etc.)
- Importance/VIP status

### Context Gathering
- Recent emails on the meeting topic
- Related tasks and action items
- Previous meeting notes with these attendees
- Any commitments or promises made
- Relevant project status

### Talking Points
Generate talking points considering:
1. Meeting agenda/purpose
2. Outstanding items with attendees
3. Recent developments they should know
4. Questions to ask
5. Decisions needed
6. Next steps to propose

## Brief Structure
A complete meeting brief includes:
1. **Meeting Overview**: Title, time, duration, attendees, location/link
2. **Attendee Profiles**: Background on each participant
3. **Context**: Relevant recent communications and history
4. **Talking Points**: Suggested discussion items
5. **Goals**: What should be achieved in this meeting
6. **Preparation Checklist**: Things to review/prepare before

## Best Practices
- Generate briefs 24-48 hours before meetings
- Prioritize talking points by importance
- Include specific examples/data when relevant
- Note any sensitive topics to handle carefully
- Suggest questions that drive productive discussion
- Consider cultural/communication preferences
- Track follow-through on past meeting commitments

## Meeting Notes Guidelines
After meetings, capture:
- Key decisions made
- Action items with owners and deadlines
- Important discussion points
- Commitments made by any party
- Follow-up meeting needs
- New contacts introduced`;

export class MeetingPrepAgent extends BaseAgent {
  protected agentType = 'MeetingPrepAgent';
  protected domain: AgentDomain = 'meeting_prep';
  protected systemPrompt = MEETING_PREP_SYSTEM_PROMPT;

  /**
   * Process a meeting prep request
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
   * Generate a comprehensive meeting brief
   */
  async generateBrief(
    context: AIAgentContext,
    eventId: string,
    options?: {
      includeAttendeeResearch?: boolean;
      includeEmailHistory?: boolean;
      includeTalkingPoints?: boolean;
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const {
      includeAttendeeResearch = true,
      includeEmailHistory = true,
      includeTalkingPoints = true
    } = options || {};

    const components = [];
    if (includeAttendeeResearch) components.push('attendee research');
    if (includeEmailHistory) components.push('relevant email history');
    if (includeTalkingPoints) components.push('suggested talking points');

    const message = `Generate a comprehensive meeting brief for event ${eventId}. Include: ${components.join(', ')}. Make it actionable and focused on what I need to know before the meeting.`;

    return this.process(context, message, sessionId);
  }

  /**
   * Research specific attendees
   */
  async researchAttendees(
    context: AIAgentContext,
    emails: string[],
    options?: {
      includeInteractionHistory?: boolean;
      depth?: 'basic' | 'detailed';
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { includeInteractionHistory = true, depth = 'detailed' } = options || {};

    let message = `Research the following meeting attendees: ${emails.join(', ')}.`;

    if (depth === 'detailed') {
      message += ` For each person, provide:
1. Their role and company
2. Our relationship history and past interactions
3. Any pending follow-ups or commitments
4. Communication style and preferences
5. Key topics we've discussed
6. Any personal notes (interests, family, etc.)`;
    } else {
      message += ` Provide a brief profile for each including role, company, and our relationship status.`;
    }

    if (includeInteractionHistory) {
      message += ` Include recent interaction history.`;
    }

    return this.process(context, message, sessionId);
  }

  /**
   * Get email history with specific attendees
   */
  async getEmailHistory(
    context: AIAgentContext,
    emails: string[],
    options?: {
      limit?: number;
      daysBack?: number;
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { limit = 20, daysBack = 90 } = options || {};

    const message = `Retrieve email history with ${emails.join(', ')} from the last ${daysBack} days. Show up to ${limit} relevant emails, grouped by conversation thread. Highlight key topics and any unresolved items.`;

    return this.process(context, message, sessionId);
  }

  /**
   * Generate talking points for a meeting
   */
  async generateTalkingPoints(
    context: AIAgentContext,
    eventId: string,
    focusAreas?: string[],
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    let message = `Generate talking points for meeting ${eventId}.`;

    if (focusAreas && focusAreas.length > 0) {
      message += ` Focus on these areas: ${focusAreas.join(', ')}.`;
    }

    message += ` Include:
1. Key agenda items to cover
2. Questions to ask
3. Updates to share
4. Decisions that need to be made
5. Follow-up items from previous meetings
6. Potential discussion points based on recent communications

Prioritize by importance and time sensitivity.`;

    return this.process(context, message, sessionId);
  }

  /**
   * Save meeting notes
   */
  async saveNotes(
    context: AIAgentContext,
    eventId: string,
    notes: string,
    options?: {
      actionItems?: Array<{ task: string; assignee?: string; dueDate?: Date }>;
      keyDecisions?: string[];
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { actionItems = [], keyDecisions = [] } = options || {};

    let message = `Save meeting notes for event ${eventId}:\n\n${notes}`;

    if (actionItems.length > 0) {
      message += `\n\nAction items:\n`;
      actionItems.forEach((item, i) => {
        message += `${i + 1}. ${item.task}`;
        if (item.assignee) message += ` (assigned to: ${item.assignee})`;
        if (item.dueDate) message += ` (due: ${item.dueDate.toDateString()})`;
        message += '\n';
      });
    }

    if (keyDecisions.length > 0) {
      message += `\n\nKey decisions:\n`;
      keyDecisions.forEach((decision, i) => {
        message += `${i + 1}. ${decision}\n`;
      });
    }

    message += `\n\nCreate tasks from action items if appropriate.`;

    return this.process(context, message, sessionId);
  }

  /**
   * Get existing meeting prep
   */
  async getExistingPrep(
    context: AIAgentContext,
    eventId: string,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const message = `Retrieve any existing meeting preparation materials for event ${eventId}. Include the brief, notes, and any saved talking points.`;

    return this.process(context, message, sessionId);
  }

  /**
   * Schedule a prep reminder
   */
  async scheduleReminder(
    context: AIAgentContext,
    eventId: string,
    minutesBefore: number = 60,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const message = `Schedule a meeting prep reminder for event ${eventId}, ${minutesBefore} minutes before the meeting starts. Include the meeting brief in the reminder.`;

    return this.process(context, message, sessionId);
  }

  /**
   * Prepare for all upcoming meetings
   */
  async prepareUpcoming(
    context: AIAgentContext,
    options?: {
      hoursAhead?: number;
      generateBriefs?: boolean;
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { hoursAhead = 24, generateBriefs = true } = options || {};

    let message = `Review all meetings in the next ${hoursAhead} hours and:
1. List each meeting with time, attendees, and purpose
2. Check if meeting prep exists for each
3. Flag meetings that need preparation`;

    if (generateBriefs) {
      message += `\n4. Generate briefs for any meetings without existing prep`;
    }

    message += `\n\nPrioritize by importance and proximity.`;

    return this.process(context, message, sessionId);
  }

  /**
   * Post-meeting follow-up
   */
  async generateFollowUp(
    context: AIAgentContext,
    eventId: string,
    meetingNotes?: string,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    let message = `Generate post-meeting follow-up for event ${eventId}.`;

    if (meetingNotes) {
      message += `\n\nMeeting notes:\n${meetingNotes}`;
    }

    message += `\n\nPlease:
1. Summarize key outcomes and decisions
2. List all action items with owners
3. Draft a follow-up email to attendees
4. Create tasks for my action items
5. Set any necessary follow-up reminders`;

    return this.process(context, message, sessionId);
  }
}

export const meetingPrepAgent = new MeetingPrepAgent();
export default meetingPrepAgent;
