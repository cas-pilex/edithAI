import { format } from 'date-fns';
import type { CalendarEvent } from '@/types';

interface EventBlockProps {
  event: CalendarEvent;
  onClick?: (eventId: string) => void;
}

export function EventBlock({ event, onClick }: EventBlockProps) {
  return (
    <div
      className="mb-0.5 cursor-pointer rounded bg-primary/15 px-2 py-1 text-xs hover:bg-primary/25"
      onClick={() => onClick?.(event.id)}
    >
      <p className="font-medium text-primary truncate">{event.title}</p>
      <p className="text-muted-foreground">
        {format(new Date(event.startTime), 'h:mm a')}
      </p>
    </div>
  );
}
