import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { staggerContainer, staggerItem } from '@/lib/animations';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useExpenses, useExpenseSummary } from '@/hooks/queries/use-expenses';
import { ExpenseSummaryCards } from './components/ExpenseSummaryCards';
import { ExpenseList } from './components/ExpenseList';
import { ExpenseCreateDialog } from './components/ExpenseCreateDialog';
import { ExpenseFilters } from './components/ExpenseFilters';
import type { ExpenseFilters as ExpenseFiltersType } from '@/lib/api/expenses';

export function ExpensesPage() {
  const [filters, setFilters] = useState<ExpenseFiltersType>({});
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading } = useExpenses(filters);
  const { data: summaryData } = useExpenseSummary();
  const expenses = data?.data || [];
  const summary = summaryData?.data;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={staggerItem} className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Expenses</h2>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add Expense
        </Button>
      </motion.div>

      <motion.div variants={staggerItem}>
        <ExpenseSummaryCards summary={summary} />
      </motion.div>

      <motion.div variants={staggerItem}>
        <ExpenseFilters filters={filters} onChange={setFilters} />
      </motion.div>

      <motion.div variants={staggerItem}>
        <ExpenseList expenses={expenses} />
      </motion.div>

      <ExpenseCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </motion.div>
  );
}
