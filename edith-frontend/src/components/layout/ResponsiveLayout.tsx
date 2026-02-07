import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileNav } from './MobileNav';
import { useIsMobile } from '@/hooks/use-media-query';
import { useState } from 'react';

export function ResponsiveLayout() {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col bg-background pb-16">
        <TopBar />
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
