import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { fadeIn } from '@/lib/animations';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useContacts } from '@/hooks/queries/use-crm';
import { ContactList } from './components/ContactList';
import { ContactDetail } from './components/ContactDetail';
import { ContactCreateDialog } from './components/ContactCreateDialog';
import { ContactFilters } from './components/ContactFilters';
import type { ContactFilters as ContactFiltersType } from '@/lib/api/crm';

export function CRMPage() {
  const [filters, setFilters] = useState<ContactFiltersType>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading } = useContacts(filters);
  const contacts = data?.data || [];

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] gap-4">
        <Skeleton className="h-full flex-1 rounded-lg" />
        <Skeleton className="h-full w-96 rounded-lg" />
      </div>
    );
  }

  return (
    <motion.div variants={fadeIn} initial="hidden" animate="visible" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">CRM</h2>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add Contact
        </Button>
      </div>
      <ContactFilters filters={filters} onChange={setFilters} />
      <div className="flex gap-4" style={{ height: 'calc(100vh - 14rem)' }}>
        <ContactList contacts={contacts} selectedId={selectedId} onSelect={setSelectedId} />
        <ContactDetail contactId={selectedId} onClose={() => setSelectedId(null)} />
      </div>
      <ContactCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </motion.div>
  );
}
