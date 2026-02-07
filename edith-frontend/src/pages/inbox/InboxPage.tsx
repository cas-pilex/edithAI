import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { fadeIn } from '@/lib/animations';
import { useEmails } from '@/hooks/queries/use-inbox';
import { useMarkAsRead } from '@/hooks/mutations/use-inbox-mutations';
import { Skeleton } from '@/components/ui/skeleton';
import { InboxSidebar } from './components/InboxSidebar';
import { EmailList } from './components/EmailList';
import { EmailDetail } from './components/EmailDetail';
import { BulkActionBar } from './components/BulkActionBar';
import type { EmailFilters } from '@/lib/api/inbox';

export function InboxPage() {
  const [filters, setFilters] = useState<EmailFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { data, isLoading } = useEmails(filters);
  const markAsRead = useMarkAsRead();
  const emails = data?.data || [];

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    markAsRead.mutate(id);
  }, [markAsRead]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] gap-4">
        <Skeleton className="h-full w-48 rounded-lg" />
        <Skeleton className="h-full flex-1 rounded-lg" />
      </div>
    );
  }

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="flex h-[calc(100vh-8rem)] gap-4">
      <InboxSidebar filters={filters} onChange={setFilters} />
      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border">
        {selectedIds.length > 0 && (
          <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds([])} />
        )}
        <div className="flex flex-1 overflow-hidden">
          <EmailList
            emails={emails}
            selectedId={selectedId}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onToggleSelect={handleToggleSelect}
          />
          <EmailDetail emailId={selectedId} onClose={() => setSelectedId(null)} />
        </div>
      </div>
    </motion.div>
  );
}
