import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Inbox, CheckSquare, CalendarDays, Users,
  Receipt, Plane, Settings, Plus, Search,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useCommandPaletteStore } from '@/stores/command-palette.store';

const pages = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { name: 'Inbox', icon: Inbox, path: '/inbox' },
  { name: 'Tasks', icon: CheckSquare, path: '/tasks' },
  { name: 'Calendar', icon: CalendarDays, path: '/calendar' },
  { name: 'CRM', icon: Users, path: '/crm' },
  { name: 'Expenses', icon: Receipt, path: '/expenses' },
  { name: 'Travel', icon: Plane, path: '/travel' },
  { name: 'Settings', icon: Settings, path: '/settings' },
];

const actions = [
  { name: 'New Task', icon: Plus, action: 'new-task' },
  { name: 'New Event', icon: Plus, action: 'new-event' },
  { name: 'New Contact', icon: Plus, action: 'new-contact' },
  { name: 'Search Emails', icon: Search, action: 'search-emails' },
];

export function CommandPalette() {
  const { isOpen, close } = useCommandPaletteStore();
  const navigate = useNavigate();

  const handleSelect = (path: string) => {
    navigate(path);
    close();
  };

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {pages.map((page) => (
            <CommandItem key={page.path} onSelect={() => handleSelect(page.path)}>
              <page.icon className="mr-2 h-4 w-4" />
              {page.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          {actions.map((action) => (
            <CommandItem key={action.action} onSelect={() => close()}>
              <action.icon className="mr-2 h-4 w-4" />
              {action.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
