import { api } from './client';
import type { ApiResponse, PaginatedResponse, PaginationParams } from './types';
import type { Task } from '@/types';

export interface TaskFilters {
  status?: string;
  priority?: string;
  tag?: string;
  search?: string;
  dueBefore?: string;
  dueAfter?: string;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  tags?: string[];
}

export interface UpdateTaskPayload extends Partial<CreateTaskPayload> {
  status?: string;
}

export const tasksApi = {
  getTasks: async (filters?: TaskFilters, pagination?: PaginationParams) => {
    const { data } = await api.get<PaginatedResponse<Task>>('/api/tasks', {
      params: { ...filters, ...pagination },
    });
    return data;
  },

  getTask: async (id: string) => {
    const { data } = await api.get<ApiResponse<Task>>(`/api/tasks/${id}`);
    return data;
  },

  createTask: async (payload: CreateTaskPayload) => {
    const { data } = await api.post<ApiResponse<Task>>('/api/tasks', payload);
    return data;
  },

  updateTask: async ({ id, ...payload }: UpdateTaskPayload & { id: string }) => {
    const { data } = await api.patch<ApiResponse<Task>>(`/api/tasks/${id}`, payload);
    return data;
  },

  deleteTask: async (id: string) => {
    const { data } = await api.delete<ApiResponse<null>>(`/api/tasks/${id}`);
    return data;
  },

  completeTask: async (id: string) => {
    const { data } = await api.post<ApiResponse<Task>>(`/api/tasks/${id}/complete`);
    return data;
  },

  reopenTask: async (id: string) => {
    const { data } = await api.post<ApiResponse<Task>>(`/api/tasks/${id}/reopen`);
    return data;
  },

  getStats: async () => {
    const { data } = await api.get<ApiResponse<Record<string, number>>>('/api/tasks/stats');
    return data;
  },

  getOverdue: async () => {
    const { data } = await api.get<ApiResponse<Task[]>>('/api/tasks/overdue');
    return data;
  },

  getToday: async () => {
    const { data } = await api.get<ApiResponse<Task[]>>('/api/tasks/today');
    return data;
  },

  getTags: async () => {
    const { data } = await api.get<ApiResponse<string[]>>('/api/tasks/tags');
    return data;
  },
};
