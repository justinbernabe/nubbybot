import { usePolling } from '@/hooks/usePolling';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function SettingsPage() {
  const { data, loading } = usePolling(() => api.fetchSettings(), 60000);

  return (
    <div>
      <h1 className="mb-1.5 text-2xl font-bold tracking-tight">Settings</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Current configuration (read-only, set via environment variables).
      </p>
      <Card className="shadow-sm">
        <div className="p-6">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {Object.entries(data?.settings ?? {}).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <span className="font-mono text-sm font-semibold">{key}</span>
                  <span className="text-sm text-muted-foreground">{val}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
