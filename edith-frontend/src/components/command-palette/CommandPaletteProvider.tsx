import { useEffect } from 'react';
import { useCommandPaletteStore } from '@/stores/command-palette.store';
import { CommandPalette } from './CommandPalette';

export function CommandPaletteProvider() {
  const toggle = useCommandPaletteStore((s) => s.toggle);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  return <CommandPalette />;
}
