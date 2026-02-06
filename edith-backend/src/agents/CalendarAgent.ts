/**
 * CalendarAgent
 * Specialized agent for smart scheduling, buffer time management, and conflict resolution
 */

import { BaseAgent } from './BaseAgent.js';
import { registerCalendarTools } from './tools/calendar.tools.js';
import type {
  AIAgentContext,
  EnhancedAgentResult,
  AgentDomain,
} from '../types/index.js';

// Register calendar tools on import
registerCalendarTools();

const CALENDAR_SYSTEM_PROMPT = `You are Edith's Calendar Agent, an intelligent scheduling assistant that helps manage the user's calendar efficiently.

## Your Capabilities
- Find available meeting slots based on preferences and constraints
- Schedule meetings with appropriate buffer times
- Reschedule existing meetings when needed
- Cancel meetings (with appropriate approvals)
- Add buffer time before/after meetings
- Calculate travel time between locations
- Detect and resolve scheduling conflicts
- Suggest daily schedule optimizations
- Block focus time for deep work

## Scheduling Guidelines

### Meeting Slot Selection
1. **Respect working hours**: Only suggest times within the user's configured working hours
2. **Buffer time**: Always consider travel time and buffer needs between meetings
3. **Meeting clusters**: Group meetings when possible to preserve focus time
4. **Energy levels**: Prefer mornings for important meetings, afternoons for lighter ones

### Conflict Resolution
1. **Priority order**: VIP attendees > recurring meetings > one-time meetings
2. **Flexibility**: Suggest alternative times when conflicts arise
3. **Communication**: Explain the reasoning behind rescheduling suggestions

### Focus Time Protection
1. **Block protection**: Protect user's designated focus time blocks
2. **Meeting-free days**: Respect any configured meeting-free days
3. **Recovery time**: Ensure gaps after intensive meetings

## Best Practices
- Always check for conflicts before scheduling
- Include travel time for in-person meetings
- Suggest video call for short meetings to save travel time
- Consider timezone differences for attendees
- Propose multiple options when scheduling new meetings
- Respect meeting preferences (duration, time of day)
- Keep mornings free for focus work when possible

## Time Estimates
- Standard meeting: 30 minutes
- Detailed discussion: 60 minutes
- Quick sync: 15 minutes
- Buffer time: 15 minutes default, 30 minutes before important meetings
- Travel time: Calculate based on locations (default 30 minutes if unknown)`;

export class CalendarAgent extends BaseAgent {
  protected agentType = 'CalendarAgent';
  protected domain: AgentDomain = 'calendar';
  protected systemPrompt = CALENDAR_SYSTEM_PROMPT;

  /**
   * Process a calendar-related request
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
   * Find available meeting slots
   */
  async findAvailableSlots(
    context: AIAgentContext,
    options: {
      duration: number;
      attendees?: string[];
      startDate?: Date;
      endDate?: Date;
      preferredTimes?: string[];
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { duration, attendees = [], startDate, endDate, preferredTimes = [] } = options;

    let message = `Find available ${duration}-minute meeting slots`;
    if (attendees.length > 0) {
      message += ` with ${attendees.join(', ')}`;
    }
    if (startDate && endDate) {
      message += ` between ${startDate.toISOString()} and ${endDate.toISOString()}`;
    }
    if (preferredTimes.length > 0) {
      message += `. Prefer times around: ${preferredTimes.join(', ')}`;
    }

    return this.process(context, message, sessionId);
  }

  /**
   * Schedule a new meeting
   */
  async scheduleMeeting(
    context: AIAgentContext,
    details: {
      title: string;
      description?: string;
      duration: number;
      attendees: string[];
      preferredDate?: Date;
      isVirtual?: boolean;
      location?: string;
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { title, description, duration, attendees, preferredDate, isVirtual, location } = details;

    let message = `Schedule a ${duration}-minute meeting titled "${title}"`;
    if (description) message += ` about: ${description}`;
    message += ` with attendees: ${attendees.join(', ')}`;
    if (preferredDate) message += `. Preferred date: ${preferredDate.toISOString()}`;
    if (isVirtual !== undefined) message += `. Meeting type: ${isVirtual ? 'virtual' : 'in-person'}`;
    if (location) message += `. Location: ${location}`;

    return this.process(context, message, sessionId);
  }

  /**
   * Reschedule an existing meeting
   */
  async rescheduleMeeting(
    context: AIAgentContext,
    eventId: string,
    reason?: string,
    preferredTime?: Date,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    let message = `Reschedule the meeting ${eventId}`;
    if (reason) message += `. Reason: ${reason}`;
    if (preferredTime) message += `. Preferred new time: ${preferredTime.toISOString()}`;
    message += `. Find the best alternative time and update the meeting.`;

    return this.process(context, message, sessionId);
  }

  /**
   * Check and resolve conflicts
   */
  async resolveConflicts(
    context: AIAgentContext,
    date?: Date,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const targetDate = date || new Date();
    const message = `Check for scheduling conflicts on ${targetDate.toDateString()} and suggest resolutions for any conflicts found. Consider attendee importance and meeting types when proposing solutions.`;

    return this.process(context, message, sessionId);
  }

  /**
   * Optimize the day's schedule
   */
  async optimizeDay(
    context: AIAgentContext,
    date?: Date,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const targetDate = date || new Date();
    const message = `Analyze and optimize my schedule for ${targetDate.toDateString()}. Suggest improvements like:
- Clustering meetings to preserve focus time
- Adding necessary buffer time
- Identifying potential conflicts
- Recommending focus time blocks
- Evaluating meeting necessity`;

    return this.process(context, message, sessionId);
  }

  /**
   * Block focus time
   */
  async blockFocusTime(
    context: AIAgentContext,
    options: {
      duration: number;
      recurring?: boolean;
      preferredTime?: string;
      title?: string;
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { duration, recurring = false, preferredTime, title = 'Focus Time' } = options;

    let message = `Block ${duration} minutes of focus time titled "${title}"`;
    if (recurring) message += `. Make it a recurring daily event`;
    if (preferredTime) message += `. Preferred time: ${preferredTime}`;
    message += `. Find a time that doesn't conflict with existing meetings and protects this time for deep work.`;

    return this.process(context, message, sessionId);
  }

  /**
   * Get daily briefing
   */
  async getDailyBriefing(
    context: AIAgentContext,
    date?: Date,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const targetDate = date || new Date();
    const message = `Provide a briefing for ${targetDate.toDateString()}:
1. List all scheduled meetings with times and attendees
2. Highlight any potential conflicts or tight transitions
3. Note any meetings that need preparation
4. Identify available focus time blocks
5. Mention any travel time considerations`;

    return this.process(context, message, sessionId);
  }
}

export const calendarAgent = new CalendarAgent();
export default calendarAgent;
