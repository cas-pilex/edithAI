import { Inbox, Star, AlertCircle, Tag, Users, Megaphone, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EmailFilters } from '@/lib/api/inbox';

const categories = [
  { key: 'PRIMARY', label: 'Primary', Icon: Inbox },
  { key: 'SOCIAL', label: 'Social', Icon: Users },
  { key: 'PROMOTIONS', label: 'Promotions', Icon: Megaphone },
  { key: 'UPDATES', label: 'Updates', Icon: RefreshCw },
  { key: 'SPAM', label: 'Spam', Icon: AlertCircle },
];

interface InboxSidebarProps {
  filters: EmailFilters;
  onChange: (filters: EmailFilters) => void;
}

export function InboxSidebar({ filters, onChange }: InboxSidebarProps) {
  return (
    <aside className="flex w-48 shrink-0 flex-col gap-1 overflow-auto">
      <Button
        variant="ghost"
        size="sm"
        className={cn('justify-start gap-2', !filters.category && !filters.isStarred && 'bg-accent')}
        onClick={() => onChange({})}
      >
        <Inbox className="h-4 w-4" /> All Mail
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn('justify-start gap-2', filters.isStarred && 'bg-accent')}
        onClick={() => onChange({ isStarred: true })}
      >
        <Star className="h-4 w-4" /> Starred
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn('justify-start gap-2', filters.isRead === false && 'bg-accent')}
        onClick={() => onChange({ isRead: false })}
      >
        <Tag className="h-4 w-4" /> Unread
      </Button>

      <div className="my-2 h-px bg-border" />

      {categories.map(({ key, label, Icon }) => (
        <Button
          key={key}
          variant="ghost"
          size="sm"
          className={cn('justify-start gap-2', filters.category === key && 'bg-accent')}
          onClick={() => onChange({ category: key })}
        >
          <Icon className="h-4 w-4" />
          <span className="flex-1 text-left">{label}</span>
        </Button>
      ))}
    </aside>
  );
}
