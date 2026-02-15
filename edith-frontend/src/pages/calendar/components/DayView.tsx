import { format, isSameDay } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EventBlock } from './EventBlock';
import type { CalendarEvent } from '@/types';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface DayViewProps {
  events: CalendarEvent[];
  currentDate: Date;
  onEventClick?: (eventId: string) => void;
}

export function DayView({ events, currentDate, onEventClick }: DayViewProps) {
  return (
    <ScrollArea className="h-full">
      <div>
        {HOURS.map((hour) => {
          const hourEvents = events.filter((e) => {
            const start = new Date(e.startTime);
            return isSameDay(start, currentDate) && start.getHours() === hour;
          });
          return (
            <div key={hour} className="flex border-b border-border">
              <div className="w-16 shrink-0 p-2 text-right text-xs text-muted-foreground">
                {format(new Date().setHours(hour, 0), 'h:mm a')}
              </div>
              <div className="relative min-h-[3rem] flex-1 border-l border-border p-1">
                {hourEvents.map((event) => (
                  <EventBlock key={event.id} event={event} onClick={onEventClick} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
