import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { approvalsApi } from '@/lib/api/approvals';

export function useApproveAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      toast.success('Action approved');
    },
    onError: () => toast.error('Failed to approve'),
  });
}

export function useRejectAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => approvalsApi.reject(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      toast.success('Action rejected');
    },
    onError: () => toast.error('Failed to reject'),
  });
}

export function useModifyAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, modifiedData }: { id: string; modifiedData: Record<string, unknown> }) =>
      approvalsApi.modify(id, modifiedData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      toast.success('Action modified and approved');
    },
    onError: () => toast.error('Failed to modify'),
  });
}
