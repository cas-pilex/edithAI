import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChatStore } from '@/stores/chat.store';
import { chatApi } from '@/lib/api/chat';

export function ChatInput() {
  const [input, setInput] = useState('');
  const { addMessage, sessionId, setSessionId, isStreaming, setStreaming } = useChatStore();

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    addMessage(userMessage);
    setInput('');
    setStreaming(true);

    try {
      const response = await chatApi.sendMessage({
        message: userMessage.content,
        sessionId: sessionId || undefined,
      });

      const assistantMessage = response.data;
      addMessage(assistantMessage);

      if (!sessionId && assistantMessage.id) {
        setSessionId(assistantMessage.id);
      }
    } catch {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex gap-2 border-t border-border pt-3">
      <Input
        placeholder="Ask Edith..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isStreaming}
      />
      <Button size="icon" onClick={handleSend} disabled={!input.trim() || isStreaming}>
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
