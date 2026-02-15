import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types';

interface MonthViewProps {
  events: CalendarEvent[];
  currentDate: Date;
  onEventClick?: (eventId: string) => void;
}

export function MonthView({ events, currentDate, onEventClick }: MonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let day = calStart;
  while (day <= calEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="grid grid-cols-7 border-b border-border">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
      </div>
      {/* Grid */}
      <div className="grid flex-1 grid-cols-7">
        {days.map((d) => {
          const dayEvents = events.filter((e) => isSameDay(new Date(e.startTime), d));
          return (
            <div
              key={d.toISOString()}
              className={cn(
                'min-h-[80px] border-b border-r border-border p-1',
                !isSameMonth(d, currentDate) && 'opacity-40'
              )}
            >
              <span
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                  isToday(d) && 'bg-primary text-primary-foreground font-bold'
                )}
              >
                {format(d, 'd')}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    className="cursor-pointer truncate rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary hover:bg-primary/20"
                    onClick={() => onEventClick?.(event.id)}
                  >
                    {event.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
