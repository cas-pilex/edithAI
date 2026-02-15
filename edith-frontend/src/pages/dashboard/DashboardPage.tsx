import { motion } from 'framer-motion';
import { staggerContainer, staggerItem } from '@/lib/animations';
import { useDashboard } from '@/hooks/queries/use-dashboard';
import { StatsGrid } from './components/StatsGrid';
import { ActivityFeed } from './components/ActivityFeed';
import { PriorityInbox } from './components/PriorityInbox';
import { DailyBriefing } from './components/DailyBriefing';
import { UpcomingEvents } from './components/UpcomingEvents';
import { PendingApprovals } from './components/PendingApprovals';
import { ProductivityChart } from './components/ProductivityChart';
import { QuickActions } from './components/QuickActions';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardPage() {
  const { data, isLoading } = useDashboard();
  const dashboard = data?.data;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-80 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={staggerItem}>
        <QuickActions />
      </motion.div>

      <motion.div variants={staggerItem}>
        <StatsGrid stats={dashboard?.stats} />
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div variants={staggerItem} className="space-y-6">
          <DailyBriefing />
          <ActivityFeed activities={dashboard?.recentActivity} />
          <PriorityInbox emails={dashboard?.priorityEmails} />
        </motion.div>
        <motion.div variants={staggerItem} className="space-y-6">
          <UpcomingEvents events={dashboard?.upcomingEvents} />
          <PendingApprovals approvals={dashboard?.pendingApprovals} />
          <ProductivityChart data={dashboard?.productivity} />
        </motion.div>
      </div>
    </motion.div>
  );
}
