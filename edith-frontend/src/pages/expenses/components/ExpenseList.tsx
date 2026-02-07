import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { cn, formatCurrency } from '@/lib/utils';
import type { Expense } from '@/types';

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  APPROVED: 'bg-green-500/10 text-green-500 border-green-500/20',
  REJECTED: 'bg-red-500/10 text-red-500 border-red-500/20',
  REIMBURSED: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

interface ExpenseListProps {
  expenses: Expense[];
}

export function ExpenseList({ expenses }: ExpenseListProps) {
  if (!expenses.length) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border py-12">
        <p className="text-sm text-muted-foreground">No expenses found</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="grid grid-cols-[1fr_120px_120px_100px_100px] gap-4 border-b border-border bg-accent/30 px-4 py-2 text-xs font-medium text-muted-foreground">
        <span>Description</span>
        <span>Category</span>
        <span>Date</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Status</span>
      </div>
      {expenses.map((expense) => (
        <div
          key={expense.id}
          className="grid grid-cols-[1fr_120px_120px_100px_100px] gap-4 border-b border-border px-4 py-3 last:border-b-0 hover:bg-accent/30"
        >
          <div className="min-w-0">
            <p className="truncate text-sm">{expense.description}</p>
            {expense.vendor && <p className="truncate text-xs text-muted-foreground">{expense.vendor}</p>}
          </div>
          <Badge variant="secondary" className="w-fit text-xs">{expense.category}</Badge>
          <span className="text-sm text-muted-foreground">{format(new Date(expense.date), 'MMM d, yyyy')}</span>
          <span className="text-right text-sm font-medium">{formatCurrency(expense.amount, expense.currency)}</span>
          <div className="flex justify-end">
            <Badge variant="outline" className={cn('text-[10px]', statusColors[expense.status])}>{expense.status}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
