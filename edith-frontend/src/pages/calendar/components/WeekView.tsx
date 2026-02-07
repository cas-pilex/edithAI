import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EventBlock } from './EventBlock';
import type { CalendarEvent } from '@/types';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface WeekViewProps {
  events: CalendarEvent[];
  currentDate: Date;
}

export function WeekView({ events, currentDate }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <ScrollArea className="h-full">
      <div className="min-w-[800px]">
        {/* Header */}
        <div className="sticky top-0 z-10 grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-card">
          <div />
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={`border-l border-border p-2 text-center text-sm ${
                isSameDay(day, new Date()) ? 'text-primary font-semibold' : 'text-muted-foreground'
              }`}
            >
              <div>{format(day, 'EEE')}</div>
              <div className="text-lg">{format(day, 'd')}</div>
            </div>
          ))}
        </div>
        {/* Time grid */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div className="border-b border-border p-1 text-right text-xs text-muted-foreground">
                {format(new Date().setHours(hour, 0), 'ha')}
              </div>
              {days.map((day) => {
                const dayEvents = events.filter((e) => {
                  const start = new Date(e.startTime);
                  return isSameDay(start, day) && start.getHours() === hour;
                });
                return (
                  <div key={`${day.toISOString()}-${hour}`} className="relative h-12 border-b border-l border-border">
                    {dayEvents.map((event) => (
                      <EventBlock key={event.id} event={event} />
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
