import { Archive, Mail, MailOpen, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBulkEmailAction } from '@/hooks/mutations/use-inbox-mutations';

interface BulkActionBarProps {
  selectedIds: string[];
  onClear: () => void;
}

export function BulkActionBar({ selectedIds, onClear }: BulkActionBarProps) {
  const bulkAction = useBulkEmailAction();

  const handleAction = (action: string) => {
    bulkAction.mutate({ ids: selectedIds, action }, { onSuccess: onClear });
  };

  return (
    <div className="flex items-center gap-2 border-b border-border bg-accent/30 px-3 py-2">
      <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={() => handleAction('archive')}>
          <Archive className="mr-1 h-3 w-3" /> Archive
        </Button>
        <Button variant="ghost" size="sm" onClick={() => handleAction('read')}>
          <MailOpen className="mr-1 h-3 w-3" /> Read
        </Button>
        <Button variant="ghost" size="sm" onClick={() => handleAction('unread')}>
          <Mail className="mr-1 h-3 w-3" /> Unread
        </Button>
        <Button variant="ghost" size="sm" onClick={() => handleAction('delete')} className="text-destructive">
          <Trash2 className="mr-1 h-3 w-3" /> Delete
        </Button>
      </div>
      <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={onClear}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
