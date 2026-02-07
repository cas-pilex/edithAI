import { Link } from 'react-router-dom';
import { CalendarDays, ArrowRight, MapPin, Video } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import type { CalendarEvent } from '@/types';

interface UpcomingEventsProps {
  events?: CalendarEvent[];
}

export function UpcomingEvents({ events }: UpcomingEventsProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Upcoming Events</CardTitle>
        <Link to="/calendar">
          <Button variant="ghost" size="sm" className="gap-1 text-xs">
            View all <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {!events?.length ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No upcoming events</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.slice(0, 5).map((event) => (
              <div key={event.id} className="rounded-md border border-border p-3">
                <p className="text-sm font-medium">{event.title}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(event.startTime), 'MMM d, h:mm a')} –{' '}
                  {format(new Date(event.endTime), 'h:mm a')}
                </p>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  {event.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {event.location}
                    </span>
                  )}
                  {event.meetingUrl && (
                    <span className="flex items-center gap-1">
                      <Video className="h-3 w-3" /> Video call
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
