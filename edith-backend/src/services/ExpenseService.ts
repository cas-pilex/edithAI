/**
 * ExpenseService
 * Business logic for expense tracking and management
 */

import { prisma } from '../database/client.js';

// ExpenseCategory: TRAVEL, MEALS, ACCOMMODATION, TRANSPORT, SOFTWARE, OTHER
// ExpenseStatus: PENDING, CATEGORIZED, APPROVED, REIMBURSED

export interface ExpenseFilters {
  category?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
  tripId?: string;
}

export interface CreateExpenseInput {
  description: string;
  amount: number;
  currency?: string;
  category: 'TRAVEL' | 'MEALS' | 'ACCOMMODATION' | 'TRANSPORT' | 'SOFTWARE' | 'OTHER';
  date: Date;
  vendor?: string;
  receiptUrl?: string;
  tripId?: string;
}

class ExpenseServiceImpl {
  /**
   * Get expenses with filters
   */
  async getExpenses(
    userId: string,
    filters: ExpenseFilters = {},
    pagination: { limit?: number; offset?: number } = {}
  ): Promise<{ expenses: unknown[]; total: number }> {
    const { limit = 50, offset = 0 } = pagination;

    const where: Record<string, unknown> = { userId };

    if (filters.category) where.category = filters.category;
    if (filters.status) where.status = filters.status;
    if (filters.tripId) where.tripId = filters.tripId;
    if (filters.startDate || filters.endDate) {
      where.date = {};
      if (filters.startDate) (where.date as Record<string, Date>).gte = filters.startDate;
      if (filters.endDate) (where.date as Record<string, Date>).lte = filters.endDate;
    }
    if (filters.minAmount || filters.maxAmount) {
      where.amount = {};
      if (filters.minAmount) (where.amount as Record<string, number>).gte = filters.minAmount;
      if (filters.maxAmount) (where.amount as Record<string, number>).lte = filters.maxAmount;
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: { trip: true },
        orderBy: { date: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.expense.count({ where }),
    ]);

    return { expenses, total };
  }

  /**
   * Get expense by ID
   */
  async getExpenseById(id: string, userId: string) {
    return prisma.expense.findFirst({
      where: { id, userId },
      include: { trip: true },
    });
  }

  /**
   * Create expense
   */
  async createExpense(userId: string, data: CreateExpenseInput) {
    return prisma.expense.create({
      data: {
        userId,
        description: data.description,
        amount: data.amount,
        currency: data.currency || 'EUR',
        category: data.category,
        date: data.date,
        vendor: data.vendor,
        receiptUrl: data.receiptUrl,
        tripId: data.tripId,
        status: 'PENDING',
      },
    });
  }

  /**
   * Update expense
   */
  async updateExpense(id: string, userId: string, data: Partial<Omit<CreateExpenseInput, 'tripId'>>) {
    const updateData: Record<string, unknown> = {};
    if (data.description !== undefined) updateData.description = data.description;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.date !== undefined) updateData.date = data.date;
    if (data.vendor !== undefined) updateData.vendor = data.vendor;
    if (data.receiptUrl !== undefined) updateData.receiptUrl = data.receiptUrl;

