import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTodayEvents } from '@/hooks/queries/use-calendar';

interface CalendarSidebarProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

export function CalendarSidebar({ currentDate }: CalendarSidebarProps) {
  const { data } = useTodayEvents();
  const todayEvents = data?.data || [];

  return (
    <aside className="hidden w-64 shrink-0 space-y-4 lg:block">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Today's Events</CardTitle>
        </CardHeader>
        <CardContent>
          {!todayEvents.length ? (
            <p className="text-sm text-muted-foreground">No events today</p>
          ) : (
            <div className="space-y-2">
              {todayEvents.map((event) => (
                <div key={event.id} className="rounded border border-border p-2">
                  <p className="text-sm font-medium">{event.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(event.startTime), 'h:mm a')} – {format(new Date(event.endTime), 'h:mm a')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <p className="text-center text-sm text-muted-foreground">
            {format(currentDate, 'EEEE, MMMM d, yyyy')}
          </p>
        </CardContent>
      </Card>
    </aside>
  );
}
