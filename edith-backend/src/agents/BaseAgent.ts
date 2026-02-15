import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlock, MessageParam, Tool, ToolResultBlockParam, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';
import { config } from '../config/index.js';
import { auditService } from '../services/AuditService.js';
import { logger, logAI } from '../utils/logger.js';
import { prisma } from '../database/client.js';
import {
  checkAIRateLimit,
  incrementAIRateLimit,
  storeRecentAction,
  getRecentActions,
} from '../database/redis.js';
import { toolRegistry } from './tools/index.js';
import type {
  AIAgentContext,
  AIAgentResult,
  AgentDomain,
  EnhancedAgentContext,
  EnhancedAgentResult,
  ApprovalCategory,
  ApprovalRequest,
  StreamChunk,
  RecentAction,
  UserPatternData,
} from '../types/index.js';

/**
 * Configuration for tool execution
 */
interface ToolExecutionConfig {
  maxIterations: number;
  enableApprovals: boolean;
  enableLearning: boolean;
}

const DEFAULT_TOOL_CONFIG: ToolExecutionConfig = {
  maxIterations: 10,
  enableApprovals: true,
  enableLearning: true,
};

/**
 * Enhanced Base Agent with tool calling, rate limiting, memory, and approval workflows
 */
export abstract class BaseAgent {
  protected client: Anthropic | null = null;
  protected abstract agentType: string;
  protected abstract systemPrompt: string;
  protected abstract domain: AgentDomain;

  constructor() {
    if (config.ai.apiKey) {
      this.client = new Anthropic({
        apiKey: config.ai.apiKey,
      });
    }
  }

  // ============================================================================
  // Core AI Execution
  // ============================================================================

