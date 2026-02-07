import { useNavigate } from 'react-router-dom';
import { useCommandPaletteStore } from '@/stores/command-palette.store';
import { useChatStore } from '@/stores/chat.store';
import { useKeyboardShortcut } from './use-keyboard-shortcut';

export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const togglePalette = useCommandPaletteStore((s) => s.toggle);
  const toggleChat = useChatStore((s) => s.toggle);

  useKeyboardShortcut({ key: 'k', ctrl: true, handler: togglePalette });
  useKeyboardShortcut({ key: 'k', meta: true, handler: togglePalette });
  useKeyboardShortcut({ key: '.', ctrl: true, handler: toggleChat });

  // g then d = dashboard, g then i = inbox, etc. (simplified: just ctrl+number)
  useKeyboardShortcut({ key: '1', ctrl: true, handler: () => navigate('/dashboard') });
  useKeyboardShortcut({ key: '2', ctrl: true, handler: () => navigate('/inbox') });
  useKeyboardShortcut({ key: '3', ctrl: true, handler: () => navigate('/tasks') });
  useKeyboardShortcut({ key: '4', ctrl: true, handler: () => navigate('/calendar') });
}
