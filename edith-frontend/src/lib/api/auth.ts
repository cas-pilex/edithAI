import { api } from './client';
import type { ApiResponse } from './types';
import type { User } from '@/types';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export const authApi = {
  login: async (payload: LoginPayload) => {
    const { data } = await api.post<ApiResponse<AuthResponse>>('/api/auth/login', payload);
    return data;
  },

  register: async (payload: RegisterPayload) => {
    const { data } = await api.post<ApiResponse<AuthResponse>>('/api/auth/register', payload);
    return data;
  },

  logout: async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    const { data } = await api.post<ApiResponse<null>>('/api/auth/logout', { refreshToken });
    return data;
  },

  refresh: async (refreshToken: string) => {
    const { data } = await api.post<ApiResponse<AuthTokens>>('/api/auth/refresh', { refreshToken });
    return data;
  },

  forgotPassword: async (email: string) => {
    const { data } = await api.post<ApiResponse<null>>('/api/auth/forgot-password', { email });
    return data;
  },

  resetPassword: async (token: string, password: string) => {
    const { data } = await api.post<ApiResponse<null>>('/api/auth/reset-password', { token, password });
    return data;
  },

  getCurrentUser: async () => {
    const { data } = await api.get<ApiResponse<User>>('/api/auth/me');
    return data;
  },
};
