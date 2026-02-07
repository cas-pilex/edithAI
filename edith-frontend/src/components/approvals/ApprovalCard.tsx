import { Check, X, Edit } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApproveAction, useRejectAction } from '@/hooks/mutations/use-approval-mutations';
import { formatRelativeTime } from '@/lib/utils';
import type { Approval } from '@/types';

interface ApprovalCardProps {
  approval: Approval;
  onModify?: (approval: Approval) => void;
}

export function ApprovalCard({ approval, onModify }: ApprovalCardProps) {
  const approveMutation = useApproveAction();
  const rejectMutation = useRejectAction();

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">{approval.agentType}</Badge>
              <span className="text-xs text-muted-foreground">{formatRelativeTime(approval.createdAt)}</span>
            </div>
            <p className="mt-2 text-sm">{approval.description}</p>
            <div className="mt-2 space-y-1">
              <div className="h-1.5 w-full max-w-[200px] rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(approval.confidence * 100).toFixed(0)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">{(approval.confidence * 100).toFixed(0)}% confidence</p>
            </div>
          </div>
          <div className="flex gap-1">
            {onModify && (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onModify(approval)}>
                <Edit className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-green-500 hover:text-green-400"
              onClick={() => approveMutation.mutate(approval.id)}
              disabled={approveMutation.isPending}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:text-red-400"
              onClick={() => rejectMutation.mutate({ id: approval.id })}
              disabled={rejectMutation.isPending}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