  /**
   * Execute an AI task (legacy method for backwards compatibility)
   */
  protected async executeAI<T>(
    context: AIAgentContext,
    userMessage: string,
    parseResponse: (content: string) => T
  ): Promise<AIAgentResult<T>> {
    const startTime = Date.now();

    if (!this.client) {
      return {
        success: false,
        error: 'AI service not configured',
      };
    }

    try {
      logAI(this.agentType, 'execute', context.userId, { messageLength: userMessage.length });

      const messages: MessageParam[] = [];

      // Add conversation history if provided
      if (context.conversationHistory) {
        for (const msg of context.conversationHistory) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      // Add current message
      messages.push({ role: 'user', content: userMessage });

      const response = await this.client.messages.create({
        model: config.ai.model,
        max_tokens: config.ai.maxTokens,
        system: this.buildSystemPrompt(context),
        messages,
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const result = parseResponse(content.text);
      const duration = Date.now() - startTime;

      // Log the action
      await auditService.logAgentAction(
        context.userId,
        this.agentType,
        'execute',
        { message: userMessage.substring(0, 200) },
        { resultType: typeof result },
        'SUCCESS',
        undefined,
        duration
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(`${this.agentType} execution failed`, {
        error: errorMessage,
        userId: context.userId,
      });

      await auditService.logAgentAction(
        context.userId,
        this.agentType,
        'execute',
        { message: userMessage.substring(0, 200) },
        { error: errorMessage },
        'FAILURE',
        undefined,
        duration
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  // ============================================================================
  // Enhanced Tool-Based Execution
  // ============================================================================

  /**
   * Execute an AI task with tool calling capabilities
   */
  protected async executeWithTools<T = string>(
    context: EnhancedAgentContext,
    userMessage: string,
    toolConfig: Partial<ToolExecutionConfig> = {}
  ): Promise<EnhancedAgentResult<T>> {
    const startTime = Date.now();
    const executionConfig = { ...DEFAULT_TOOL_CONFIG, ...toolConfig };
    const toolsUsed: string[] = [];
    const chainOfThought: string[] = [];

    if (!this.client) {
      return {
        success: false,
        error: 'AI service not configured',
        requiresApproval: false,
        toolsUsed: [],
        chainOfThought: [],
      };
    }

    // Check rate limit
    const rateLimit = await this.checkRateLimit(context.userId);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Rate limit exceeded. Resets at ${new Date(rateLimit.resetAt).toISOString()}`,
        requiresApproval: false,
        toolsUsed: [],
        chainOfThought: [],
      };
    }

    try {
      logAI(this.agentType, 'executeWithTools', context.userId, {
        messageLength: userMessage.length,
        domain: this.domain,
      });

      // Get domain tools
      const domainTools = toolRegistry.getForDomain(this.domain);
      const anthropicTools: Tool[] = domainTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema as Tool['input_schema'],
      }));

      // Build messages
      const messages: MessageParam[] = [];

      if (context.conversationHistory) {
        for (const msg of context.conversationHistory) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      messages.push({ role: 'user', content: userMessage });

      // Initial API call
      let response = await this.client.messages.create({
        model: config.ai.model,
        max_tokens: config.ai.maxTokens,
        system: this.buildEnhancedSystemPrompt(context),
        messages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      });

      await incrementAIRateLimit(context.userId);

      let iterations = 0;
      const allContent: ContentBlock[] = [...response.content];

      // Tool calling loop
      while (response.stop_reason === 'tool_use' && iterations < executionConfig.maxIterations) {
        iterations++;

        // Extract tool use blocks
        const toolUseBlocks = response.content.filter(
          (block): block is ToolUseBlock => block.type === 'tool_use'
        );

        // Process each tool call
        const toolResults: ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          const toolName = toolUse.name;
          const toolInput = toolUse.input as Record<string, unknown>;

          toolsUsed.push(toolName);
          chainOfThought.push(`Calling tool: ${toolName}`);

          // Check approval category
          const approvalCategory = this.determineApprovalCategory(toolName, context);

          if (executionConfig.enableApprovals && approvalCategory !== 'AUTO_APPROVE') {
            // Create approval request and pause
            const approvalRequest = await this.createApprovalRequest(
              context,
              toolName,
              toolInput,
              approvalCategory
            );

            return {
              success: true,
              data: undefined as unknown as T,
              requiresApproval: true,
              approvalId: approvalRequest.id,
              toolsUsed,
              chainOfThought: [...chainOfThought, `Requires approval: ${approvalCategory}`],
            };
          }

          // Execute tool
          const handlerResult = await toolRegistry.execute(toolName, toolInput, context);

          // Convert handler result to tool result format
          const toolResult: ToolResultBlockParam = {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: handlerResult.success
              ? JSON.stringify(handlerResult.data)
              : JSON.stringify({ error: handlerResult.error }),
            is_error: !handlerResult.success,
          };

          toolResults.push(toolResult);

          // Store action in memory
          if (executionConfig.enableLearning) {
            await this.recordAction(context, toolName, toolInput, handlerResult);
          }
        }

        // Continue conversation with tool results
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });

        // Make next API call
        response = await this.client.messages.create({
          model: config.ai.model,
          max_tokens: config.ai.maxTokens,
          system: this.buildEnhancedSystemPrompt(context),
          messages,
          tools: anthropicTools.length > 0 ? anthropicTools : undefined,
        });

        await incrementAIRateLimit(context.userId);
        allContent.push(...response.content);
      }

      // Extract final text response
      const textBlocks = response.content.filter(block => block.type === 'text');
      const finalResponse = textBlocks.map(block => {
        if (block.type === 'text') {
          return block.text;
        }
        return '';
      }).join('\n');

      const duration = Date.now() - startTime;

      // Log action
      await auditService.logAgentAction(
        context.userId,
        this.agentType,
        'executeWithTools',
        {
          message: userMessage.substring(0, 200),
          toolsUsed,
          iterations,
        },
        { responseLength: finalResponse.length },
        'SUCCESS',
        undefined,
        duration
      );

      return {
        success: true,
        data: finalResponse as unknown as T,
        requiresApproval: false,
        toolsUsed,
        chainOfThought,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(`${this.agentType} tool execution failed`, {
        error: errorMessage,
        userId: context.userId,
        domain: this.domain,
      });

      await auditService.logAgentAction(
        context.userId,
        this.agentType,
        'executeWithTools',
        { message: userMessage.substring(0, 200), toolsUsed },
        { error: errorMessage },
        'FAILURE',
        undefined,
        duration
      );

      return {
        success: false,
        error: errorMessage,
        requiresApproval: false,
        toolsUsed,
        chainOfThought,
      };
    }
  }

  /**
   * Execute with streaming support
   */
  protected async executeWithToolsStream(
    context: EnhancedAgentContext,
    userMessage: string,
    onChunk: (chunk: StreamChunk) => void,
    toolConfig: Partial<ToolExecutionConfig> = {}
  ): Promise<EnhancedAgentResult<string>> {
    const startTime = Date.now();
    const executionConfig = { ...DEFAULT_TOOL_CONFIG, ...toolConfig };
    const toolsUsed: string[] = [];
    const chainOfThought: string[] = [];
    let fullResponse = '';

    if (!this.client) {
      return {
        success: false,
        error: 'AI service not configured',
        requiresApproval: false,
        toolsUsed: [],
        chainOfThought: [],
      };
    }

    // Check rate limit
    const rateLimit = await this.checkRateLimit(context.userId);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Rate limit exceeded. Resets at ${new Date(rateLimit.resetAt).toISOString()}`,
        requiresApproval: false,
        toolsUsed: [],
        chainOfThought: [],
      };
    }

    try {
      // Get domain tools
      const domainTools = toolRegistry.getForDomain(this.domain);
      const anthropicTools: Tool[] = domainTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema as Tool['input_schema'],
      }));

      // Build messages
      const messages: MessageParam[] = [];

      if (context.conversationHistory) {
        for (const msg of context.conversationHistory) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      messages.push({ role: 'user', content: userMessage });

      // Create streaming response
      const stream = this.client.messages.stream({
        model: config.ai.model,
        max_tokens: config.ai.maxTokens,
        system: this.buildEnhancedSystemPrompt(context),
        messages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      });

      // Handle stream events
      stream.on('text', (text) => {
        fullResponse += text;
        onChunk({
          type: 'text',
          content: text,
          timestamp: new Date(),
        });
      });

      stream.on('inputJson', (inputJson, _snapshot) => {
        onChunk({
          type: 'tool_input',
          content: JSON.stringify(inputJson),
          toolName: 'pending',
          timestamp: new Date(),
        });
      });

      // Wait for completion
      const response = await stream.finalMessage();
      await incrementAIRateLimit(context.userId);

      // Check if we need to handle tool use
      if (response.stop_reason === 'tool_use') {
        // For streaming with tool use, we need to continue in non-streaming mode
        // to properly handle tool results
        const toolUseBlocks = response.content.filter(
          (block): block is ToolUseBlock => block.type === 'tool_use'
        );

        for (const toolUse of toolUseBlocks) {
          const toolName = toolUse.name;
          const toolInput = toolUse.input as Record<string, unknown>;

          toolsUsed.push(toolName);
          chainOfThought.push(`Calling tool: ${toolName}`);

          onChunk({
            type: 'tool_call',
            content: JSON.stringify({ name: toolName, input: toolInput }),
            toolName,
            timestamp: new Date(),
          });

          // Check approval
          const approvalCategory = this.determineApprovalCategory(toolName, context);

          if (executionConfig.enableApprovals && approvalCategory !== 'AUTO_APPROVE') {
            const approvalRequest = await this.createApprovalRequest(
              context,
              toolName,
              toolInput,
              approvalCategory
            );

            onChunk({
              type: 'approval_required',
              content: JSON.stringify({ approvalId: approvalRequest.id }),
              timestamp: new Date(),
            });

            return {
              success: true,
              data: fullResponse,
              requiresApproval: true,
              approvalId: approvalRequest.id,
              toolsUsed,
              chainOfThought,
            };
          }

          // Execute tool
          const handlerResult = await toolRegistry.execute(toolName, toolInput, context);

          onChunk({
            type: 'tool_result',
            content: JSON.stringify(handlerResult),
            toolName,
            timestamp: new Date(),
          });

          // Store action
          if (executionConfig.enableLearning) {
            await this.recordAction(context, toolName, toolInput, handlerResult);
          }
        }
      }

      onChunk({
        type: 'done',
        content: '',
        timestamp: new Date(),
      });

      const duration = Date.now() - startTime;

      await auditService.logAgentAction(
        context.userId,
        this.agentType,
        'executeWithToolsStream',
        { message: userMessage.substring(0, 200), toolsUsed },
        { responseLength: fullResponse.length },
        'SUCCESS',
        undefined,
        duration
      );

      return {
        success: true,
        data: fullResponse,
        requiresApproval: false,
        toolsUsed,
        chainOfThought,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(`${this.agentType} streaming execution failed`, {
        error: errorMessage,
        userId: context.userId,
      });

      onChunk({
        type: 'error',
        content: errorMessage,
        timestamp: new Date(),
      });

      await auditService.logAgentAction(
        context.userId,
        this.agentType,
        'executeWithToolsStream',
        { message: userMessage.substring(0, 200), toolsUsed },
        { error: errorMessage },
        'FAILURE',
        undefined,
        duration
      );

      return {
        success: false,
        error: errorMessage,
        requiresApproval: false,
        toolsUsed,
        chainOfThought,
      };
    }
  }

  // ============================================================================
  // Rate Limiting
  // ============================================================================

  /**
   * Check if user is within rate limits
   */
  protected async checkRateLimit(userId: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
  }> {
    return checkAIRateLimit(userId);
  }

  // ============================================================================
  // Memory & Context
  // ============================================================================

  /**
   * Get recent actions for this domain
   */
  protected async getRecentActions(
    userId: string,
    limit: number = 20
  ): Promise<RecentAction[]> {
    return getRecentActions<RecentAction>(userId, this.domain, limit);
  }

  /**
   * Record an action for learning
   */
  protected async recordAction(
    context: EnhancedAgentContext,
    action: string,
    input: Record<string, unknown>,
    result: { success: boolean; data?: unknown; error?: string }
  ): Promise<void> {
    const actionRecord: RecentAction = {
      id: crypto.randomUUID(),
      agentType: this.agentType,
      action,
      summary: `${this.agentType}: ${action}`,
      input,
      output: result.success ? (result.data as Record<string, unknown>) : undefined,
      timestamp: new Date(),
      status: result.success ? 'SUCCESS' : 'FAILURE',
      confidence: 0.8,
    };

    await storeRecentAction(context.userId, this.domain, actionRecord);

    // Also store in database for long-term learning
    await prisma.actionLog.create({
      data: {
        userId: context.userId,
        agentType: this.agentType,
        action,
        input: input as object,
        output: result.success ? (result.data as object ?? {}) : { error: result.error },
        status: result.success ? 'SUCCESS' : 'FAILURE',
        duration: 0, // Will be set by caller
      },
    });
  }

  /**
   * Load user context including patterns and preferences
   */
  protected async loadUserContext(userId: string): Promise<{
    patterns: UserPatternData[];
    recentActions: RecentAction[];
  }> {
    // Get recent actions from Redis
    const recentActions = await this.getRecentActions(userId);

    // Get learned patterns from database
    const patterns = await prisma.userPattern.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: { confidence: 'desc' },
      take: 10,
    });

    return {
      patterns: patterns.map(p => ({
        id: p.id,
        type: p.patternType,
        data: p.patternData as Record<string, unknown>,
        confidence: p.confidence,
        occurrences: p.occurrences,
      })),
      recentActions,
    };
  }

  // ============================================================================
  // Approval Workflow
  // ============================================================================

  /**
   * Determine the approval category for an action
   */
  protected determineApprovalCategory(
    toolName: string,
    _context: EnhancedAgentContext
  ): ApprovalCategory {
    // Get default category from tool registry
    const toolCategory = toolRegistry.getApprovalCategory(toolName);

    // Can be overridden based on user preferences or context
    // For example, VIP contacts might always require approval
    // Or spending above certain thresholds

    return toolCategory;
  }

  /**
   * Create an approval request
   */
  protected async createApprovalRequest(
    context: EnhancedAgentContext,
    action: string,
    proposedAction: Record<string, unknown>,
    category: ApprovalCategory
  ): Promise<ApprovalRequest> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry
    const createdAt = new Date();

    // Create notification for approval
    const notification = await prisma.notification.create({
      data: {
        userId: context.userId,
        type: 'APPROVAL_REQUEST',
        title: `Approval Required: ${action}`,
        body: `The ${this.agentType} wants to ${action}. Please review and approve or reject.`,
        data: {
          agentType: this.agentType,
          action,
          toolName: action,
          toolInput: proposedAction,
          category,
          proposedAction,
          sessionId: context.sessionId,
          requestId: context.requestId,
          approvalId: '', // Will be set after creation
          approvalStatus: 'PENDING',
          expiresAt: expiresAt.toISOString(),
        } as object,
        status: 'PENDING',
      },
    });

    // Update the approvalId to point to the notification itself
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        data: {
          ...(notification.data as object),
          approvalId: notification.id,
        },
      },
    });

    // Send notification via user's preferred channel (e.g. Telegram with approve/reject buttons)
    try {
      const { notificationService } = await import('../services/NotificationService.js');
      await notificationService.send({
        userId: context.userId,
        type: 'APPROVAL_REQUEST',
        title: `Approval Required: ${action}`,
        body: `${this.agentType} wants to ${action}. Review and approve or reject.`,
        priority: 'HIGH',
        data: {
          approvalId: notification.id,
          agentType: this.agentType,
          toolName: action,
          toolInput: proposedAction,
        },
        actions: [
          { type: 'button', label: 'Approve', action: `approve:${notification.id}` },
          { type: 'button', label: 'Reject', action: `reject:${notification.id}` },
        ],
      });
    } catch (notifError) {
      logger.error('Failed to send approval notification', { error: notifError });
    }

    return {
      id: notification.id,
      userId: context.userId,
      agentType: this.agentType,
      action,
      toolName: action,
      category,
      confidence: 0.8, // Default confidence
      description: `${this.agentType} wants to execute ${action}`,
      details: {
        proposedAction,
        reasoning: `Action requires ${category} due to its nature`,
        impact: {
          type: category === 'ALWAYS_ASK' ? 'HIGH' : 'MEDIUM',
          affectedAreas: [this.domain],
        },
        isReversible: true,
        relatedEntities: [],
      },
      expiresAt,
      status: 'PENDING',
      createdAt,
    };
  }

  /**
   * Resume execution after approval
   */
  protected async resumeAfterApproval(
    context: EnhancedAgentContext,
    approvalId: string,
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<EnhancedAgentResult<unknown>> {
    // Verify approval status
    const notification = await prisma.notification.findUnique({
      where: { id: approvalId },
    });

    const notificationData = notification?.data as { approvalStatus?: string } | null;
    const approvalStatus = notificationData?.approvalStatus;

    if (!notification || approvalStatus !== 'APPROVED') {
      return {
        success: false,
        error: approvalStatus === 'REJECTED'
          ? 'Action was rejected by user'
          : 'Approval not found or expired',
        requiresApproval: false,
        toolsUsed: [],
        chainOfThought: [],
      };
    }

    // Execute the approved tool
    const result = await toolRegistry.execute(toolName, toolInput, context);

    // Record the action
    await this.recordAction(context, toolName, toolInput, result);

    return {
      success: result.success,
      data: result.data,
      error: result.error,
      requiresApproval: false,
      toolsUsed: [toolName],
      chainOfThought: ['Executed after approval'],
    };
  }

  // ============================================================================
  // Learning & Feedback
  // ============================================================================

  /**
   * Record feedback for learning
   */
  protected async recordForLearning(
    userId: string,
    actionId: string,
    feedback: {
      wasHelpful: boolean;
      correction?: unknown;
      comment?: string;
    }
  ): Promise<void> {
    // Find the action log
    const actionLog = await prisma.actionLog.findUnique({
      where: { id: actionId },
    });

    if (!actionLog) {
      logger.warn('Action log not found for learning', { actionId });
      return;
    }

    // Store the feedback
    await prisma.actionLog.update({
      where: { id: actionId },
      data: {
        feedback: feedback as unknown as Record<string, unknown>,
      },
    });

    // If there was a correction, store it as a pattern
    if (feedback.correction) {
      await prisma.userPattern.create({
        data: {
          userId,
          patternType: 'OTHER',
          patternData: {
            correctionType: 'explicit',
            domain: this.domain,
            originalAction: actionLog.action,
            originalInput: actionLog.input,
            correction: feedback.correction,
          },
          confidence: 0.9, // High confidence for explicit corrections
          occurrences: 1,
          lastObserved: new Date(),
        },
      });
    }
  }

  // ============================================================================
  // Prompt Building
  // ============================================================================

  /**
   * Build system prompt with user context (legacy)
   */
  protected buildSystemPrompt(context: AIAgentContext): string {
    let prompt = this.systemPrompt;

    // Inject current date/time and timezone
    const tz = context.timezone || 'Europe/Amsterdam';
    const now = new Date();
    const localTime = now.toLocaleString('en-US', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' });
    prompt += `\n\n## Current Date & Time
- Today: ${localTime}
- User timezone: ${tz}
IMPORTANT: Use timezone ${tz} for all date/time operations. Respond in the user's language.`;

    if (context.userPreferences) {
      prompt += `\n\n## User Preferences
- Communication tone: ${context.userPreferences.communicationTone}
- Response length preference: ${context.userPreferences.responseLength}
- Language: ${context.userPreferences.language}
- Working hours: ${context.userPreferences.workingHoursStart} - ${context.userPreferences.workingHoursEnd}`;
    }

    return prompt;
  }

  /**
   * Build enhanced system prompt with memory and patterns
   */
  protected buildEnhancedSystemPrompt(context: EnhancedAgentContext): string {
    let prompt = this.systemPrompt;

    // Add user preferences
    if (context.userPreferences) {
      prompt += `\n\n## User Preferences
- Communication tone: ${context.userPreferences.communicationTone}
- Response length preference: ${context.userPreferences.responseLength}
- Language: ${context.userPreferences.language}
- Working hours: ${context.userPreferences.workingHoursStart} - ${context.userPreferences.workingHoursEnd}`;
    }

    // Add recent actions context
    if (context.recentActions && context.recentActions.length > 0) {
      prompt += `\n\n## Recent Actions (for context)`;
      for (const action of context.recentActions.slice(0, 5)) {
        prompt += `\n- ${action.action}: ${action.status === 'SUCCESS' ? 'successful' : 'failed'}`;
      }
    }

    // Add learned patterns
    if (context.patterns && context.patterns.length > 0) {
      prompt += `\n\n## Learned User Patterns`;
      for (const pattern of context.patterns.slice(0, 5)) {
        prompt += `\n- ${pattern.type}: ${JSON.stringify(pattern.data)} (confidence: ${pattern.confidence})`;
      }
    }

    // Add current context with timezone-aware time
    const tz = context.timezone || 'Europe/Amsterdam';
    const now = new Date();
    const localTime = now.toLocaleString('en-US', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' });
    prompt += `\n\n## Current Context
- Session ID: ${context.sessionId}
- Request ID: ${context.requestId}
- Domain: ${context.domain}
- Today: ${localTime}
- User timezone: ${tz}
IMPORTANT: Use timezone ${tz} for all date/time operations. Respond in the user's language.`;

    return prompt;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Check if AI is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Get the agent's domain
   */
  getDomain(): AgentDomain {
    return this.domain;
  }

  /**
   * Get the agent type
   */
  getAgentType(): string {
    return this.agentType;
  }

  /**
   * Create an enhanced context from a basic context
   */
  protected async createEnhancedContext(
    basicContext: AIAgentContext,
    sessionId: string,
    requestId: string
  ): Promise<EnhancedAgentContext> {
    const { patterns, recentActions } = await this.loadUserContext(basicContext.userId);

    return {
      ...basicContext,
      sessionId,
      requestId,
      domain: this.domain,
      recentActions,
      patterns,
    };
  }
}

export default BaseAgent;
