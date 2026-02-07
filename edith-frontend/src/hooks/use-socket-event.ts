import { useEffect } from 'react';
import { socketManager } from '@/lib/socket';

export function useSocketEvent(event: string, callback: (...args: unknown[]) => void) {
  useEffect(() => {
    socketManager.on(event, callback);
    return () => {
      socketManager.off(event, callback);
    };
  }, [event, callback]);
}