    return prisma.expense.updateMany({
      where: { id, userId },
      data: updateData,
    });
  }

  /**
   * Delete expense
   */
  async deleteExpense(id: string, userId: string) {
    const expense = await prisma.expense.findFirst({
      where: { id, userId },
    });

    if (!expense) {
      throw new Error('Expense not found');
    }

    await prisma.expense.delete({ where: { id } });
    return true;
  }

  /**
   * Categorize expense (transition from PENDING to CATEGORIZED)
   */
  async categorizeExpense(id: string, userId: string, category: CreateExpenseInput['category']) {
    return prisma.expense.updateMany({
      where: {
        id,
        userId,
        status: 'PENDING',
      },
      data: {
        category,
        status: 'CATEGORIZED',
      },
    });
  }

  /**
   * Approve expense (transition from CATEGORIZED to APPROVED)
   */
  async approveExpense(id: string, _approvedBy: string) {
    return prisma.expense.update({
      where: { id },
      data: {
        status: 'APPROVED',
      },
    });
  }

  /**
   * Mark expense as reimbursed (transition from APPROVED to REIMBURSED)
   */
  async markReimbursed(ids: string[], userId: string) {
    return prisma.expense.updateMany({
      where: {
        id: { in: ids },
        userId,
        status: 'APPROVED',
      },
      data: {
        status: 'REIMBURSED',
      },
    });
  }

  /**
   * Get expense categories
   */
  async getCategories(userId: string) {
    const expenses = await prisma.expense.findMany({
      where: { userId },
      select: { category: true },
      distinct: ['category'],
    });

    return expenses.map(e => e.category).filter(Boolean);
  }

  /**
   * Get expense stats
   */
  async getStats(userId: string, startDate?: Date, endDate?: Date) {
    const dateFilter: Record<string, unknown> = {};
    if (startDate || endDate) {
      dateFilter.date = {};
      if (startDate) (dateFilter.date as Record<string, Date>).gte = startDate;
      if (endDate) (dateFilter.date as Record<string, Date>).lte = endDate;
    }

    const expenses = await prisma.expense.findMany({
      where: {
        userId,
        ...dateFilter,
      },
    });

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);

    const byCategory = expenses.reduce((acc, e) => {
      const cat = e.category || 'uncategorized';
      acc[cat] = (acc[cat] || 0) + e.amount;
      return acc;
    }, {} as Record<string, number>);

    const byStatus = expenses.reduce((acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + e.amount;
      return acc;
    }, {} as Record<string, number>);

    const pendingApproval = expenses
      .filter(e => e.status === 'CATEGORIZED')
      .reduce((sum, e) => sum + e.amount, 0);

    const approvedNotReimbursed = expenses
      .filter(e => e.status === 'APPROVED')
      .reduce((sum, e) => sum + e.amount, 0);

    return {
      totalExpenses: expenses.length,
      totalAmount: total,
      averageAmount: expenses.length > 0 ? total / expenses.length : 0,
      pendingApproval,
      approvedNotReimbursed,
      byCategory,
      byStatus,
    };
  }

  /**
   * Generate expense report
   */
  async generateReport(
    userId: string,
    startDate: Date,
    endDate: Date,
    options?: {
      groupBy?: 'category' | 'month' | 'trip';
      includeDetails?: boolean;
    }
  ) {
    const { groupBy = 'category', includeDetails = true } = options || {};

    const expenses = await prisma.expense.findMany({
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
      },
      include: includeDetails ? { trip: true } : undefined,
      orderBy: { date: 'asc' },
    });

    let groupedData: Record<string, { total: number; count: number; expenses?: unknown[] }> = {};

    switch (groupBy) {
      case 'category':
        groupedData = expenses.reduce((acc, e) => {
          const key = e.category || 'uncategorized';
          if (!acc[key]) acc[key] = { total: 0, count: 0, expenses: [] };
          acc[key].total += e.amount;
          acc[key].count += 1;
          if (includeDetails) acc[key].expenses!.push(e);
          return acc;
        }, {} as Record<string, { total: number; count: number; expenses?: unknown[] }>);
        break;

      case 'month':
        groupedData = expenses.reduce((acc, e) => {
          const key = e.date.toISOString().slice(0, 7); // YYYY-MM
          if (!acc[key]) acc[key] = { total: 0, count: 0, expenses: [] };
          acc[key].total += e.amount;
          acc[key].count += 1;
          if (includeDetails) acc[key].expenses!.push(e);
          return acc;
        }, {} as Record<string, { total: number; count: number; expenses?: unknown[] }>);
        break;

      case 'trip':
        groupedData = expenses.reduce((acc, e) => {
          const key = e.tripId || 'no-trip';
          if (!acc[key]) acc[key] = { total: 0, count: 0, expenses: [] };
          acc[key].total += e.amount;
          acc[key].count += 1;
          if (includeDetails) acc[key].expenses!.push(e);
          return acc;
        }, {} as Record<string, { total: number; count: number; expenses?: unknown[] }>);
        break;
    }

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);

    return {
      period: { startDate, endDate },
      totalAmount: total,
      totalExpenses: expenses.length,
      groupedBy: groupBy,
      data: groupedData,
    };
  }
}

export const expenseService = new ExpenseServiceImpl();
export default expenseService;
