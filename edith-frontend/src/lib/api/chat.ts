import { api } from './client';
import type { ApiResponse } from './types';
import type { ChatMessage } from '@/types';

export interface SendMessagePayload {
  message: string;
  domain?: string;
  sessionId?: string;
}

export const chatApi = {
  sendMessage: async (payload: SendMessagePayload) => {
    const { data } = await api.post<ApiResponse<ChatMessage>>('/api/chat', payload);
    return data;
  },

  getAgentStatus: async () => {
    const { data } = await api.get<ApiResponse<{ status: string; activeAgents: string[] }>>('/api/agents/status');
    return data;
  },

  submitFeedback: async (messageId: string, feedback: 'positive' | 'negative') => {
    const { data } = await api.post<ApiResponse<null>>('/api/agents/feedback', { messageId, feedback });
    return data;
  },
};
