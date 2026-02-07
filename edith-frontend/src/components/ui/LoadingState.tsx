import { Skeleton } from '@/components/ui/skeleton';

interface LoadingStateProps {
  count?: number;
  variant?: 'card' | 'list' | 'page';
}

export function LoadingState({ count = 3, variant = 'list' }: LoadingStateProps) {
  if (variant === 'card') {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-lg" />
        ))}
      </div>
    );
  }

  if (variant === 'page') {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 rounded" />
        <div className="space-y-3">
          {Array.from({ length: count }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-14 rounded-lg" />
      ))}
    </div>
  );
}
