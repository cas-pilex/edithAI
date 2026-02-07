import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useModifyAction } from '@/hooks/mutations/use-approval-mutations';
import type { Approval } from '@/types';

interface ApprovalModifyDialogProps {
  approval: Approval | null;
  onClose: () => void;
}

export function ApprovalModifyDialog({ approval, onClose }: ApprovalModifyDialogProps) {
  const [modifications, setModifications] = useState('');
  const modifyMutation = useModifyAction();

  const handleSubmit = () => {
    if (!approval) return;
    try {
      const modifiedData = JSON.parse(modifications || '{}');
      modifyMutation.mutate(
        { id: approval.id, modifiedData },
        { onSuccess: onClose }
      );
    } catch {
      // Invalid JSON
    }
  };

  return (
    <Dialog open={!!approval} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modify Action</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm">{approval?.description}</p>
          </div>
          <div className="space-y-2">
            <Label>Current Data</Label>
            <pre className="rounded-md bg-accent p-3 text-xs overflow-auto max-h-32">
              {JSON.stringify(approval?.data, null, 2)}
            </pre>
          </div>
          <div className="space-y-2">
            <Label>Modifications (JSON)</Label>
            <Textarea
              value={modifications}
              onChange={(e) => setModifications(e.target.value)}
              placeholder='{"key": "new value"}'
              rows={4}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={modifyMutation.isPending}>
            {modifyMutation.isPending ? 'Applying...' : 'Apply & Approve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
