import { Star } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useToggleStar } from '@/hooks/mutations/use-inbox-mutations';
import type { Email } from '@/types';

interface EmailListItemProps {
  email: Email;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: () => void;
  onToggleSelect: () => void;
}

export function EmailListItem({ email, isSelected, isChecked, onSelect, onToggleSelect }: EmailListItemProps) {
  const toggleStar = useToggleStar();

  return (
    <div
      className={cn(
        'flex cursor-pointer items-start gap-2 border-b border-border px-3 py-3 hover:bg-accent/50',
        isSelected && 'bg-accent',
        !email.isRead && 'bg-primary/5'
      )}
      onClick={onSelect}
    >
      <Checkbox
        checked={isChecked}
        onCheckedChange={(e) => { e; onToggleSelect(); }}
        onClick={(e) => e.stopPropagation()}
        className="mt-1"
      />
      <button
        onClick={(e) => { e.stopPropagation(); toggleStar.mutate(email.id); }}
        className="mt-0.5 shrink-0"
      >
        <Star className={cn('h-4 w-4', email.isStarred ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground')} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('truncate text-sm', !email.isRead && 'font-semibold')}>{email.from}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeTime(email.receivedAt || email.createdAt)}
          </span>
        </div>
        <p className={cn('truncate text-sm', !email.isRead && 'font-medium')}>{email.subject}</p>
        <div className="flex items-center gap-2">
          <p className="truncate text-xs text-muted-foreground">{email.snippet}</p>
          {email.category && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">{email.category}</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
