import { create } from 'zustand';
import type { ChatMessage } from '@/types';

interface ChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  sessionId: string | null;
  isStreaming: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
  addMessage: (message: ChatMessage) => void;
  setStreaming: (streaming: boolean) => void;
  setSessionId: (id: string) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  isOpen: false,
  messages: [],
  sessionId: null,
  isStreaming: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setStreaming: (isStreaming) => set({ isStreaming }),
  setSessionId: (sessionId) => set({ sessionId }),
  clearMessages: () => set({ messages: [], sessionId: null }),
}));
