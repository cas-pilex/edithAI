import { useQuery } from '@tanstack/react-query';
import { expensesApi, type ExpenseFilters } from '@/lib/api/expenses';

export function useExpenses(filters?: ExpenseFilters) {
  return useQuery({
    queryKey: ['expenses', filters],
    queryFn: () => expensesApi.getExpenses(filters),
  });
}

export function useExpense(id: string) {
  return useQuery({
    queryKey: ['expenses', id],
    queryFn: () => expensesApi.getExpense(id),
    enabled: !!id,
  });
}

export function useExpenseSummary(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['expenses', 'summary', startDate, endDate],
    queryFn: () => expensesApi.getSummary(startDate, endDate),
  });
}
