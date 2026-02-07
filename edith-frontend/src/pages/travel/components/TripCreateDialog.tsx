import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCreateTrip } from '@/hooks/mutations/use-travel-mutations';
import type { CreateTripPayload } from '@/lib/api/travel';

interface TripCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TripCreateDialog({ open, onOpenChange }: TripCreateDialogProps) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateTripPayload>({
    defaultValues: { currency: 'USD' },
  });
  const createMutation = useCreateTrip();

  const onSubmit = (data: CreateTripPayload) => {
    createMutation.mutate({ ...data, budget: data.budget ? Number(data.budget) : undefined }, {
      onSuccess: () => { reset(); onOpenChange(false); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan a Trip</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Trip Name</Label>
            <Input id="name" placeholder="Business trip to NYC" {...register('name', { required: 'Required' })} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="destination">Destination</Label>
            <Input id="destination" placeholder="New York, USA" {...register('destination', { required: 'Required' })} />
            {errors.destination && <p className="text-xs text-destructive">{errors.destination.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" type="date" {...register('startDate', { required: 'Required' })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input id="endDate" type="date" {...register('endDate', { required: 'Required' })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="purpose">Purpose</Label>
              <Input id="purpose" placeholder="Conference" {...register('purpose')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget">Budget</Label>
              <Input id="budget" type="number" step="0.01" placeholder="5000" {...register('budget')} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" placeholder="Trip notes..." {...register('notes')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Trip'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
