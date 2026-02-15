import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { inboxApi } from '@/lib/api/inbox';
import type { ReplyPayload, SendReplyPayload, SendEmailPayload } from '@/lib/api/inbox';

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inboxApi.markAsRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['emails'] }),
  });
}

export function useMarkAsUnread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inboxApi.markAsUnread(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['emails'] }),
  });
}

export function useToggleStar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inboxApi.toggleStar(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['emails'] }),
  });
}

export function useArchiveEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inboxApi.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      toast.success('Email archived');
    },
  });
}

export function useDeleteEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inboxApi.deleteEmail(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      toast.success('Email deleted');
    },
  });
}

export function useDraftReply() {
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReplyPayload }) => inboxApi.draftReply(id, payload),
    onError: () => toast.error('Failed to generate reply'),
  });
}

export function useSendReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SendReplyPayload }) => inboxApi.sendReply(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      toast.success('Reply sent');
    },
    onError: () => toast.error('Failed to send reply'),
  });
}

export function useSendEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SendEmailPayload) => inboxApi.sendEmail(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      toast.success('Email sent');
    },
    onError: () => toast.error('Failed to send email'),
  });
}

export function useBulkEmailAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: string }) => inboxApi.bulkAction(ids, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      toast.success('Bulk action completed');
    },
  });
}
