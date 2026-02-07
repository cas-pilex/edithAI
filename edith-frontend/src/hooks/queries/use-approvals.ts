import { useQuery } from '@tanstack/react-query';
import { approvalsApi } from '@/lib/api/approvals';

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => approvalsApi.getPending(),
  });
}

export function useApprovalHistory() {
  return useQuery({
    queryKey: ['approvals', 'history'],
    queryFn: () => approvalsApi.getHistory(),
  });
}
