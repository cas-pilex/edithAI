import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { AppRoutes } from '@/routes';

export function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">Loading Edith...</span>
        </div>
      </div>
    );
  }

  return <AppRoutes />;
}
