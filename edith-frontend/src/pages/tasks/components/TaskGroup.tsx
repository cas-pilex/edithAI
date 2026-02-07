import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TaskItem } from './TaskItem';
import type { Task } from '@/types';

interface TaskGroupProps {
  title: string;
  tasks: Task[];
  variant?: 'default' | 'destructive' | 'primary';
  defaultOpen?: boolean;
}

export function TaskGroup({ title, tasks, variant = 'default', defaultOpen = false }: TaskGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 p-3 text-left hover:bg-accent/50"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span
          className={cn(
            'text-sm font-medium',
            variant === 'destructive' && 'text-destructive',
            variant === 'primary' && 'text-primary'
          )}
        >
          {title}
        </span>
        <Badge variant="secondary" className="text-xs">{tasks.length}</Badge>
      </button>
      {open && (
        <div className="border-t border-border">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
