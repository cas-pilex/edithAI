/**
 * OrchestratorAgent
 * Central coordinator that routes requests, manages multi-agent workflows,
 * and enforces approval thresholds
 */

import { BaseAgent } from './BaseAgent.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../database/client.js';
// ApprovalService will be used for workflow approvals
// import { approvalService } from '../services/ApprovalService.js';
import { agentMemoryService } from '../services/AgentMemoryService.js';
import { getConversationHistory, storeConversationMessage } from '../database/redis.js';
import type {
  AIAgentContext,
  AIAgentResult,
  AgentDomain,
  EnhancedAgentContext,
  EnhancedAgentResult,
  ApprovalCategory,
  WorkflowDefinition,
  WorkflowStep,
} from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

interface OrchestratorDecision {
  intent: string;
  targetAgent: AgentDomain;
  confidence: number;
  parameters: Record<string, unknown>;
  reasoning: string;
  secondaryAgents?: AgentDomain[];
  suggestedWorkflow?: string;
}

// AgentRoutingResult used for internal routing (kept for reference)
// interface AgentRoutingResult { agent: AgentDomain; confidence: number; reasoning: string; }

interface WorkflowExecutionResult {
  workflowId: string;
  steps: Array<{
    stepId: string;
    agent: AgentDomain;
    status: 'completed' | 'pending' | 'failed' | 'approval_required';
    result?: unknown;
    error?: string;
    approvalId?: string;
  }>;
  completed: boolean;
  finalResult?: unknown;
}

// ============================================================================
// Predefined Workflows
// ============================================================================

const WORKFLOWS: Record<string, WorkflowDefinition> = {
  new_meeting_email: {
    id: 'new_meeting_email',
    name: 'Process New Meeting Request Email',
    description: 'Handle incoming meeting request: categorize, check availability, respond',
    steps: [
      {
        id: 'categorize',
        agent: 'inbox',
        action: 'categorize_email',
        description: 'Categorize and extract meeting details',
      },
      {
        id: 'check_availability',
        agent: 'calendar',
        action: 'find_available_slots',
        description: 'Check calendar availability',
        dependsOn: ['categorize'],
      },
      {
        id: 'update_crm',
        agent: 'crm',
        action: 'log_interaction',
        description: 'Log the interaction with the contact',
        dependsOn: ['categorize'],
      },
      {
        id: 'draft_response',
        agent: 'inbox',
        action: 'draft_reply',
        description: 'Draft response with available times',
        dependsOn: ['check_availability'],
      },
    ],
    triggerConditions: {
      emailCategory: 'MEETING_REQUEST',
    },
  },
  trip_planning: {
    id: 'trip_planning',
    name: 'Plan Business Trip',
    description: 'Complete trip planning: flights, hotels, calendar, prep',
    steps: [
      {
        id: 'search_flights',
        agent: 'travel',
        action: 'search_flights',
        description: 'Search for flight options',
      },
      {
        id: 'search_hotels',
        agent: 'travel',
        action: 'search_hotels',
        description: 'Search for hotel options',
      },
      {
        id: 'create_trip',
        agent: 'travel',
        action: 'create_trip',
        description: 'Create trip record',
        dependsOn: ['search_flights', 'search_hotels'],
      },
      {
        id: 'block_calendar',
        agent: 'calendar',
        action: 'schedule_meeting',
        description: 'Block calendar for travel',
        dependsOn: ['create_trip'],
      },
    ],
    triggerConditions: {
      intent: 'plan_trip',
    },
  },
  meeting_prep: {
    id: 'meeting_prep',
    name: 'Prepare for Meeting',
    description: 'Generate meeting brief with attendee research and history',
    steps: [
      {
        id: 'research_attendees',
        agent: 'meeting_prep',
        action: 'research_attendees',
        description: 'Research meeting attendees',
      },
      {
        id: 'get_email_history',
        agent: 'meeting_prep',
        action: 'get_email_history_with_attendees',
        description: 'Get email history with attendees',
      },
      {
        id: 'get_related_tasks',
        agent: 'tasks',
        action: 'get_tasks',
        description: 'Get related tasks',
      },
      {
        id: 'generate_brief',
        agent: 'meeting_prep',
        action: 'generate_meeting_brief',
        description: 'Generate comprehensive brief',
        dependsOn: ['research_attendees', 'get_email_history', 'get_related_tasks'],
      },
    ],
    triggerConditions: {
      intent: 'prepare_meeting',
    },
  },
  daily_briefing: {
    id: 'daily_briefing',
    name: 'Daily Briefing',
    description: 'Generate daily summary across all domains',
    steps: [
      {
        id: 'inbox_summary',
        agent: 'inbox',
        action: 'summarize_email',
        description: 'Summarize important emails',
      },
      {
        id: 'calendar_overview',
        agent: 'calendar',
        action: 'optimize_day',
        description: 'Get calendar overview',
      },
      {
        id: 'task_priorities',
        agent: 'tasks',
        action: 'prioritize_tasks',
        description: 'Get priority tasks',
      },
      {
        id: 'followup_reminders',
        agent: 'crm',
        action: 'get_overdue_followups',
        description: 'Check overdue follow-ups',
      },
    ],
    triggerConditions: {
      intent: 'daily_briefing',
    },
  },
};

