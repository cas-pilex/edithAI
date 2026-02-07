import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  variant?: 'default' | 'destructive';
  confirmLabel?: string;
  isLoading?: boolean;
}

export function ConfirmDialog({
  open, onOpenChange, title, description, onConfirm,
  variant = 'default', confirmLabel = 'Confirm', isLoading,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={() => { onConfirm(); onOpenChange(false); }}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
