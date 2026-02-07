import { format } from 'date-fns';
import { Mail, Video, Phone, FileText } from 'lucide-react';
import type { Interaction } from '@/types';

const typeIcons: Record<string, React.ElementType> = {
  EMAIL: Mail,
  MEETING: Video,
  CALL: Phone,
  NOTE: FileText,
};

interface InteractionTimelineProps {
  interactions: Interaction[];
  contactId: string;
}

export function InteractionTimeline({ interactions }: InteractionTimelineProps) {
  if (!interactions.length) {
    return <p className="text-sm text-muted-foreground">No interactions yet</p>;
  }

  return (
    <div className="space-y-3">
      {interactions.map((interaction) => {
        const Icon = typeIcons[interaction.type] || FileText;
        return (
          <div key={interaction.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 w-px bg-border" />
            </div>
            <div className="pb-3 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{interaction.type}</span>
                <span className="text-xs text-muted-foreground">{format(new Date(interaction.date), 'MMM d, yyyy')}</span>
              </div>
              {interaction.subject && <p className="text-sm">{interaction.subject}</p>}
              {interaction.notes && <p className="text-xs text-muted-foreground mt-0.5">{interaction.notes}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
