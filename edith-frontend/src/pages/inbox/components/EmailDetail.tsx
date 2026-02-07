import { format } from 'date-fns';
import { Archive, Trash2, Reply } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useEmail } from '@/hooks/queries/use-inbox';
import { useArchiveEmail, useDeleteEmail } from '@/hooks/mutations/use-inbox-mutations';
import { EmailReplyComposer } from './EmailReplyComposer';
import { useState } from 'react';

interface EmailDetailProps {
  emailId: string | null;
  onClose: () => void;
}

export function EmailDetail({ emailId, onClose }: EmailDetailProps) {
  const { data } = useEmail(emailId || '');
  const archiveMutation = useArchiveEmail();
  const deleteMutation = useDeleteEmail();
  const [showReply, setShowReply] = useState(false);
  const email = data?.data;

  if (!emailId || !email) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Select an email to read</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Button variant="ghost" size="icon" onClick={() => archiveMutation.mutate(email.id)}>
          <Archive className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => { deleteMutation.mutate(email.id); onClose(); }}>
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setShowReply(!showReply)}>
          <Reply className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">{email.subject}</h3>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm font-medium">{email.from}</span>
              <span className="text-xs text-muted-foreground">
                to {email.to.join(', ')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(email.receivedAt || email.createdAt), 'PPpp')}
            </p>
          </div>
          {email.aiSummary && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs font-medium text-primary">AI Summary</p>
              <p className="mt-1 text-sm">{email.aiSummary}</p>
            </div>
          )}
          {email.labels.length > 0 && (
            <div className="flex gap-1">
              {email.labels.map((label) => (
                <Badge key={label} variant="secondary" className="text-xs">{label}</Badge>
              ))}
            </div>
          )}
          <Separator />
          <div className="prose prose-sm prose-invert max-w-none">
            <div dangerouslySetInnerHTML={{ __html: email.body }} />
          </div>
        </div>
      </ScrollArea>
      {showReply && <EmailReplyComposer emailId={email.id} onClose={() => setShowReply(false)} />}
    </div>
  );
}
