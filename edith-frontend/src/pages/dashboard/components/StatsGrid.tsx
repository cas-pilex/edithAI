import { Clock, Mail, Calendar, CheckSquare } from 'lucide-react';
import { StatCard } from './StatCard';
import type { DashboardData } from '@/types';

interface StatsGridProps {
  stats?: DashboardData['stats'];
}

export function StatsGrid({ stats }: StatsGridProps) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Time Saved"
        value={stats.timeSaved.value}
        unit={stats.timeSaved.unit}
        icon={Clock}
        trend={stats.timeSaved.trend}
      />
      <StatCard
        label="Emails Processed"
        value={stats.emailsProcessed.value}
        icon={Mail}
        trend={stats.emailsProcessed.trend}
      />
      <StatCard
        label="Meetings"
        value={stats.meetingsOptimized.value}
        icon={Calendar}
        trend={stats.meetingsOptimized.trend}
      />
      <StatCard
        label="Tasks Completed"
        value={stats.tasksCompleted.value}
        icon={CheckSquare}
        trend={stats.tasksCompleted.trend}
      />
    </div>
  );
}
