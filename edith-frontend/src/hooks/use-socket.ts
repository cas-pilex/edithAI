import { useEffect } from 'react';
import { socketManager } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth.store';

export function useSocket() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      const token = localStorage.getItem('access_token');
      if (token) {
        socketManager.connect(token);
      }
    } else {
      socketManager.disconnect();
    }

    return () => {
      socketManager.disconnect();
    };
  }, [isAuthenticated]);

  return socketManager;
}
