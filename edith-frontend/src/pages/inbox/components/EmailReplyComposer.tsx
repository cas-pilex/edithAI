import { useState } from 'react';
import { Send, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDraftReply, useSendReply } from '@/hooks/mutations/use-inbox-mutations';

interface EmailReplyComposerProps {
  emailId: string;
  onClose: () => void;
}

export function EmailReplyComposer({ emailId, onClose }: EmailReplyComposerProps) {
  const [body, setBody] = useState('');
  const [tone, setTone] = useState('professional');
  const draftMutation = useDraftReply();
  const sendMutation = useSendReply();

  const handleAiDraft = () => {
    draftMutation.mutate(
      { id: emailId, payload: { body, tone } },
      { onSuccess: (data) => setBody(data.data.draft) }
    );
  };

  const handleSend = () => {
    if (!body.trim()) return;
    sendMutation.mutate(
      { id: emailId, payload: { body } },
      { onSuccess: () => onClose() }
    );
  };

  return (
    <div className="border-t border-border p-3 space-y-3">
      <Textarea
        placeholder="Type your reply..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="friendly">Friendly</SelectItem>
              <SelectItem value="concise">Concise</SelectItem>
              <SelectItem value="formal">Formal</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleAiDraft} disabled={draftMutation.isPending}>
            <Wand2 className="mr-1 h-3 w-3" />
            {draftMutation.isPending ? 'Drafting...' : 'AI Draft'}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="gap-1" onClick={handleSend} disabled={!body.trim() || sendMutation.isPending}>
            <Send className="h-3 w-3" /> {sendMutation.isPending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}
