import { Button } from '@/components/ui/button';
import { useHealth } from '@/hooks/use-health';

export function StatusPage() {
  const { data, error, loading, refetch } = useHealth();
  const proxyTarget = import.meta.env.VITE_PROXY_TARGET || 'http://localhost:8080';

  return (
    <div className="w-full">
      <div className="bg-background/90 text-card-foreground border rounded-xl p-6 max-w-xl">
        <h2 className="text-lg font-medium tracking-tight">API Status</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Current backend availability and version metadata.
        </p>

        {loading && <p className="text-muted-foreground mt-3">Checking...</p>}

        {error && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(248,113,113,0.5)]" />
              <span>Offline</span>
            </div>
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {data && (
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_6px_rgba(74,222,128,0.5)]" />
              <span>Online</span>
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd>{data.status}</dd>
              <dt className="text-muted-foreground">Version</dt>
              <dd>{data.version}</dd>
            </dl>
          </div>
        )}

        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Proxy target</dt>
          <dd className="break-all">{proxyTarget}</dd>
        </dl>

        <Button className="mt-5" onClick={refetch} disabled={loading}>
          {loading ? 'Checking...' : 'Refresh'}
        </Button>
      </div>
    </div>
  );
}
