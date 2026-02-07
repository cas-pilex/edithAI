import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateContact } from '@/hooks/mutations/use-crm-mutations';
import type { CreateContactPayload } from '@/lib/api/crm';

interface ContactCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactCreateDialog({ open, onOpenChange }: ContactCreateDialogProps) {
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<CreateContactPayload>({
    defaultValues: { relationship: 'COLLEAGUE', importance: 3 },
  });
  const createMutation = useCreateContact();

  const onSubmit = (data: CreateContactPayload) => {
    createMutation.mutate(data, {
      onSuccess: () => { reset(); onOpenChange(false); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="John Doe" {...register('name', { required: 'Name is required' })} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="john@example.com" {...register('email', { required: 'Email is required' })} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input id="company" placeholder="Acme Inc." {...register('company')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" placeholder="CEO" {...register('title')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Relationship</Label>
              <Select defaultValue="COLLEAGUE" onValueChange={(v) => setValue('relationship', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COLLEAGUE">Colleague</SelectItem>
                  <SelectItem value="CLIENT">Client</SelectItem>
                  <SelectItem value="VENDOR">Vendor</SelectItem>
                  <SelectItem value="FRIEND">Friend</SelectItem>
                  <SelectItem value="FAMILY">Family</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" placeholder="+1 234 567 8900" {...register('phone')} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" placeholder="Add notes..." {...register('notes')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Add Contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
