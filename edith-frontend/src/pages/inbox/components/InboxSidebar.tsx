import { Inbox, Send, Star, AlertTriangle, Tag, Clock, ArrowRight, Info, Newspaper, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EmailFilters } from '@/lib/api/inbox';

const categories = [
  { key: 'URGENT', label: 'Urgent', Icon: AlertTriangle },
  { key: 'ACTION_REQUIRED', label: 'Action Required', Icon: ArrowRight },
  { key: 'FOLLOW_UP', label: 'Follow Up', Icon: Clock },
  { key: 'FYI', label: 'FYI', Icon: Info },
  { key: 'NEWSLETTER', label: 'Newsletter', Icon: Newspaper },
  { key: 'SPAM', label: 'Spam', Icon: AlertCircle },
];

interface InboxSidebarProps {
  filters: EmailFilters;
  onChange: (filters: EmailFilters) => void;
}

export function InboxSidebar({ filters, onChange }: InboxSidebarProps) {
  const isSent = filters.label === 'sent';
  const isInbox = !isSent;

  return (
    <aside className="flex w-48 shrink-0 flex-col gap-1 overflow-auto">
      {/* Inbox / Sent tabs */}
      <Button
        variant="ghost"
        size="sm"
        className={cn('justify-start gap-2', isInbox && !filters.category && !filters.isStarred && !filters.isRead && 'bg-accent')}
        onClick={() => onChange({})}
      >
        <Inbox className="h-4 w-4" /> Inbox
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn('justify-start gap-2', isSent && 'bg-accent')}
        onClick={() => onChange({ label: 'sent' })}
      >
        <Send className="h-4 w-4" /> Sent
      </Button>

      <div className="my-2 h-px bg-border" />

      {/* Quick filters (only show for inbox, not sent) */}
      {isInbox && (
        <>
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
        </>
      )}
    </aside>
  );
}
