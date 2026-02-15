import { useState } from 'react';
import { motion } from 'framer-motion';
import { ScrollText, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, Activity, Zap } from 'lucide-react';
import { fadeIn } from '@/lib/animations';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActivityLog, useActivityStats } from '@/hooks/queries/use-activity';
import type { ActivityLogEntry } from '@/lib/api/activity';

const AGENT_TYPES = [
  { value: 'all', label: 'All Agents' },
  { value: 'OrchestratorAgent', label: 'Orchestrator' },
  { value: 'InboxAgent', label: 'Inbox' },
  { value: 'CalendarAgent', label: 'Calendar' },
  { value: 'TaskAgent', label: 'Tasks' },
  { value: 'CRMAgent', label: 'CRM' },
  { value: 'TravelAgent', label: 'Travel' },
  { value: 'MeetingPrepAgent', label: 'Meeting Prep' },
  { value: 'TelegramBot', label: 'Telegram' },
  { value: 'INBOX_PROCESSORWorker', label: 'Email Processor' },
  { value: 'CALENDAR_OPTIMIZERWorker', label: 'Calendar Optimizer' },
  { value: 'MEETING_PREPWorker', label: 'Meeting Prep Job' },
  { value: 'EMAIL_DIGESTWorker', label: 'Email Digest' },
  { value: 'MORNING_BRIEFINGWorker', label: 'Morning Briefing' },
  { value: 'FOLLOW_UP_REMINDERWorker', label: 'Follow-up Reminder' },
  { value: 'WEEKLY_REPORTWorker', label: 'Weekly Report' },
  { value: 'SECURITY_AUDITWorker', label: 'Security Audit' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILURE', label: 'Failure' },
];

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function agentLabel(agentType: string): string {
  // Map worker names like "INBOX_PROCESSORWorker" to readable labels
  const match = AGENT_TYPES.find((t) => t.value === agentType);
  if (match) return match.label;
  // Fallback: strip Agent/Worker suffix and format
  return agentType
    .replace(/Worker$/, '')
    .replace(/Agent$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ActionRow({ entry }: { entry: ActivityLogEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="w-36 shrink-0 text-xs text-muted-foreground">{formatTimestamp(entry.executedAt)}</span>
        <Badge variant="outline" className="shrink-0">{agentLabel(entry.agentType)}</Badge>
        <span className="flex-1 truncate text-sm">{entry.action}</span>
        {entry.status === 'SUCCESS' ? (
          <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-destructive" />
        )}
        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">{formatDuration(entry.duration)}</span>
      </button>
      {expanded && (
        <div className="space-y-2 bg-accent/30 px-4 py-3 text-xs">
          {entry.input && (
            <div>
              <span className="font-medium text-muted-foreground">Input:</span>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-background p-2 text-xs">{JSON.stringify(entry.input, null, 2)}</pre>
            </div>
          )}
          {entry.output && (
            <div>
              <span className="font-medium text-muted-foreground">Output:</span>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-background p-2 text-xs">{JSON.stringify(entry.output, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ActivityLogPage() {
  const [page, setPage] = useState(1);
  const [agentType, setAgentType] = useState('all');
  const [status, setStatus] = useState('all');

  const filters = {
    agentType: agentType !== 'all' ? agentType : undefined,
    status: status !== 'all' ? status : undefined,
  };

  const { data: logData, isLoading: logLoading } = useActivityLog(filters, { page, limit: 20 });
  const { data: statsData, isLoading: statsLoading } = useActivityStats();

  const stats = statsData?.data;
  const actions = logData?.data ?? [];
  const pagination = logData?.pagination;
  const successRate = stats && stats.totalActions > 0
    ? ((stats.successfulActions / stats.totalActions) * 100).toFixed(1)
    : '0';

  if (logLoading && !logData) {
    return (
      <div className="space-y-4">
        <PageHeader title="Activity Log" description="AI agent execution history" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="space-y-6">
      <PageHeader
        title="Activity Log"
        description="Every action executed by AI agents"
        actions={
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-muted-foreground" />
          </div>
        }
      />

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{statsLoading ? '-' : stats?.totalActions ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Actions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <Activity className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{statsLoading ? '-' : `${successRate}%`}</p>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
              <Clock className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{statsLoading ? '-' : formatDuration(stats?.averageDuration ?? null)}</p>
              <p className="text-xs text-muted-foreground">Avg Duration</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={agentType} onValueChange={(v) => { setAgentType(v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            {AGENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Action list */}
      <Card>
        <CardContent className="p-0">
          {actions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ScrollText className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">No actions recorded yet</p>
              <p className="text-xs">AI agent actions will appear here as they execute.</p>
            </div>
          ) : (
            actions.map((entry) => <ActionRow key={entry.id} entry={entry} />)
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} actions)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
