import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useCompleteTask, useReopenTask } from '@/hooks/mutations/use-task-mutations';
import type { Task } from '@/types';

const priorityColors: Record<string, string> = {
  URGENT: 'bg-red-500/10 text-red-500 border-red-500/20',
  HIGH: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  MEDIUM: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  LOW: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

interface TaskItemProps {
  task: Task;
}

export function TaskItem({ task }: TaskItemProps) {
  const completeMutation = useCompleteTask();
  const reopenMutation = useReopenTask();
  const isCompleted = task.status === 'DONE';

  const handleToggle = () => {
    if (isCompleted) {
      reopenMutation.mutate(task.id);
    } else {
      completeMutation.mutate(task.id);
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-accent/30">
      <Checkbox checked={isCompleted} onCheckedChange={handleToggle} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', isCompleted && 'text-muted-foreground line-through')}>{task.title}</p>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="outline" className={cn('text-[10px]', priorityColors[task.priority])}>
            {task.priority}
          </Badge>
          {task.dueDate && (
            <span className="text-xs text-muted-foreground">{format(new Date(task.dueDate), 'MMM d')}</span>
          )}
          {task.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
