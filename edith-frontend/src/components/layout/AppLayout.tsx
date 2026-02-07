import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileNav } from './MobileNav';
import { CommandPaletteProvider } from '@/components/command-palette/CommandPaletteProvider';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Button } from '@/components/ui/button';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';
import { useSocket } from '@/hooks/use-socket';
import { useIsMobile } from '@/hooks/use-media-query';
import { useChatStore } from '@/stores/chat.store';

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isMobile = useIsMobile();
  const openChat = useChatStore((s) => s.open);

  useGlobalShortcuts();
  useSocket();

  if (isMobile) {
    return (
      <>
        <div className="flex min-h-screen flex-col bg-background pb-16">
          <TopBar />
          <main className="flex-1 overflow-auto p-4">
            <Outlet />
          </main>
          <MobileNav />
        </div>
        <CommandPaletteProvider />
        <ChatPanel />
        <Button
          size="icon"
          className="fixed bottom-20 right-4 z-40 h-12 w-12 rounded-full shadow-lg md:bottom-6"
          onClick={openChat}
        >
          <MessageCircle className="h-5 w-5" />
        </Button>
      </>
    );
  }

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
      <CommandPaletteProvider />
      <ChatPanel />
      <Button
        size="icon"
        className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg"
        onClick={openChat}
      >
        <MessageCircle className="h-5 w-5" />
      </Button>
    </>
  );
}