// ============================================================================
// Approval Thresholds
// ============================================================================

const AUTO_APPROVE_THRESHOLD = 0.9;
const REQUEST_APPROVAL_THRESHOLD = 0.7;

const HIGH_RISK_ACTIONS = [
  'send_email',
  'schedule_meeting',
  'reschedule_meeting',
  'cancel_meeting',
  'book_flight',
  'book_hotel',
  'cancel_booking',
  'delete_task',
  'delete_contact',
];

const SPENDING_THRESHOLD_EUR = 50;

// ============================================================================
// OrchestratorAgent Class
// ============================================================================

export class OrchestratorAgent extends BaseAgent {
  protected agentType = 'OrchestratorAgent';
  protected domain: AgentDomain = 'orchestrator';
  protected systemPrompt = ''; // Built dynamically via buildSystemPrompt() override

  /**
   * Build system prompt with current date/time and user timezone
   */
  private getSystemPrompt(timezone?: string): string {
    const tz = timezone || 'Europe/Amsterdam';
    const now = new Date();
    const localTime = now.toLocaleString('en-US', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' });
    const isoDate = now.toISOString().split('T')[0];

    return `You are Edith, an AI-powered personal operations assistant for entrepreneurs and busy professionals.

## Current Date & Time
- Today: ${localTime}
- ISO date: ${isoDate}
- User timezone: ${tz}

IMPORTANT: Always use the user's timezone (${tz}) for all date/time operations. When the user says "today", "tomorrow", "this week", etc., interpret them relative to ${localTime}. Pass timezone "${tz}" to any tools that accept it.

## Available Agents
- InboxAgent (inbox): Email management, drafting, prioritization
- CalendarAgent (calendar): Scheduling, meeting management, calendar optimization
- CRMAgent (crm): Contact management, relationship tracking, follow-ups
- TravelAgent (travel): Trip planning, booking, travel logistics
- TaskAgent (tasks): Task management, to-do lists, project tracking
- MeetingPrepAgent (meeting_prep): Meeting preparation, research, briefings

For each user request:
1. Identify the primary intent and domain
2. Determine which agent(s) should handle it
3. Assess confidence level (0.0-1.0)
4. Extract relevant parameters (always include timezone: "${tz}" for date-related params)
5. Identify if a predefined workflow applies
6. Provide your reasoning

Available workflows:
- new_meeting_email: Process incoming meeting requests
- trip_planning: Plan complete business trips
- meeting_prep: Prepare comprehensive meeting briefs
- daily_briefing: Generate daily summary across all domains

Respond in JSON format:
{
  "intent": "brief description of what user wants",
  "targetAgent": "agent_domain",
  "confidence": 0.0-1.0,
  "parameters": { ... extracted params ... },
  "reasoning": "why this agent and these params",
  "secondaryAgents": ["other_domains_if_needed"],
  "suggestedWorkflow": "workflow_id_if_applicable"
}

Be concise but thorough in your analysis. Always aim for high confidence when the intent is clear.
Respond in the same language the user uses. If they write in Dutch, respond in Dutch.`;
  }

  /**
   * Override base buildSystemPrompt to inject current date/time/timezone
   */
  protected buildSystemPrompt(context: AIAgentContext): string {
    return this.getSystemPrompt(context.timezone);
  }

  // ============================================================================
  // Main Entry Points
  // ============================================================================

  /**
   * Process a user request - main entry point
   */
  async process(
    context: AIAgentContext,
    userMessage: string,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const sid = sessionId || crypto.randomUUID();
    const enhancedContext = await this.createEnhancedContext(
      context,
      sid,
      crypto.randomUUID()
    );

    // Load conversation history for context
    let conversationContext = '';
    try {
      const history = await getConversationHistory(sid);
      if (history.length > 0) {
        conversationContext = '\n\n## Recent Conversation\n' +
          history.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.substring(0, 300)}`).join('\n');
      }
    } catch (error) {
      logger.debug('Failed to load conversation history', { sessionId: sid, error });
    }

    // Build message with conversation context
    const messageWithHistory = conversationContext
      ? `${conversationContext}\n\nUser (current message): ${userMessage}`
      : userMessage;

    // First, analyze the request
    const analysis = await this.analyze(enhancedContext, messageWithHistory);

    if (!analysis.success || !analysis.data) {
      return {
        success: false,
        error: analysis.error || 'Failed to analyze request',
        requiresApproval: false,
        toolsUsed: [],
        chainOfThought: ['Analysis failed'],
      };
    }

    const decision = analysis.data;

    // Check if a workflow should be used
    let result: EnhancedAgentResult<string>;
    if (decision.suggestedWorkflow && WORKFLOWS[decision.suggestedWorkflow]) {
      result = await this.executeWorkflow(
        enhancedContext,
        WORKFLOWS[decision.suggestedWorkflow],
        decision.parameters
      );
    } else {
      // Route to the appropriate agent
      result = await this.routeToAgent(enhancedContext, decision, userMessage);
    }

    // Save conversation history
    try {
      await storeConversationMessage(sid, 'user', userMessage);
      if (result.data) {
        await storeConversationMessage(sid, 'assistant', result.data.substring(0, 2000));
      }
    } catch (error) {
      logger.debug('Failed to save conversation history', { sessionId: sid, error });
    }

    return result;
  }

  /**
   * Analyze user request and determine routing
   */
  async analyze(
    context: EnhancedAgentContext,
    userMessage: string
  ): Promise<AIAgentResult<OrchestratorDecision>> {
    return this.executeAI<OrchestratorDecision>(
      context,
      userMessage,
      (content) => {
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('No JSON found in response');
          }
          return JSON.parse(jsonMatch[0]) as OrchestratorDecision;
        } catch (error) {
          logger.error('Failed to parse orchestrator response', { content, error });
          throw new Error('Failed to parse AI response');
        }
      }
    );
  }

  /**
   * Generate a direct response for simple queries
   */
  async chat(
    context: AIAgentContext,
    userMessage: string
  ): Promise<AIAgentResult<string>> {
    return this.executeAI<string>(
      { ...context },
      userMessage,
      (content) => content
    );
  }

  // ============================================================================
  // Agent Routing
  // ============================================================================

  /**
   * Route request to the appropriate agent
   */
  private async routeToAgent(
    context: EnhancedAgentContext,
    decision: OrchestratorDecision,
    userMessage: string
  ): Promise<EnhancedAgentResult<string>> {
    const { targetAgent, confidence, parameters } = decision;

    // Check approval requirements based on confidence
    if (confidence < REQUEST_APPROVAL_THRESHOLD) {
      // Low confidence - ask for clarification
      return {
        success: true,
        data: `I'm not entirely sure what you need. Could you clarify? I understood: "${decision.intent}" and was going to use the ${targetAgent} agent. Is that correct?`,
        requiresApproval: false,
        toolsUsed: [],
        chainOfThought: [
          `Low confidence (${confidence}): requesting clarification`,
          `Intended agent: ${targetAgent}`,
          `Reasoning: ${decision.reasoning}`,
        ],
      };
    }

    // Import and execute the target agent
    const agentResult = await this.executeAgentAction(
      context,
      targetAgent,
      userMessage,
      parameters
    );

    // If secondary agents are needed, coordinate them
    if (decision.secondaryAgents && decision.secondaryAgents.length > 0) {
      // Execute secondary agents (results used for side effects)
      await this.executeSecondaryAgents(
        context,
        decision.secondaryAgents,
        parameters
      );

      // Combine results
      return {
        ...agentResult,
        chainOfThought: [
          ...(agentResult.chainOfThought || []),
          `Secondary agents executed: ${decision.secondaryAgents.join(', ')}`,
        ],
      };
    }

    return agentResult;
  }

