/**
 * TaskService
 * Business logic for task management
 */

import { prisma } from '../database/client.js';

// TaskStatus: TODO, IN_PROGRESS, BLOCKED, DONE
// TaskPriority: LOW, MEDIUM, HIGH, URGENT

export interface TaskFilters {
  status?: string;
  priority?: string;
  tags?: string[];
  dueBefore?: Date;
  dueAfter?: Date;
  source?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: Date;
  estimatedMinutes?: number;
  tags?: string[];
  source?: 'MANUAL' | 'EMAIL' | 'MEETING' | 'AI';
  sourceId?: string;
}

class TaskServiceImpl {
  /**
   * Get tasks with filters
   */
  async getTasks(
    userId: string,
    filters: TaskFilters = {},
    pagination: { limit?: number; offset?: number } = {}
  ): Promise<{ tasks: unknown[]; total: number }> {
    const { limit = 50, offset = 0 } = pagination;

    const where: Record<string, unknown> = { userId };

    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.tags && filters.tags.length > 0) where.tags = { hasSome: filters.tags };
    if (filters.source) where.source = filters.source;
    if (filters.dueBefore || filters.dueAfter) {
      where.dueDate = {};
      if (filters.dueBefore) (where.dueDate as Record<string, Date>).lte = filters.dueBefore;
      if (filters.dueAfter) (where.dueDate as Record<string, Date>).gte = filters.dueAfter;
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: [
          { priority: 'desc' },
          { dueDate: 'asc' },
        ],
        take: limit,
        skip: offset,
      }),
      prisma.task.count({ where }),
    ]);

    return { tasks, total };
  }

  /**
   * Get task by ID
   */
  async getTaskById(id: string, userId: string) {
    return prisma.task.findFirst({
      where: { id, userId },
    });
  }

  /**
   * Create task
   */
  async createTask(userId: string, data: CreateTaskInput) {
    return prisma.task.create({
      data: {
        userId,
        title: data.title,
        description: data.description,
        status: data.status || 'TODO',
        priority: data.priority || 'MEDIUM',
        dueDate: data.dueDate,
        estimatedMinutes: data.estimatedMinutes,
        tags: data.tags || [],
        source: data.source || 'MANUAL',
        sourceId: data.sourceId,
      },
    });
  }

  /**
   * Update task
   */
  async updateTask(id: string, userId: string, data: Partial<CreateTaskInput>) {
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
    if (data.estimatedMinutes !== undefined) updateData.estimatedMinutes = data.estimatedMinutes;
    if (data.tags !== undefined) updateData.tags = data.tags;

    return prisma.task.updateMany({
      where: { id, userId },
      data: updateData,
    });
  }

  /**
   * Complete task
   */
  async completeTask(id: string, userId: string) {
    const task = await prisma.task.findFirst({
      where: { id, userId },
    });

    if (!task) {
      throw new Error('Task not found');
    }

    return prisma.task.update({
      where: { id },
      data: {
        status: 'DONE',
        completedAt: new Date(),
      },
    });
  }

  /**
   * Delete task
   */
  async deleteTask(id: string, userId: string) {
    const task = await prisma.task.findFirst({
      where: { id, userId },
    });

    if (!task) {
      throw new Error('Task not found');
    }

    await prisma.task.delete({ where: { id } });
    return true;
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(userId: string) {
    return prisma.task.findMany({
      where: {
        userId,
        status: { notIn: ['DONE'] },
        dueDate: { lt: new Date() },
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
      ],
    });
  }

  /**
   * Get tasks due today
   */
  async getTasksDueToday(userId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    return prisma.task.findMany({
      where: {
        userId,
        status: { notIn: ['DONE'] },
        dueDate: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
      ],
    });
  }

  /**
   * Get tasks by tag
   */
  async getTasksByTag(userId: string, tag: string) {
    return prisma.task.findMany({
      where: {
        userId,
        tags: { has: tag },
        status: { notIn: ['DONE'] },
      },
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
        { dueDate: 'asc' },
      ],
    });
  }

  /**
   * Get task stats
   */
  async getStats(userId: string, startDate?: Date, endDate?: Date) {
    const dateFilter = startDate && endDate ? {
      createdAt: { gte: startDate, lte: endDate },
    } : {};

    const [total, completed, overdue, byPriority, byStatus] = await Promise.all([
      prisma.task.count({
        where: { userId, ...dateFilter },
      }),
      prisma.task.count({
        where: { userId, status: 'DONE', ...dateFilter },
      }),
      prisma.task.count({
        where: {
          userId,
          status: { notIn: ['DONE'] },
          dueDate: { lt: new Date() },
          ...dateFilter,
        },
      }),
      prisma.task.groupBy({
        by: ['priority'],
        where: { userId, status: { notIn: ['DONE'] }, ...dateFilter },
        _count: true,
      }),
      prisma.task.groupBy({
        by: ['status'],
        where: { userId, ...dateFilter },
        _count: true,
      }),
    ]);

    return {
      total,
      completed,
      pending: total - completed,
      overdue,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      byPriority: byPriority.reduce((acc, item) => {
        acc[item.priority] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  /**
   * Bulk update task priority
   */
  async bulkUpdatePriority(
    taskIds: string[],
    userId: string,
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  ) {
    return prisma.task.updateMany({
      where: {
        id: { in: taskIds },
        userId,
      },
      data: { priority },
    });
  }

  /**
   * Get all tags used
   */
  async getTags(userId: string) {
    const tasks = await prisma.task.findMany({
      where: { userId },
      select: { tags: true },
    });

    const allTags = tasks.flatMap(t => t.tags);
    return [...new Set(allTags)];
  }
}

export const taskService = new TaskServiceImpl();
export default taskService;
