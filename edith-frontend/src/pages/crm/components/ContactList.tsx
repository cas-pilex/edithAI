import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn, getInitials } from '@/lib/utils';
import type { Contact } from '@/types';

const relationshipColors: Record<string, string> = {
  LEAD: 'bg-cyan-500/10 text-cyan-400',
  CLIENT: 'bg-green-500/10 text-green-400',
  PARTNER: 'bg-blue-500/10 text-blue-400',
  INVESTOR: 'bg-purple-500/10 text-purple-400',
  MENTOR: 'bg-amber-500/10 text-amber-400',
  FRIEND: 'bg-yellow-500/10 text-yellow-400',
  FAMILY: 'bg-pink-500/10 text-pink-400',
  OTHER: 'bg-zinc-500/10 text-zinc-400',
};

function contactDisplayName(contact: Contact): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || 'Unknown';
}

interface ContactListProps {
  contacts: Contact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ContactList({ contacts, selectedId, onSelect }: ContactListProps) {
  if (!contacts.length) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-border">
        <p className="text-sm text-muted-foreground">No contacts found</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 rounded-lg border border-border">
      {contacts.map((contact) => {
        const displayName = contactDisplayName(contact);
        return (
          <div
            key={contact.id}
            onClick={() => onSelect(contact.id)}
            className={cn(
              'flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 hover:bg-accent/50',
              selectedId === contact.id && 'bg-accent'
            )}
          >
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{displayName}</span>
                <Badge variant="secondary" className={cn('text-[10px] shrink-0', relationshipColors[contact.relationshipType])}>
                  {contact.relationshipType}
                </Badge>
              </div>
              {contact.company && <p className="text-xs text-muted-foreground truncate">{contact.company}{contact.jobTitle ? ` · ${contact.jobTitle}` : ''}</p>}
              {contact.email && <p className="text-xs text-muted-foreground truncate">{contact.email}</p>}
            </div>
            <div className="flex shrink-0">
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={i}
                  className={cn('h-1.5 w-1.5 rounded-full mx-0.5', i < (contact.importanceScore / 2) ? 'bg-primary' : 'bg-muted')}
                />
              ))}
            </div>
          </div>
        );
      })}
    </ScrollArea>
  );
}