  /**
   * Execute a specific agent action
   */
  private async executeAgentAction(
    context: EnhancedAgentContext,
    agentDomain: AgentDomain,
    message: string,
    _parameters: Record<string, unknown>
  ): Promise<EnhancedAgentResult<string>> {
    try {
      // Dynamically import the agent
      const agent = await this.getAgent(agentDomain);

      if (!agent) {
        return {
          success: false,
          error: `Agent not found: ${agentDomain}`,
          requiresApproval: false,
          toolsUsed: [],
          chainOfThought: [`Failed to load agent: ${agentDomain}`],
        };
      }

      // Execute the agent
      return agent.process(context, message, context.sessionId);
    } catch (error) {
      logger.error(`Error executing agent ${agentDomain}`, { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requiresApproval: false,
        toolsUsed: [],
        chainOfThought: [`Agent execution failed: ${agentDomain}`],
      };
    }
  }

  /**
   * Execute secondary agents in parallel
   */
  private async executeSecondaryAgents(
    context: EnhancedAgentContext,
    agents: AgentDomain[],
    parameters: Record<string, unknown>
  ): Promise<EnhancedAgentResult<string>[]> {
    const results = await Promise.all(
      agents.map(agent =>
        this.executeAgentAction(context, agent, JSON.stringify(parameters), parameters)
      )
    );

    return results;
  }

  /**
   * Get an agent instance by domain
   */
  private async getAgent(domain: AgentDomain) {
    switch (domain) {
      case 'inbox':
        return (await import('./InboxAgent.js')).inboxAgent;
      case 'calendar':
        return (await import('./CalendarAgent.js')).calendarAgent;
      case 'crm':
        return (await import('./CRMAgent.js')).crmAgent;
      case 'travel':
        return (await import('./TravelAgent.js')).travelAgent;
      case 'tasks':
        return (await import('./TaskAgent.js')).taskAgent;
      case 'meeting_prep':
        return (await import('./MeetingPrepAgent.js')).meetingPrepAgent;
      default:
        return null;
    }
  }

  // ============================================================================
  // Workflow Execution
  // ============================================================================

  /**
   * Execute a multi-step workflow
   */
  private async executeWorkflow(
    context: EnhancedAgentContext,
    workflow: WorkflowDefinition,
    parameters: Record<string, unknown>
  ): Promise<EnhancedAgentResult<string>> {
    logger.info('Starting workflow execution', {
      workflowId: workflow.id,
      userId: context.userId,
    });

    const stepResults = new Map<string, unknown>();
    const executedSteps: WorkflowExecutionResult['steps'] = [];
    const toolsUsed: string[] = [];
    const chainOfThought: string[] = [`Starting workflow: ${workflow.name}`];

    // Sort steps by dependencies
    const orderedSteps = this.orderStepsByDependencies(workflow.steps);

    for (const step of orderedSteps) {
      chainOfThought.push(`Executing step: ${step.id} (${step.description})`);

      // Check if dependencies are met
      if (step.dependsOn) {
        const unmetDeps = step.dependsOn.filter(dep => !stepResults.has(dep));
        if (unmetDeps.length > 0) {
          executedSteps.push({
            stepId: step.id,
            agent: step.agent,
            status: 'failed',
            error: `Unmet dependencies: ${unmetDeps.join(', ')}`,
          });
          continue;
        }
      }

      // Build step parameters from previous results
      const stepParams = { ...parameters };
      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          stepParams[`${dep}_result`] = stepResults.get(dep);
        }
      }

      // Execute the step
      const stepResult = await this.executeAgentAction(
        context,
        step.agent,
        `Execute ${step.action}: ${JSON.stringify(stepParams)}`,
        stepParams
      );

      if (stepResult.requiresApproval) {
        executedSteps.push({
          stepId: step.id,
          agent: step.agent,
          status: 'approval_required',
          approvalId: stepResult.approvalId,
        });

        // Pause workflow for approval
        return {
          success: true,
          data: `Workflow paused at step "${step.description}". Approval required.`,
          requiresApproval: true,
          approvalId: stepResult.approvalId,
          toolsUsed,
          chainOfThought: [...chainOfThought, `Workflow paused: approval required for ${step.action}`],
        };
      }

      if (stepResult.success) {
        stepResults.set(step.id, stepResult.data);
        executedSteps.push({
          stepId: step.id,
          agent: step.agent,
          status: 'completed',
          result: stepResult.data,
        });
        toolsUsed.push(...(stepResult.toolsUsed || []));
      } else {
        executedSteps.push({
          stepId: step.id,
          agent: step.agent,
          status: 'failed',
          error: stepResult.error,
        });
        chainOfThought.push(`Step failed: ${step.id} - ${stepResult.error}`);
      }
    }

