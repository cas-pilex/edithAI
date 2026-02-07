import { Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useContact, useInteractions } from '@/hooks/queries/use-crm';
import { InteractionTimeline } from './InteractionTimeline';
import { formatRelativeTime } from '@/lib/utils';

interface ContactDetailProps {
  contactId: string | null;
  onClose: () => void;
}

export function ContactDetail({ contactId }: ContactDetailProps) {
  const { data: contactData } = useContact(contactId || '');
  const { data: interactionsData } = useInteractions(contactId || '');
  const contact = contactData?.data;
  const interactions = interactionsData?.data || [];

  if (!contactId || !contact) {
    return (
      <div className="flex w-96 shrink-0 items-center justify-center rounded-lg border border-border">
        <div className="flex flex-col items-center gap-2">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Select a contact</p>
        </div>
      </div>
    );
  }

  return (
    <Card className="w-96 shrink-0 overflow-auto">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{contact.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{contact.email}</p>
        {contact.company && <p className="text-xs text-muted-foreground">{contact.company}{contact.title ? ` · ${contact.title}` : ''}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{contact.relationship}</Badge>
          {contact.tags.map((tag) => <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>)}
        </div>

        {contact.nextFollowUpAt && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
            <p className="text-xs text-primary">Follow-up: {formatRelativeTime(contact.nextFollowUpAt)}</p>
          </div>
        )}

        <Separator />

        <Tabs defaultValue="interactions">
          <TabsList className="w-full">
            <TabsTrigger value="interactions" className="flex-1">Interactions</TabsTrigger>
            <TabsTrigger value="notes" className="flex-1">Notes</TabsTrigger>
          </TabsList>
          <TabsContent value="interactions" className="mt-3">
            <InteractionTimeline interactions={interactions} contactId={contact.id} />
          </TabsContent>
          <TabsContent value="notes" className="mt-3">
            <p className="text-sm text-muted-foreground">{contact.notes || 'No notes yet'}</p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
