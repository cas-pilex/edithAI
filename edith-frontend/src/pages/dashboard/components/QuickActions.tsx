import { Plus, Mail, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" className="gap-2">
        <Plus className="h-4 w-4" /> New Task
      </Button>
      <Button size="sm" variant="outline" className="gap-2">
        <Mail className="h-4 w-4" /> Compose Email
      </Button>
      <Button size="sm" variant="outline" className="gap-2">
        <CalendarPlus className="h-4 w-4" /> Schedule Meeting
      </Button>
    </div>
  );
}
