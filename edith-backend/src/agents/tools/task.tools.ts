import { toolRegistry, createTool } from './index.js';
import type { EnhancedAgentContext, ToolHandlerResult } from '../../types/agent.types.js';
import { prisma } from '../../database/client.js';
import { logger } from '../../utils/logger.js';

// ==================== TOOL HANDLERS ====================

async function handleCreateTask(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { title, description, priority = 'MEDIUM', dueDate, estimatedMinutes, source = 'AI', sourceId, tags } =
    input as {
      title: string;
      description?: string;
      priority?: string;
      dueDate?: string;
      estimatedMinutes?: number;
      source?: string;
      sourceId?: string;
      tags?: string[];
    };

  try {
    const task = await prisma.task.create({
      data: {
        userId: context.userId,
        title,
        description,
        priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
        status: 'TODO',
        dueDate: dueDate ? new Date(dueDate) : undefined,
        estimatedMinutes,
        source: source as 'MANUAL' | 'EMAIL' | 'MEETING' | 'AI',
        sourceId,
        tags: tags || [],
      },
    });

    return {
      success: true,
      data: {
        taskId: task.id,
        title: task.title,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate,
      },
    };
  } catch (error) {
    logger.error('Failed to create task', { error });
    return {
      success: false,
      error: `Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleUpdateTask(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { taskId, updates } = input as {
    taskId: string;
    updates: {
      title?: string;
      description?: string;
      priority?: string;
      status?: string;
      dueDate?: string;
      estimatedMinutes?: number;
      tags?: string[];
    };
  };

  try {
    const updateData: Parameters<typeof prisma.task.update>[0]['data'] = {
      title: updates.title,
      description: updates.description,
      estimatedMinutes: updates.estimatedMinutes,
      tags: updates.tags,
      dueDate: updates.dueDate ? new Date(updates.dueDate) : undefined,
    };

    // Cast enums properly
    if (updates.priority) {
      updateData.priority = updates.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    }
    if (updates.status) {
      updateData.status = updates.status as 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
    }

    const task = await prisma.task.update({
      where: { id: taskId, userId: context.userId },
      data: updateData,
    });

    return {
      success: true,
      data: {
        taskId: task.id,
        updated: Object.keys(updates),
        currentState: {
          title: task.title,
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate,
        },
      },
    };
  } catch (error) {
    logger.error('Failed to update task', { error, taskId });
    return {
      success: false,
      error: `Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleCompleteTask(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { taskId, actualMinutes } = input as { taskId: string; actualMinutes?: number };

  try {
    const task = await prisma.task.update({
      where: { id: taskId, userId: context.userId },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        actualMinutes,
      },
    });

    return {
      success: true,
      data: {
        taskId: task.id,
        title: task.title,
        completedAt: task.completedAt,
        actualMinutes: task.actualMinutes,
        estimatedMinutes: task.estimatedMinutes,
      },
    };
  } catch (error) {
    logger.error('Failed to complete task', { error, taskId });
    return {
      success: false,
      error: `Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleDeleteTask(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { taskId } = input as { taskId: string };

  const task = await prisma.task.findUnique({
    where: { id: taskId, userId: context.userId },
  });

  if (!task) {
    return { success: false, error: 'Task not found' };
  }

  return {
    success: true,
    requiresApproval: true,
    approvalDetails: {
      proposedAction: { taskId },
      reasoning: 'Deleting a task requires confirmation',
      impact: {
        type: 'MEDIUM',
        affectedAreas: ['tasks'],
      },
      isReversible: false,
      relatedEntities: [{ type: 'task', id: taskId, displayName: task.title }],
    },
    data: { message: 'Task deletion requires approval', taskId, title: task.title },
  };
}

async function handleGetTasks(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { status, priority, dueBefore, dueAfter, tags, limit = 20 } = input as {
    status?: string;
    priority?: string;
    dueBefore?: string;
    dueAfter?: string;
    tags?: string[];
    limit?: number;
  };

  try {
    const where: Record<string, unknown> = { userId: context.userId };

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (dueBefore || dueAfter) {
      where.dueDate = {};
      if (dueBefore) (where.dueDate as Record<string, Date>).lte = new Date(dueBefore);
      if (dueAfter) (where.dueDate as Record<string, Date>).gte = new Date(dueAfter);
    }
    if (tags?.length) {
      where.tags = { hasSome: tags };
    }

    const tasks = await prisma.task.findMany({
      where: where as { userId: string; [key: string]: unknown },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      take: Math.min(limit, 100),
    });

    return {
      success: true,
      data: {
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          status: t.status,
          dueDate: t.dueDate,
          estimatedMinutes: t.estimatedMinutes,
          tags: t.tags,
          source: t.source,
        })),
        count: tasks.length,
      },
    };
  } catch (error) {
    logger.error('Failed to get tasks', { error });
    return {
      success: false,
      error: `Failed to get tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handlePrioritizeTasks(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { taskIds } = input as { taskIds?: string[] };

  try {
    // Get tasks to prioritize
    const where: Record<string, unknown> = {
      userId: context.userId,
      status: { not: 'DONE' },
    };
    if (taskIds?.length) {
      where.id = { in: taskIds };
    }

    const tasks = await prisma.task.findMany({
      where: where as { userId: string; [key: string]: unknown },
    });

    // Calculate priority scores
    const now = new Date();
    const scored = tasks.map((task) => {
      let score = 0;

      // Base priority score
      switch (task.priority) {
        case 'URGENT':
          score += 100;
          break;
        case 'HIGH':
          score += 75;
          break;
        case 'MEDIUM':
          score += 50;
          break;
        case 'LOW':
          score += 25;
          break;
      }

      // Due date factor
      if (task.dueDate) {
        const daysUntilDue = (task.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (daysUntilDue < 0) score += 50; // Overdue
        else if (daysUntilDue < 1) score += 40; // Due today
        else if (daysUntilDue < 3) score += 30; // Due soon
        else if (daysUntilDue < 7) score += 20; // Due this week
      }

      // Status factor
      if (task.status === 'IN_PROGRESS') score += 10;
      if (task.status === 'BLOCKED') score -= 20;

      return { task, score };
    });

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    return {
      success: true,
      data: {
        prioritizedTasks: scored.map((s, index) => ({
          rank: index + 1,
          id: s.task.id,
          title: s.task.title,
          priority: s.task.priority,
          dueDate: s.task.dueDate,
          status: s.task.status,
          score: s.score,
        })),
        totalTasks: scored.length,
      },
    };
  } catch (error) {
    logger.error('Failed to prioritize tasks', { error });
    return {
      success: false,
      error: `Failed to prioritize: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleSuggestTimeBlocks(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { taskIds, dateRange } = input as {
    taskIds: string[];
    dateRange?: { start: string; end: string };
  };

  try {
    // Get tasks
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: taskIds },
        userId: context.userId,
        status: { not: 'DONE' },
      },
    });

    // Get calendar events for the date range
    const rangeStart = dateRange ? new Date(dateRange.start) : new Date();
    const rangeEnd = dateRange
      ? new Date(dateRange.end)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const events = await prisma.calendarEvent.findMany({
      where: {
        userId: context.userId,
        startTime: { gte: rangeStart },
        endTime: { lte: rangeEnd },
        status: { not: 'CANCELLED' },
      },
      orderBy: { startTime: 'asc' },
    });

    // Find available slots (simplified)
    const suggestions: Array<{
      taskId: string;
      taskTitle: string;
      suggestedSlot: { start: Date; end: Date };
      reason: string;
    }> = [];

    for (const task of tasks) {
      const duration = task.estimatedMinutes || 60;
      let slotFound = false;

      // Try to find a slot
      const current = new Date(rangeStart);
      current.setHours(9, 0, 0, 0);

      while (current < rangeEnd && !slotFound) {
        const slotEnd = new Date(current.getTime() + duration * 60 * 1000);

        // Check for conflicts
        const hasConflict = events.some(
          (e) => current < e.endTime && slotEnd > e.startTime
        );

        if (!hasConflict && current.getHours() >= 9 && current.getHours() < 18) {
          suggestions.push({
            taskId: task.id,
            taskTitle: task.title,
            suggestedSlot: { start: new Date(current), end: slotEnd },
            reason: task.dueDate && task.dueDate < slotEnd ? 'Task is due soon' : 'Available slot found',
          });
          slotFound = true;
        }

        current.setHours(current.getHours() + 1);
        if (current.getHours() >= 18) {
          current.setDate(current.getDate() + 1);
          current.setHours(9, 0, 0, 0);
        }
      }
    }

    return {
      success: true,
      data: {
        suggestions,
        tasksWithoutSlots: tasks.filter((t) => !suggestions.some((s) => s.taskId === t.id)).map((t) => t.id),
      },
    };
  } catch (error) {
    logger.error('Failed to suggest time blocks', { error });
    return {
      success: false,
      error: `Failed to suggest: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function handleExtractTasksFromText(
  input: Record<string, unknown>,
  _context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { text, source, sourceId } = input as {
    text: string;
    source?: string;
    sourceId?: string;
  };

  // This handler just returns the text for the agent to analyze
  // The actual extraction will be done by the AI
  return {
    success: true,
    data: {
      text: text.substring(0, 5000), // Limit text length
      source: source || 'UNKNOWN',
      sourceId,
      instruction:
        'Analyze this text and extract any tasks, action items, or to-dos. For each task, identify the title, any deadline mentioned, and suggested priority.',
    },
  };
}

async function handleGetOverdueTasks(
  input: Record<string, unknown>,
  context: EnhancedAgentContext
): Promise<ToolHandlerResult> {
  const { limit = 20 } = input as { limit?: number };

  try {
    const tasks = await prisma.task.findMany({
      where: {
        userId: context.userId,
        status: { not: 'DONE' },
        dueDate: { lt: new Date() },
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      take: limit,
    });

    const now = new Date();

    return {
      success: true,
      data: {
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          status: t.status,
          dueDate: t.dueDate,
          daysOverdue: t.dueDate
            ? Math.floor((now.getTime() - t.dueDate.getTime()) / (1000 * 60 * 60 * 24))
            : 0,
        })),
        count: tasks.length,
      },
    };
  } catch (error) {
    logger.error('Failed to get overdue tasks', { error });
    return {
      success: false,
      error: `Failed to get overdue tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ==================== TOOL REGISTRATION ====================

export function registerTaskTools(): void {
  toolRegistry.register(
    createTool(
      'create_task',
      'Create a new task',
      {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], description: 'Task priority' },
        dueDate: { type: 'string', description: 'Due date (ISO format)' },
        estimatedMinutes: { type: 'number', description: 'Estimated time to complete' },
        source: { type: 'string', enum: ['MANUAL', 'EMAIL', 'MEETING', 'AI'], description: 'Task source' },
        sourceId: { type: 'string', description: 'Source entity ID (email ID, event ID, etc.)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Task tags' },
      },
      ['title'],
      'tasks',
      handleCreateTask,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'update_task',
      'Update a task',
      {
        taskId: { type: 'string', description: 'Task ID' },
        updates: {
          type: 'object',
          description: 'Fields to update',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
            status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] },
            dueDate: { type: 'string' },
            estimatedMinutes: { type: 'number' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      ['taskId', 'updates'],
      'tasks',
      handleUpdateTask,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'complete_task',
      'Mark a task as complete',
      {
        taskId: { type: 'string', description: 'Task ID' },
        actualMinutes: { type: 'number', description: 'Actual time spent (minutes)' },
      },
      ['taskId'],
      'tasks',
      handleCompleteTask,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'delete_task',
      'Delete a task (requires approval)',
      {
        taskId: { type: 'string', description: 'Task ID to delete' },
      },
      ['taskId'],
      'tasks',
      handleDeleteTask,
      { requiresApproval: true, approvalCategory: 'REQUEST_APPROVAL' }
    )
  );

  toolRegistry.register(
    createTool(
      'get_tasks',
      'Get tasks with optional filters',
      {
        status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
        dueBefore: { type: 'string', description: 'Due before date (ISO format)' },
        dueAfter: { type: 'string', description: 'Due after date (ISO format)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      [],
      'tasks',
      handleGetTasks,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'prioritize_tasks',
      'Re-prioritize tasks based on deadlines and importance',
      {
        taskIds: { type: 'array', items: { type: 'string' }, description: 'Specific tasks to prioritize (optional)' },
      },
      [],
      'tasks',
      handlePrioritizeTasks,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'suggest_time_blocks',
      'Suggest calendar time blocks for completing tasks',
      {
        taskIds: { type: 'array', items: { type: 'string' }, description: 'Tasks to schedule' },
        dateRange: {
          type: 'object',
          properties: {
            start: { type: 'string', description: 'Start date (ISO format)' },
            end: { type: 'string', description: 'End date (ISO format)' },
          },
        },
      },
      ['taskIds'],
      'tasks',
      handleSuggestTimeBlocks,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'extract_tasks_from_text',
      'Extract tasks and action items from text (email, notes, etc.)',
      {
        text: { type: 'string', description: 'Text to analyze' },
        source: { type: 'string', description: 'Source type (email, meeting, etc.)' },
        sourceId: { type: 'string', description: 'Source entity ID' },
      },
      ['text'],
      'tasks',
      handleExtractTasksFromText,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  toolRegistry.register(
    createTool(
      'get_overdue_tasks',
      'Get all overdue tasks',
      {
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      [],
      'tasks',
      handleGetOverdueTasks,
      { approvalCategory: 'AUTO_APPROVE' }
    )
  );

  logger.info('Task tools registered', { count: 9 });
}
