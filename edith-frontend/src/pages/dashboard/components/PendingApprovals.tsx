import { ShieldCheck, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Approval } from '@/types';

interface PendingApprovalsProps {
  approvals?: Approval[];
}

export function PendingApprovals({ approvals }: PendingApprovalsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pending Approvals</CardTitle>
      </CardHeader>
      <CardContent>
        {!approvals?.length ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No pending approvals</p>
          </div>
        ) : (
          <div className="space-y-3">
            {approvals.slice(0, 5).map((approval) => (
              <div key={approval.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{approval.agentType}</Badge>
                    </div>
                    <p className="mt-1 text-sm">{approval.description}</p>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(approval.confidence * 100).toFixed(0)}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {(approval.confidence * 100).toFixed(0)}% confidence
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-green-500 hover:text-green-400">
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-red-400">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
