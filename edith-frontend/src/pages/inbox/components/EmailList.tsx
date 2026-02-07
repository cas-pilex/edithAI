import { ScrollArea } from '@/components/ui/scroll-area';
import { EmailListItem } from './EmailListItem';
import type { Email } from '@/types';

interface EmailListProps {
  emails: Email[];
  selectedId: string | null;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
}

export function EmailList({ emails, selectedId, selectedIds, onSelect, onToggleSelect }: EmailListProps) {
  if (!emails.length) {
    return (
      <div className="flex flex-1 items-center justify-center border-r border-border p-8">
        <p className="text-sm text-muted-foreground">No emails found</p>
      </div>
    );
  }

  return (
    <ScrollArea className="w-80 shrink-0 border-r border-border">
      {emails.map((email) => (
        <EmailListItem
          key={email.id}
          email={email}
          isSelected={selectedId === email.id}
          isChecked={selectedIds.includes(email.id)}
          onSelect={() => onSelect(email.id)}
          onToggleSelect={() => onToggleSelect(email.id)}
        />
      ))}
    </ScrollArea>
  );
}
