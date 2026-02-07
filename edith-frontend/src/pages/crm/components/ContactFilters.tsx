import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ContactFilters as ContactFiltersType } from '@/lib/api/crm';

interface ContactFiltersProps {
  filters: ContactFiltersType;
  onChange: (filters: ContactFiltersType) => void;
}

export function ContactFilters({ filters, onChange }: ContactFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search contacts..."
          value={filters.search || ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
          className="pl-9"
        />
      </div>
      <Select
        value={filters.relationship || 'all'}
        onValueChange={(v) => onChange({ ...filters, relationship: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="w-36"><SelectValue placeholder="Relationship" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="COLLEAGUE">Colleague</SelectItem>
          <SelectItem value="CLIENT">Client</SelectItem>
          <SelectItem value="VENDOR">Vendor</SelectItem>
          <SelectItem value="FRIEND">Friend</SelectItem>
          <SelectItem value="FAMILY">Family</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
