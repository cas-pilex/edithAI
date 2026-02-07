import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, string> = {
  PENDING: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  APPROVED: 'bg-green-500/10 text-green-500 border-green-500/20',
  REJECTED: 'bg-red-500/10 text-red-500 border-red-500/20',
  COMPLETED: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  CANCELLED: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  IN_PROGRESS: 'bg-primary/10 text-primary border-primary/20',
  TODO: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  CONFIRMED: 'bg-green-500/10 text-green-500 border-green-500/20',
  TENTATIVE: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const color = statusConfig[status] || 'bg-zinc-500/10 text-zinc-400';
  return (
    <Badge variant="outline" className={cn('text-[10px]', color, className)}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
