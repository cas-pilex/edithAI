import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar, Clock, MapPin, Users, Video, Sparkles, FileText, StickyNote, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useCalendarEvent } from '@/hooks/queries/use-calendar';
import { useEventPrep } from '@/hooks/queries/use-calendar';
import { useGenerateEventPrep, useSaveEventPrepNotes } from '@/hooks/mutations/use-calendar-mutations';
import type { MeetingBriefData } from '@/lib/api/calendar';

interface EventDetailDialogProps {
  eventId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventDetailDialog({ eventId, open, onOpenChange }: EventDetailDialogProps) {
  const [notes, setNotes] = useState('');
  const [briefData, setBriefData] = useState<MeetingBriefData | null>(null);

  const { data: eventData } = useCalendarEvent(eventId || '');
  const { data: prepData } = useEventPrep(eventId);
  const generateMutation = useGenerateEventPrep();
  const saveNotesMutation = useSaveEventPrepNotes();

  const event = eventData?.data;
  const prep = prepData?.data;

  const handleGenerate = () => {
    if (!eventId) return;
    generateMutation.mutate(eventId, {
      onSuccess: (data) => {
        setBriefData(data.data);
        if (data.data.aiSummary) {
          // Notes field gets populated with existing prep notes if any
        }
      },
    });
  };

  const handleSaveNotes = () => {
    if (!eventId || !notes.trim()) return;
    saveNotesMutation.mutate({ eventId, notes });
  };

  if (!event) return null;

  const attendees = event.attendees || [];
  const brief = briefData;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{event.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Event Info */}
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {format(new Date(event.startTime), 'MMM d, yyyy')}
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {format(new Date(event.startTime), 'h:mm a')} - {format(new Date(event.endTime), 'h:mm a')}
            </div>
            {event.location && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {event.location}
              </div>
            )}
          </div>

          {event.meetingUrl && (
            <a
              href={event.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Video className="h-4 w-4" /> Join Meeting <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {event.description && (
            <p className="text-sm text-muted-foreground">{event.description}</p>
          )}

          {/* Attendees */}
          {attendees.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="flex items-center gap-1.5 text-sm font-medium mb-2">
                  <Users className="h-4 w-4" /> Attendees ({attendees.length})
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {attendees.map((a) => (
                    <Badge key={a.email} variant="secondary" className="text-xs">
                      {a.name || a.email}
                      {a.status === 'accepted' && ' ✓'}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Generate Prep Button */}
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4" /> Meeting Prep
            </h4>
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
            >
              <Sparkles className="mr-1 h-3 w-3" />
              {generateMutation.isPending ? 'Generating...' : prep ? 'Regenerate' : 'Generate Prep'}
            </Button>
          </div>

          {/* AI Summary */}
          {brief?.aiSummary && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <h5 className="font-medium mb-1 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> AI Summary
              </h5>
              <p className="whitespace-pre-wrap text-muted-foreground">{brief.aiSummary}</p>
            </div>
          )}

          {/* Talking Points */}
          {brief?.talkingPoints && brief.talkingPoints.length > 0 && (
            <div>
              <h5 className="text-sm font-medium mb-1.5">Talking Points</h5>
              <ul className="space-y-1">
                {brief.talkingPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Badge variant="outline" className="text-[10px] mt-0.5 shrink-0">{point.category}</Badge>
                    <span className="text-muted-foreground">{point.point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Related Emails */}
          {brief?.emailHistory && brief.emailHistory.length > 0 && (
            <div>
              <h5 className="text-sm font-medium mb-1.5">Related Emails</h5>
              <div className="space-y-1">
                {brief.emailHistory.slice(0, 5).map((email) => (
                  <div key={email.id} className="text-xs text-muted-foreground rounded bg-muted/30 px-2 py-1.5">
                    <span className="font-medium">{email.from}:</span> {email.subject}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existing Prep Talking Points (from DB) */}
          {!brief && prep?.suggestedTalkingPoints && prep.suggestedTalkingPoints.length > 0 && (
            <div>
              <h5 className="text-sm font-medium mb-1.5">Talking Points</h5>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {prep.suggestedTalkingPoints.map((point, i) => (
                  <li key={i}>• {point}</li>
                ))}
              </ul>
            </div>
          )}

          <Separator />

          {/* User Notes */}
          <div>
            <h4 className="flex items-center gap-1.5 text-sm font-medium mb-2">
              <StickyNote className="h-4 w-4" /> Your Notes
            </h4>
            <Textarea
              placeholder="Add your notes for this meeting..."
              value={notes || prep?.userNotes || ''}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={handleSaveNotes}
              disabled={saveNotesMutation.isPending || !notes.trim()}
            >
              {saveNotesMutation.isPending ? 'Saving...' : 'Save Notes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
