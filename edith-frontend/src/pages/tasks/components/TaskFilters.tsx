import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TaskFilters as TaskFiltersType } from '@/lib/api/tasks';

interface TaskFiltersProps {
  filters: TaskFiltersType;
  onChange: (filters: TaskFiltersType) => void;
}

export function TaskFilters({ filters, onChange }: TaskFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search tasks..."
          value={filters.search || ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
          className="pl-9"
        />
      </div>
      <Select
        value={filters.status || 'all'}
        onValueChange={(v) => onChange({ ...filters, status: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="TODO">To Do</SelectItem>
          <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
          <SelectItem value="COMPLETED">Completed</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filters.priority || 'all'}
        onValueChange={(v) => onChange({ ...filters, priority: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priority</SelectItem>
          <SelectItem value="URGENT">Urgent</SelectItem>
          <SelectItem value="HIGH">High</SelectItem>
          <SelectItem value="MEDIUM">Medium</SelectItem>
          <SelectItem value="LOW">Low</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
