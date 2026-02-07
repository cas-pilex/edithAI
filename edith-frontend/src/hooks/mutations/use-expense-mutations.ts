import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { expensesApi } from '@/lib/api/expenses';
import type { CreateExpensePayload, UpdateExpensePayload } from '@/lib/api/expenses';

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateExpensePayload) => expensesApi.createExpense(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense created');
    },
    onError: () => toast.error('Failed to create expense'),
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateExpensePayload & { id: string }) => expensesApi.updateExpense(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense updated');
    },
    onError: () => toast.error('Failed to update expense'),
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expensesApi.deleteExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense deleted');
    },
    onError: () => toast.error('Failed to delete expense'),
  });
}

export function useApproveExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expensesApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense approved');
    },
  });
}

export function useReimburseExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expensesApi.reimburse(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense reimbursed');
    },
  });
}
