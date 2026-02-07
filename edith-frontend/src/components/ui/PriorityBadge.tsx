import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const priorityConfig: Record<string, { color: string; label: string }> = {
  URGENT: { color: 'bg-red-500/10 text-red-500 border-red-500/20', label: 'Urgent' },
  HIGH: { color: 'bg-orange-500/10 text-orange-500 border-orange-500/20', label: 'High' },
  MEDIUM: { color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', label: 'Medium' },
  LOW: { color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20', label: 'Low' },
};

interface PriorityBadgeProps {
  priority: string;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const config = priorityConfig[priority] || priorityConfig.MEDIUM;
  return (
    <Badge variant="outline" className={cn('text-[10px]', config.color, className)}>
      {config.label}
    </Badge>
  );
}
