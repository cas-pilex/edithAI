import { format } from 'date-fns';
import type { CalendarEvent } from '@/types';

interface EventBlockProps {
  event: CalendarEvent;
}

export function EventBlock({ event }: EventBlockProps) {
  return (
    <div className="mb-0.5 cursor-pointer rounded bg-primary/15 px-2 py-1 text-xs hover:bg-primary/25">
      <p className="font-medium text-primary truncate">{event.title}</p>
      <p className="text-muted-foreground">
        {format(new Date(event.startTime), 'h:mm a')}
      </p>
    </div>
  );
}
