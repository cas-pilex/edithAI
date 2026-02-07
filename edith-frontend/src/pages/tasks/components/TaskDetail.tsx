import { format } from 'date-fns';
import { X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useTask } from '@/hooks/queries/use-tasks';
import { useCompleteTask, useDeleteTask } from '@/hooks/mutations/use-task-mutations';
import { cn } from '@/lib/utils';

const priorityColors: Record<string, string> = {
  URGENT: 'bg-red-500/10 text-red-500 border-red-500/20',
  HIGH: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  MEDIUM: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  LOW: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

interface TaskDetailProps {
  taskId: string | null;
  onClose: () => void;
}

export function TaskDetail({ taskId, onClose }: TaskDetailProps) {
  const { data } = useTask(taskId || '');
  const completeMutation = useCompleteTask();
  const deleteMutation = useDeleteTask();
  const task = data?.data;

  return (
    <Sheet open={!!taskId} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>Task Details</SheetTitle>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </SheetHeader>
        {task && (
          <div className="mt-4 space-y-4">
            <h3 className="text-lg font-semibold">{task.title}</h3>
            {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn('text-xs', priorityColors[task.priority])}>{task.priority}</Badge>
              <Badge variant="secondary" className="text-xs">{task.status}</Badge>
            </div>
            {task.dueDate && (
              <div>
                <p className="text-xs text-muted-foreground">Due date</p>
                <p className="text-sm">{format(new Date(task.dueDate), 'MMMM d, yyyy')}</p>
              </div>
            )}
            {task.tags.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Tags</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {task.tags.map((tag) => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}
                </div>
              </div>
            )}
            <Separator />
            <div className="flex gap-2">
              {task.status !== 'COMPLETED' && (
                <Button size="sm" onClick={() => completeMutation.mutate(task.id)}>Mark Complete</Button>
              )}
              <Button size="sm" variant="destructive" onClick={() => { deleteMutation.mutate(task.id); onClose(); }}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
