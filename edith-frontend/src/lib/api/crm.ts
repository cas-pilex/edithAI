import { api } from './client';
import type { ApiResponse, PaginatedResponse, PaginationParams } from './types';
import type { Contact, Interaction } from '@/types';

export interface ContactFilters {
  search?: string;
  relationshipType?: string;
  company?: string;
  minImportance?: number;
  interests?: string;
}

export interface CreateContactPayload {
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
  linkedinUrl?: string;
  relationshipType?: string;
  importanceScore?: number;
  notes?: string;
}

export interface UpdateContactPayload extends Partial<CreateContactPayload> {}

export interface CreateInteractionPayload {
  type: string;
  summary?: string;
  date?: string;
  sentiment?: string;
}

export const crmApi = {
  getContacts: async (filters?: ContactFilters, pagination?: PaginationParams) => {
    const { data } = await api.get<PaginatedResponse<Contact>>('/api/crm/contacts', {
      params: { ...filters, ...pagination },
    });
    return data;
  },

  getContact: async (id: string) => {
    const { data } = await api.get<ApiResponse<Contact>>(`/api/crm/contacts/${id}`);
    return data;
  },

  createContact: async (payload: CreateContactPayload) => {
    const { data } = await api.post<ApiResponse<Contact>>('/api/crm/contacts', payload);
    return data;
  },

  updateContact: async ({ id, ...payload }: UpdateContactPayload & { id: string }) => {
    const { data } = await api.patch<ApiResponse<Contact>>(`/api/crm/contacts/${id}`, payload);
    return data;
  },

  deleteContact: async (id: string) => {
    const { data } = await api.delete<ApiResponse<null>>(`/api/crm/contacts/${id}`);
    return data;
  },

  getInteractions: async (contactId: string) => {
    const { data } = await api.get<ApiResponse<Interaction[]>>(`/api/crm/contacts/${contactId}/interactions`);
    return data;
  },

  addInteraction: async (contactId: string, payload: CreateInteractionPayload) => {
    const { data } = await api.post<ApiResponse<Interaction>>(`/api/crm/contacts/${contactId}/interactions`, payload);
    return data;
  },

  getFollowUps: async () => {
    const { data } = await api.get<ApiResponse<Contact[]>>('/api/crm/follow-ups');
    return data;
  },

  getNeedingAttention: async () => {
    const { data } = await api.get<ApiResponse<Contact[]>>('/api/crm/attention');
    return data;
  },

  getInsights: async (contactId?: string) => {
    const { data } = await api.get<ApiResponse<{ insights: string[] }>>('/api/crm/insights', {
      params: contactId ? { contactId } : undefined,
    });
    return data;
  },
};
