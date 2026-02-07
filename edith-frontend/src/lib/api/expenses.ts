import { api } from './client';
import type { ApiResponse, PaginatedResponse, PaginationParams } from './types';
import type { Expense } from '@/types';

export interface ExpenseFilters {
  category?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

export interface CreateExpensePayload {
  amount: number;
  currency?: string;
  category: string;
  description: string;
  vendor?: string;
  date: string;
  tripId?: string;
}

export interface UpdateExpensePayload extends Partial<CreateExpensePayload> {}

export const expensesApi = {
  getExpenses: async (filters?: ExpenseFilters, pagination?: PaginationParams) => {
    const { data } = await api.get<PaginatedResponse<Expense>>('/api/expenses', {
      params: { ...filters, ...pagination },
    });
    return data;
  },

  getExpense: async (id: string) => {
    const { data } = await api.get<ApiResponse<Expense>>(`/api/expenses/${id}`);
    return data;
  },

  createExpense: async (payload: CreateExpensePayload) => {
    const { data } = await api.post<ApiResponse<Expense>>('/api/expenses', payload);
    return data;
  },

  updateExpense: async ({ id, ...payload }: UpdateExpensePayload & { id: string }) => {
    const { data } = await api.patch<ApiResponse<Expense>>(`/api/expenses/${id}`, payload);
    return data;
  },

  deleteExpense: async (id: string) => {
    const { data } = await api.delete<ApiResponse<null>>(`/api/expenses/${id}`);
    return data;
  },

  getSummary: async (startDate?: string, endDate?: string) => {
    const { data } = await api.get<ApiResponse<{ total: number; byCategory: Record<string, number>; pending: number; approved: number }>>('/api/expenses/summary', {
      params: { startDate, endDate },
    });
    return data;
  },

  approve: async (id: string) => {
    const { data } = await api.post<ApiResponse<Expense>>(`/api/expenses/${id}/approve`);
    return data;
  },

  reimburse: async (id: string) => {
    const { data } = await api.post<ApiResponse<Expense>>('/api/expenses/reimburse', { expenseIds: [id] });
    return data;
  },

  exportExpenses: async (format: string, filters?: ExpenseFilters) => {
    const { data } = await api.post<Blob>('/api/expenses/export', {
      format,
      ...filters,
    }, {
      responseType: 'blob',
    });
    return data;
  },
};