    // Summarize workflow results
    const completedSteps = executedSteps.filter(s => s.status === 'completed').length;
    const summary = `Workflow "${workflow.name}" completed. ${completedSteps}/${executedSteps.length} steps successful.`;

    chainOfThought.push(summary);

    return {
      success: completedSteps > 0,
      data: summary,
      requiresApproval: false,
      toolsUsed,
      chainOfThought,
    };
  }

  /**
   * Order workflow steps by dependencies (topological sort)
   */
  private orderStepsByDependencies(steps: WorkflowStep[]): WorkflowStep[] {
    const ordered: WorkflowStep[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const stepMap = new Map(steps.map(s => [s.id, s]));

    const visit = (step: WorkflowStep) => {
      if (visited.has(step.id)) return;
      if (visiting.has(step.id)) {
        throw new Error(`Circular dependency detected: ${step.id}`);
      }

      visiting.add(step.id);

      if (step.dependsOn) {
        for (const depId of step.dependsOn) {
          const dep = stepMap.get(depId);
          if (dep) visit(dep);
        }
      }

      visiting.delete(step.id);
      visited.add(step.id);
      ordered.push(step);
    };

    for (const step of steps) {
      visit(step);
    }

    return ordered;
  }

  // ============================================================================
  // Approval Management
  // ============================================================================

  /**
   * Determine approval category based on action and context
   * Reserved for future workflow approval integration
   */
  private _determineApprovalCategoryForAction(
    action: string,
    confidence: number,
    parameters: Record<string, unknown>
  ): ApprovalCategory {
    // High-risk actions always need approval
    if (HIGH_RISK_ACTIONS.includes(action)) {
      // Check for spending threshold
      const amount = parameters.amount || parameters.cost || parameters.price;
      if (typeof amount === 'number' && amount > SPENDING_THRESHOLD_EUR) {
        return 'ALWAYS_ASK';
      }

      // Check for VIP contacts
      const contactImportance = parameters.contactImportance as number | undefined;
      if (contactImportance && contactImportance >= 8) {
        return 'ALWAYS_ASK';
      }

      return 'REQUEST_APPROVAL';
    }

    // Confidence-based approval
    if (confidence >= AUTO_APPROVE_THRESHOLD) {
      return 'AUTO_APPROVE';
    } else if (confidence >= REQUEST_APPROVAL_THRESHOLD) {
      return 'REQUEST_APPROVAL';
    }

    return 'ALWAYS_ASK';
  }

  // ============================================================================
  // Event Processing
  // ============================================================================

  /**
   * Process incoming webhook events
   */
  async processWebhookEvent(
    userId: string,
    eventType: string,
    eventData: Record<string, unknown>
  ): Promise<EnhancedAgentResult<string>> {
    logger.info('Processing webhook event', { userId, eventType });

    // Get user context
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    });

    if (!user) {
      return {
        success: false,
        error: 'User not found',
        requiresApproval: false,
        toolsUsed: [],
        chainOfThought: [],
      };
    }

    const context = await agentMemoryService.createEnhancedContext(
      userId,
      'orchestrator',
      crypto.randomUUID(),
      crypto.randomUUID()
    );

    // Route based on event type
    switch (eventType) {
      case 'email.received':
        return this.handleNewEmail(context, eventData);
      case 'calendar.event_created':
        return this.handleNewCalendarEvent(context, eventData);
      case 'calendar.event_reminder':
        return this.handleEventReminder(context, eventData);
      default:
        logger.warn('Unknown event type', { eventType });
        return {
          success: false,
          error: `Unknown event type: ${eventType}`,
          requiresApproval: false,
          toolsUsed: [],
          chainOfThought: [],
        };
    }
  }

  /**
   * Handle new email event
   */
  private async handleNewEmail(
    context: EnhancedAgentContext,
    emailData: Record<string, unknown>
  ): Promise<EnhancedAgentResult<string>> {
    const message = `Process new email: ${JSON.stringify(emailData)}`;
    return this.executeAgentAction(context, 'inbox', message, emailData);
  }

  /**
   * Handle new calendar event
   */
  private async handleNewCalendarEvent(
    context: EnhancedAgentContext,
    eventData: Record<string, unknown>
  ): Promise<EnhancedAgentResult<string>> {
    const message = `Process new calendar event: ${JSON.stringify(eventData)}`;

    // Check if meeting prep is needed
    const attendees = eventData.attendees as Array<{ email: string }> | undefined;
    if (attendees && attendees.length > 0) {
      // Trigger meeting prep workflow
      return this.executeWorkflow(context, WORKFLOWS.meeting_prep, eventData);
    }

    return this.executeAgentAction(context, 'calendar', message, eventData);
  }

  /**
   * Handle event reminder
   */
  private async handleEventReminder(
    context: EnhancedAgentContext,
    eventData: Record<string, unknown>
  ): Promise<EnhancedAgentResult<string>> {
    // Check if meeting prep exists
    const eventId = eventData.eventId as string;
    const meetingPrepAgent = await this.getAgent('meeting_prep');

    if (meetingPrepAgent) {
      return meetingPrepAgent.process(
        context,
        `Get meeting prep for event ${eventId}`,
        context.sessionId
      );
    }

    return {
      success: false,
      error: 'Meeting prep agent not available',
      requiresApproval: false,
      toolsUsed: [],
      chainOfThought: [],
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get available workflows
   */
  getAvailableWorkflows(): WorkflowDefinition[] {
    return Object.values(WORKFLOWS);
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return WORKFLOWS[workflowId];
  }
}

export const orchestratorAgent = new OrchestratorAgent();
export default OrchestratorAgent;
