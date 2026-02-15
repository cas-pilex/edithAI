import { Link } from 'react-router-dom';
import { AlertTriangle, HelpCircle, Info, ListChecks, Sparkles, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useBriefing } from '@/hooks/queries/use-inbox';

export function DailyBriefing() {
  const { data, isLoading, isError } = useBriefing();
  const briefing = data?.data;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" /> Daily Briefing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Generating briefing...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !briefing) {
    return null;
  }

  const hasContent =
    briefing.urgentItems.length > 0 ||
    briefing.questionsToAnswer.length > 0 ||
    briefing.fyiItems.length > 0 ||
    briefing.extractedTasks.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" /> Daily Briefing
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {briefing.totalUnread} unread
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI Summary */}
        {briefing.summary && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {briefing.summary}
          </p>
        )}

        {!hasContent && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No items requiring attention.
          </p>
        )}

        {/* Urgent items */}
        {briefing.urgentItems.length > 0 && (
          <div>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> Urgent
            </h4>
            <div className="space-y-1">
              {briefing.urgentItems.map((item, i) => (
                <Link
                  key={i}
                  to={`/inbox?email=${item.emailId}`}
                  className="block rounded px-2 py-1 text-sm hover:bg-accent"
                >
                  <span className="font-medium">{item.subject}</span>
                  <span className="ml-1 text-muted-foreground">— {item.reason}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Questions to answer */}
        {briefing.questionsToAnswer.length > 0 && (
          <div>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400">
              <HelpCircle className="h-3.5 w-3.5" /> Questions
            </h4>
            <div className="space-y-1">
              {briefing.questionsToAnswer.map((q, i) => (
                <Link
                  key={i}
                  to={`/inbox?email=${q.emailId}`}
                  className="block rounded px-2 py-1 text-sm hover:bg-accent"
                >
                  <span className="font-medium">{q.from}</span>
                  <span className="ml-1 text-muted-foreground">— {q.question}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* FYI items */}
        {briefing.fyiItems.length > 0 && (
          <div>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <Info className="h-3.5 w-3.5" /> FYI
            </h4>
            <div className="space-y-1">
              {briefing.fyiItems.slice(0, 5).map((item, i) => (
                <Link
                  key={i}
                  to={`/inbox?email=${item.emailId}`}
                  className="block rounded px-2 py-1 text-sm hover:bg-accent"
                >
                  <span className="font-medium">{item.subject}</span>
                  <span className="ml-1 text-muted-foreground">— {item.oneLiner}</span>
                </Link>
              ))}
              {briefing.fyiItems.length > 5 && (
                <p className="px-2 text-xs text-muted-foreground">
                  +{briefing.fyiItems.length - 5} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Extracted tasks */}
        {briefing.extractedTasks.length > 0 && (
          <div>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <ListChecks className="h-3.5 w-3.5" /> Extracted Tasks
            </h4>
            <div className="space-y-1">
              {briefing.extractedTasks.map((task, i) => (
                <div key={i} className="flex items-center gap-2 rounded px-2 py-1 text-sm">
                  <Badge
                    variant={task.priority === 'URGENT' || task.priority === 'HIGH' ? 'destructive' : 'secondary'}
                    className="text-[10px]"
                  >
                    {task.priority}
                  </Badge>
                  <span>{task.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
