import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Inbox, CheckSquare, CalendarDays, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { path: '/inbox', label: 'Inbox', icon: Inbox },
  { path: '/tasks', label: 'Tasks', icon: CheckSquare },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/settings', label: 'More', icon: Menu },
];

export function MobileNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background md:hidden">
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
