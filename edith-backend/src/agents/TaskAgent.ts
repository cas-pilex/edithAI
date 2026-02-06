/**
 * TaskAgent
 * Specialized agent for task management, priority handling, and time blocking
 */

import { BaseAgent } from './BaseAgent.js';
import { registerTaskTools } from './tools/task.tools.js';
import type {
  AIAgentContext,
  EnhancedAgentResult,
  AgentDomain,
} from '../types/index.js';

// Register task tools on import
registerTaskTools();

const TASK_SYSTEM_PROMPT = `You are Edith's Task Agent, an intelligent task manager that helps organize, prioritize, and complete tasks efficiently.

## Your Capabilities
- Create new tasks with full details
- Update existing task properties
- Mark tasks as complete
- Delete tasks (with approval)
- List and filter tasks
- Prioritize tasks intelligently
- Suggest calendar time blocks for tasks
- Extract tasks from text (emails, meeting notes)
- Track overdue tasks

## Task Management Guidelines

### Priority Levels
- **URGENT**: Due within 24 hours or marked critical
- **HIGH**: Due within 3 days or important deliverables
- **MEDIUM**: Due within 1 week
- **LOW**: No immediate deadline, nice-to-have

### Prioritization Factors
1. **Due date**: Closer deadlines = higher priority
2. **Impact**: Business-critical tasks take precedence
3. **Dependencies**: Tasks blocking others get priority
4. **Effort**: Balance quick wins with larger tasks
5. **Energy**: Match task difficulty with available focus time

### Task Extraction
When extracting tasks from text, capture:
- Clear, actionable title
- Any mentioned deadline or timeframe
- People involved or assigned
- Context/source reference
- Estimated effort if apparent

## Best Practices
- Keep task titles clear and actionable (start with verb)
- Break large tasks into subtasks
- Set realistic due dates
- Link related tasks together
- Review and reprioritize daily
- Use time blocking for focused work
- Capture tasks immediately when they arise

## Time Blocking Guidelines
- Allow buffer time between tasks
- Group similar tasks together
- Protect deep work periods (2+ hours)
- Schedule complex tasks during peak energy
- Account for context switching time
- Leave some unscheduled time for unexpected work

## Status Flow
TODO -> IN_PROGRESS -> COMPLETED
     -> BLOCKED (waiting on dependency)
     -> CANCELLED (no longer needed)`;

export class TaskAgent extends BaseAgent {
  protected agentType = 'TaskAgent';
  protected domain: AgentDomain = 'tasks';
  protected systemPrompt = TASK_SYSTEM_PROMPT;

