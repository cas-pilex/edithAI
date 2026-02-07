import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { useChatStore } from '@/stores/chat.store';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

export function ChatPanel() {
  const { isOpen, close, messages, clearMessages } = useChatStore();

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="flex flex-row items-center justify-between">
          <SheetTitle>Chat with Edith</SheetTitle>
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" onClick={clearMessages} className="h-8 w-8">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </SheetHeader>
        <ScrollArea className="flex-1 pr-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center py-20">
              <p className="text-sm text-muted-foreground">Ask Edith anything...</p>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
            </div>
          )}
        </ScrollArea>
        <ChatInput />
      </SheetContent>
    </Sheet>
  );
}
