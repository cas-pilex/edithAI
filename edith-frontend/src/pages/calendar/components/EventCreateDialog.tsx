import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useCreateEvent } from '@/hooks/mutations/use-calendar-mutations';
import type { CreateEventPayload } from '@/lib/api/calendar';

interface EventCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventCreateDialog({ open, onOpenChange }: EventCreateDialogProps) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CreateEventPayload>({
    defaultValues: { isAllDay: false },
  });
  const createMutation = useCreateEvent();
  const isAllDay = watch('isAllDay');

  const onSubmit = (data: CreateEventPayload) => {
    createMutation.mutate({
      ...data,
      startTime: new Date(data.startTime).toISOString(),
      endTime: new Date(data.endTime).toISOString(),
    }, {
      onSuccess: () => { reset(); onOpenChange(false); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Event</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" placeholder="Event title" {...register('title', { required: 'Title is required' })} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" placeholder="Add details..." {...register('description')} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isAllDay} onCheckedChange={(v) => setValue('isAllDay', v)} />
            <Label>All day</Label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Start</Label>
              <Input id="startTime" type={isAllDay ? 'date' : 'datetime-local'} {...register('startTime', { required: 'Start time is required' })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">End</Label>
              <Input id="endTime" type={isAllDay ? 'date' : 'datetime-local'} {...register('endTime', { required: 'End time is required' })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input id="location" placeholder="Location" {...register('location')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meetingUrl">Meeting URL</Label>
              <Input id="meetingUrl" placeholder="https://..." {...register('meetingUrl')} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Event'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