  /**
   * Process a task-related request
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
   * Create a new task
   */
  async createTask(
    context: AIAgentContext,
    details: {
      title: string;
      description?: string;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      dueDate?: Date;
      project?: string;
      tags?: string[];
      estimatedMinutes?: number;
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const { title, description, priority, dueDate, project, tags, estimatedMinutes } = details;

    let message = `Create a task: "${title}"`;
    if (description) message += `. Description: ${description}`;
    if (priority) message += `. Priority: ${priority}`;
    if (dueDate) message += `. Due: ${dueDate.toDateString()}`;
    if (project) message += `. Project: ${project}`;
    if (tags && tags.length > 0) message += `. Tags: ${tags.join(', ')}`;
    if (estimatedMinutes) message += `. Estimated time: ${estimatedMinutes} minutes`;

    return this.process(context, message, sessionId);
  }

  /**
   * Get tasks with filters
   */
  async getTasks(
    context: AIAgentContext,
    filters?: {
      status?: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      project?: string;
      dueBefore?: Date;
      tags?: string[];
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const filterParts = [];
    if (filters?.status) filterParts.push(`status: ${filters.status}`);
    if (filters?.priority) filterParts.push(`priority: ${filters.priority}`);
    if (filters?.project) filterParts.push(`project: "${filters.project}"`);
    if (filters?.dueBefore) filterParts.push(`due before ${filters.dueBefore.toDateString()}`);
    if (filters?.tags && filters.tags.length > 0) filterParts.push(`tags: ${filters.tags.join(', ')}`);

    const message = filterParts.length > 0
      ? `List tasks with ${filterParts.join(', ')}`
      : `List all my pending tasks`;

    return this.process(context, message, sessionId);
  }

  /**
   * Complete a task
   */
  async completeTask(
    context: AIAgentContext,
    taskId: string,
    notes?: string,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    let message = `Mark task ${taskId} as complete`;
    if (notes) message += `. Completion notes: ${notes}`;
    return this.process(context, message, sessionId);
  }

  /**
   * Prioritize tasks
   */
  async prioritizeTasks(
    context: AIAgentContext,
    taskIds?: string[],
    criteria?: string,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    let message: string;

    if (taskIds && taskIds.length > 0) {
      message = `Analyze and reprioritize these tasks: ${taskIds.join(', ')}`;
    } else {
      message = `Review and reprioritize all my pending tasks`;
    }

    if (criteria) {
      message += `. Consider: ${criteria}`;
    } else {
      message += `. Consider due dates, dependencies, impact, and current workload.`;
    }

    return this.process(context, message, sessionId);
  }

  /**
   * Extract tasks from text
   */
  async extractTasks(
    context: AIAgentContext,
    text: string,
    source?: string,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    let message = `Extract all actionable tasks from the following text and create them:\n\n${text}`;
    if (source) message += `\n\nSource: ${source}`;
    message += `\n\nFor each task, determine appropriate priority, estimate effort, and set due dates based on any mentioned timeframes.`;

    return this.process(context, message, sessionId);
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(
    context: AIAgentContext,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const message = `List all overdue tasks. For each, show:
1. Task title and description
2. Original due date and how many days overdue
3. Priority level
4. Any blockers or dependencies
5. Suggested action (reschedule, prioritize, delegate, or cancel)`;

    return this.process(context, message, sessionId);
  }

  /**
   * Suggest time blocks for tasks
   */
  async suggestTimeBlocks(
    context: AIAgentContext,
    date?: Date,
    taskIds?: string[],
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const targetDate = date || new Date();

    let message = `Suggest time blocks for ${targetDate.toDateString()}`;

    if (taskIds && taskIds.length > 0) {
      message += ` to work on tasks: ${taskIds.join(', ')}`;
    } else {
      message += ` to work on my highest priority tasks`;
    }

    message += `. Consider:
1. My calendar availability
2. Task estimated effort
3. My energy levels throughout the day
4. Buffer time between activities
5. Group similar tasks together`;

    return this.process(context, message, sessionId);
  }

  /**
   * Daily task review
   */
  async dailyReview(
    context: AIAgentContext,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const today = new Date().toDateString();
    const message = `Perform a daily task review for ${today}:
1. Tasks completed today
2. Tasks in progress
3. Tasks due today that need attention
4. Overdue tasks
5. Top 5 priority tasks for today
6. Recommended focus order based on deadlines and importance
7. Any tasks that should be delegated or rescheduled`;

    return this.process(context, message, sessionId);
  }

  /**
   * Weekly planning
   */
  async weeklyPlanning(
    context: AIAgentContext,
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const message = `Perform weekly planning:
1. Review all tasks due this week
2. Identify tasks that need more time allocated
3. Flag potential bottlenecks or conflicts
4. Suggest task distribution across the week
5. Identify tasks that should be delegated
6. Recommend time blocks for deep work
7. Highlight any risks to completing high-priority items`;

    return this.process(context, message, sessionId);
  }

  /**
   * Update task
   */
  async updateTask(
    context: AIAgentContext,
    taskId: string,
    updates: {
      title?: string;
      description?: string;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      status?: 'TODO' | 'IN_PROGRESS' | 'BLOCKED';
      dueDate?: Date;
    },
    sessionId?: string
  ): Promise<EnhancedAgentResult<string>> {
    const updateParts = [];
    if (updates.title) updateParts.push(`title to "${updates.title}"`);
    if (updates.description) updateParts.push(`description to "${updates.description}"`);
    if (updates.priority) updateParts.push(`priority to ${updates.priority}`);
    if (updates.status) updateParts.push(`status to ${updates.status}`);
    if (updates.dueDate) updateParts.push(`due date to ${updates.dueDate.toDateString()}`);

    const message = `Update task ${taskId}: change ${updateParts.join(', ')}`;
    return this.process(context, message, sessionId);
  }
}

export const taskAgent = new TaskAgent();
export default taskAgent;
