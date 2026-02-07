import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ExpenseFilters as ExpenseFiltersType } from '@/lib/api/expenses';

interface ExpenseFiltersProps {
  filters: ExpenseFiltersType;
  onChange: (filters: ExpenseFiltersType) => void;
}

export function ExpenseFilters({ filters, onChange }: ExpenseFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search expenses..."
          value={filters.search || ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
          className="pl-9"
        />
      </div>
      <Select
        value={filters.category || 'all'}
        onValueChange={(v) => onChange({ ...filters, category: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          <SelectItem value="FOOD">Food</SelectItem>
          <SelectItem value="TRANSPORT">Transport</SelectItem>
          <SelectItem value="ACCOMMODATION">Accommodation</SelectItem>
          <SelectItem value="ENTERTAINMENT">Entertainment</SelectItem>
          <SelectItem value="OFFICE">Office</SelectItem>
          <SelectItem value="SOFTWARE">Software</SelectItem>
          <SelectItem value="OTHER">Other</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filters.status || 'all'}
        onValueChange={(v) => onChange({ ...filters, status: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="APPROVED">Approved</SelectItem>
          <SelectItem value="REJECTED">Rejected</SelectItem>
          <SelectItem value="REIMBURSED">Reimbursed</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
