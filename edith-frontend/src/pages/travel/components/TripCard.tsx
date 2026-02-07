import { format } from 'date-fns';
import { MapPin, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, cn } from '@/lib/utils';
import type { Trip } from '@/types';

const statusColors: Record<string, string> = {
  PLANNING: 'bg-yellow-500/10 text-yellow-500',
  BOOKED: 'bg-blue-500/10 text-blue-500',
  IN_PROGRESS: 'bg-green-500/10 text-green-500',
  COMPLETED: 'bg-zinc-500/10 text-zinc-400',
  CANCELLED: 'bg-red-500/10 text-red-500',
};

interface TripCardProps {
  trip: Trip;
}

export function TripCard({ trip }: TripCardProps) {
  const budgetUsed = trip.budget ? ((trip.totalSpent || 0) / trip.budget) * 100 : 0;

  return (
    <Card className="hover:border-primary/30 transition-colors cursor-pointer">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base">{trip.name}</CardTitle>
          <Badge variant="secondary" className={cn('text-xs', statusColors[trip.status])}>
            {trip.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <span>{trip.destination}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>
            {format(new Date(trip.startDate), 'MMM d')} – {format(new Date(trip.endDate), 'MMM d, yyyy')}
          </span>
        </div>
        {trip.budget && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Budget</span>
              <span>{formatCurrency(trip.totalSpent || 0, trip.currency)} / {formatCurrency(trip.budget, trip.currency)}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', budgetUsed > 90 ? 'bg-destructive' : 'bg-primary')}
                style={{ width: `${Math.min(budgetUsed, 100)}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
