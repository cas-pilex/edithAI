import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateExpense } from '@/hooks/mutations/use-expense-mutations';
import type { CreateExpensePayload } from '@/lib/api/expenses';

interface ExpenseCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExpenseCreateDialog({ open, onOpenChange }: ExpenseCreateDialogProps) {
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<CreateExpensePayload>({
    defaultValues: { currency: 'EUR', category: 'OTHER' },
  });
  const createMutation = useCreateExpense();

  const onSubmit = (data: CreateExpensePayload) => {
    createMutation.mutate({
      ...data,
      amount: Number(data.amount),
      date: new Date(data.date).toISOString(),
    }, {
      onSuccess: () => { reset(); onOpenChange(false); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" placeholder="Expense description" {...register('description', { required: 'Required' })} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" type="number" step="0.01" placeholder="0.00" {...register('amount', { required: 'Required' })} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select defaultValue="OTHER" onValueChange={(v) => setValue('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRAVEL">Travel</SelectItem>
                  <SelectItem value="MEALS">Meals</SelectItem>
                  <SelectItem value="ACCOMMODATION">Accommodation</SelectItem>
                  <SelectItem value="TRANSPORT">Transport</SelectItem>
                  <SelectItem value="SOFTWARE">Software</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" {...register('date', { required: 'Required' })} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor">Vendor</Label>
              <Input id="vendor" placeholder="Vendor name" {...register('vendor')} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Add Expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
