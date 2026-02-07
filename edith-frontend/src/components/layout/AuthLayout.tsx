import { Outlet, Navigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

export function AuthLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Branding */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Edith.ai</h1>
          <p className="text-sm text-muted-foreground">Your AI-powered executive assistant</p>
        </div>

        {/* Auth form */}
        <Outlet />
      </div>
    </div>
  );
}
