import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHealth } from '@/hooks/use-health';
import { useStatus } from '@/hooks/use-status';

export function StatusPage() {
  const { data, error, loading, refetch } = useHealth();
  const {
    data: statusData,
    error: statusError,
    loading: statusLoading,
    refetch: refetchStatus,
  } = useStatus();
  const apiBaseUrl = '/api';

  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
      <div className="bg-background/90 text-card-foreground border rounded-xl p-6 relative">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-medium tracking-tight">API Status</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Current backend availability and version metadata.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={refetch}
            disabled={loading}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Refresh API status"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

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
          <dt className="text-muted-foreground">API base URL</dt>
          <dd className="break-all">{apiBaseUrl}</dd>
        </dl>
      </div>

      <div className="bg-background/90 text-card-foreground border rounded-xl p-6 relative">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-medium tracking-tight">Filesystem</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Configured filesystem roots for file browsing.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={refetchStatus}
            disabled={statusLoading}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Refresh filesystem status"
          >
            <RefreshCw
              className={`size-4 ${statusLoading ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>

        {statusLoading && <p className="text-muted-foreground mt-3">Loading...</p>}

        {statusError && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(248,113,113,0.5)]" />
              <span>Unavailable</span>
            </div>
            <p className="text-sm text-red-500">{statusError}</p>
          </div>
        )}

        {statusData && (
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full shadow-[0_0_6px_rgba(74,222,128,0.5)] ${
                  statusData.filesystem.configured
                    ? 'bg-green-500'
                    : 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]'
                }`}
              />
              <span>
                {statusData.filesystem.configured ? 'Configured' : 'Not configured'}
              </span>
            </div>
            {statusData.filesystem.configured && (
              <ul className="mt-3 space-y-2 text-sm">
                {statusData.filesystem.paths.map((p) => (
                  <li key={p.id} className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">
                      {p.label}
                      <span className="text-muted-foreground font-normal">
                        {' '}
                        ({p.id})
                      </span>
                    </span>
                    <code className="text-muted-foreground break-all text-xs">
                      {p.path}
                    </code>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
