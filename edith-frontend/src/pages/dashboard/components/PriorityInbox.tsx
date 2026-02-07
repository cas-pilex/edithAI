import { Link } from 'react-router-dom';
import { Mail, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/utils';
import type { Email } from '@/types';

interface PriorityInboxProps {
  emails?: Email[];
}

export function PriorityInbox({ emails }: PriorityInboxProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Priority Inbox</CardTitle>
        <Link to="/inbox">
          <Button variant="ghost" size="sm" className="gap-1 text-xs">
            View all <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {!emails?.length ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <Mail className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Inbox zero! Nice work.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {emails.slice(0, 5).map((email) => (
              <div key={email.id} className="flex items-start gap-3 rounded-md p-2 hover:bg-accent">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{email.from}</span>
                    <Badge variant="secondary" className="text-[10px]">{email.category}</Badge>
                  </div>
                  <p className="truncate text-sm">{email.subject}</p>
                  <p className="text-xs text-muted-foreground">{formatRelativeTime(email.receivedAt || email.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
