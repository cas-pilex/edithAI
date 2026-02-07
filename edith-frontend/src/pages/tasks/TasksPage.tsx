import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { staggerContainer, staggerItem } from '@/lib/animations';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTasks, useOverdueTasks, useTodayTasks } from '@/hooks/queries/use-tasks';
import { TaskGroup } from './components/TaskGroup';
import { TaskCreateDialog } from './components/TaskCreateDialog';
import { TaskFilters } from './components/TaskFilters';
import type { TaskFilters as TaskFiltersType } from '@/lib/api/tasks';

export function TasksPage() {
  const [filters, setFilters] = useState<TaskFiltersType>({});
  const [createOpen, setCreateOpen] = useState(false);

  const { data: tasksData, isLoading } = useTasks(filters);
  const { data: overdueData } = useOverdueTasks();
  const { data: todayData } = useTodayTasks();

  const tasks = tasksData?.data || [];
  const overdueTasks = overdueData?.data || [];
  const todayTasks = todayData?.data || [];

  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED');
  const activeTasks = tasks.filter((t) => t.status !== 'COMPLETED');

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={staggerItem} className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Tasks</h2>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </motion.div>

      <motion.div variants={staggerItem}>
        <TaskFilters filters={filters} onChange={setFilters} />
      </motion.div>

      <div className="space-y-4">
        {overdueTasks.length > 0 && (
          <motion.div variants={staggerItem}>
            <TaskGroup title="Overdue" tasks={overdueTasks} variant="destructive" defaultOpen />
          </motion.div>
        )}
        {todayTasks.length > 0 && (
          <motion.div variants={staggerItem}>
            <TaskGroup title="Today" tasks={todayTasks} variant="primary" defaultOpen />
          </motion.div>
        )}
        {activeTasks.length > 0 && (
          <motion.div variants={staggerItem}>
            <TaskGroup title="All Active" tasks={activeTasks} defaultOpen />
          </motion.div>
        )}
        {completedTasks.length > 0 && (
          <motion.div variants={staggerItem}>
            <TaskGroup title="Completed" tasks={completedTasks} />
          </motion.div>
        )}
      </div>

      <TaskCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </motion.div>
  );
}
