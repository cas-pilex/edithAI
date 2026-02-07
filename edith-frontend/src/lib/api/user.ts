import { api } from './client';
import type { ApiResponse } from './types';
import type { User, UserPreferences } from '@/types';

export const userApi = {
  getProfile: async () => {
    const { data } = await api.get<ApiResponse<User>>('/api/user/profile');
    return data;
  },

  updateProfile: async (payload: Partial<User>) => {
    const { data } = await api.patch<ApiResponse<User>>('/api/user/profile', payload);
    return data;
  },

  getPreferences: async () => {
    const { data } = await api.get<ApiResponse<UserPreferences>>('/api/user/preferences');
    return data;
  },

  updatePreferences: async (payload: Partial<UserPreferences>) => {
    const { data } = await api.patch<ApiResponse<UserPreferences>>('/api/user/preferences', payload);
    return data;
  },
};
