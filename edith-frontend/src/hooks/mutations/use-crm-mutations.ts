import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { crmApi } from '@/lib/api/crm';
import type { CreateContactPayload, UpdateContactPayload, CreateInteractionPayload } from '@/lib/api/crm';

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateContactPayload) => crmApi.createContact(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact created');
    },
    onError: () => toast.error('Failed to create contact'),
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateContactPayload & { id: string }) => crmApi.updateContact(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact updated');
    },
    onError: () => toast.error('Failed to update contact'),
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => crmApi.deleteContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact deleted');
    },
    onError: () => toast.error('Failed to delete contact'),
  });
}

export function useAddInteraction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, payload }: { contactId: string; payload: CreateInteractionPayload }) =>
      crmApi.addInteraction(contactId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contacts', variables.contactId, 'interactions'] });
      toast.success('Interaction added');
    },
    onError: () => toast.error('Failed to add interaction'),
  });
}
