import { useEffect } from 'react';

interface ShortcutOptions {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  handler: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcut({ key, ctrl, meta, shift, handler, enabled = true }: ShortcutOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (ctrl && !e.ctrlKey) return;
      if (meta && !e.metaKey) return;
      if (shift && !e.shiftKey) return;
      if (e.key.toLowerCase() !== key.toLowerCase()) return;

      e.preventDefault();
      handler();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [key, ctrl, meta, shift, handler, enabled]);
}
