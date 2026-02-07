import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatRelativeTime } from '@/lib/utils';
import type { ActivityItem } from '@/types';

interface ActivityFeedProps {
  activities?: ActivityItem[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          {!activities?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {activities.map((activity) => (
                <div key={activity.id} className="flex gap-3">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{activity.title}</p>
                    {activity.description && (
                      <p className="text-xs text-muted-foreground">{activity.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{formatRelativeTime(activity.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
