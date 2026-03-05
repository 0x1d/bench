import { useRef, useState } from 'react';
import { FilePlus, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfigEditorSheet } from '@/components/config-editor-sheet';
import { useHealth } from '@/hooks/use-health';
import { useStatus } from '@/hooks/use-status';
import { uploadConfig } from '@/services/api';

type AggregateStatus = 'healthy' | 'degraded' | 'unhealthy' | 'not-configured';

function getAggregateStatus(items: {
  enabled: boolean;
  available: boolean;
}[]): AggregateStatus {
  const enabledItems = items.filter((item) => item.enabled);
  if (enabledItems.length === 0) return 'not-configured';

  const availableCount = enabledItems.filter((item) => item.available).length;
  if (availableCount === enabledItems.length) return 'healthy';
  if (availableCount > 0) return 'degraded';
  return 'unhealthy';
}

function aggregateStatusPresentation(status: AggregateStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'healthy':
      return {
        label: 'Healthy',
        className: 'bg-green-500 shadow-[0_0_6px_rgba(74,222,128,0.5)]',
      };
    case 'degraded':
      return {
        label: 'Degraded',
        className: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]',
      };
    case 'unhealthy':
      return {
        label: 'Unhealthy',
        className: 'bg-red-500 shadow-[0_0_6px_rgba(248,113,113,0.5)]',
      };
    default:
      return {
        label: 'Not configured',
        className: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]',
      };
  }
}

export function StatusPage() {
  const { data, error, loading, refetch } = useHealth();
  const {
    data: statusData,
    error: statusError,
    loading: statusLoading,
    refetch: refetchStatus,
  } = useStatus();
  const apiBaseUrl = '/api';

  const configInputRef = useRef<HTMLInputElement>(null);
  const [configUploading, setConfigUploading] = useState(false);
  const [configUploadError, setConfigUploadError] = useState<string | null>(null);
  const [configEditorOpen, setConfigEditorOpen] = useState(false);
  const databaseStates = statusData?.database?.databases ?? [];
  const dbAggregate = aggregateStatusPresentation(
    getAggregateStatus(
      databaseStates.map((db) => ({
        enabled: db.enabled,
        available: db.connected,
      }))
    )
  );
  const filesystemStates = statusData?.filesystem?.paths ?? [];
  const filesystemAggregate = aggregateStatusPresentation(
    getAggregateStatus(
      filesystemStates.map((path) => ({
        enabled: true,
        available: path.available === true,
      }))
    )
  );

  const handleConfigUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setConfigUploadError(null);
    setConfigUploading(true);
    try {
      await uploadConfig(file);
      await refetchStatus();
    } catch (err) {
      setConfigUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setConfigUploading(false);
    }
  };

  return (
    <div className="w-full grid gap-6 max-w-6xl" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
      <div className="bg-background/90 text-card-foreground border rounded-xl p-6 relative">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-medium tracking-tight">API Status</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Backend availability.
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
              <span>Healthy</span>
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
            <h2 className="text-lg font-medium tracking-tight">Database</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              PostgreSQL connection status.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={refetchStatus}
            disabled={statusLoading}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Refresh database status"
          >
            <RefreshCw
              className={`size-4 ${statusLoading ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>

        {statusLoading && <p className="text-muted-foreground mt-3">Loading...</p>}

        {statusData && (
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${dbAggregate.className}`}
              />
              <span>{dbAggregate.label}</span>
            </div>
            {dbAggregate.label === 'Not configured' && (
              <p className="mt-2 text-sm text-muted-foreground">
                Configure databases in <code className="rounded bg-muted px-1">resources.databases</code> in
                <code className="rounded bg-muted px-1"> config.yaml </code> (you can use env placeholders like
                <code className="rounded bg-muted px-1"> ${'{BENCH_DB_MAIN_URL}'} </code>).
              </p>
            )}
            {(statusData.database?.databases?.length ?? 0) > 0 && (
              <ul className="mt-3 space-y-2 text-sm">
                {statusData.database?.databases?.map((db) => (
                  <li key={db.id} className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          !db.enabled
                            ? 'bg-zinc-400'
                            : db.connected
                              ? 'bg-green-500'
                              : 'bg-red-500'
                        }`}
                      />
                      <span>
                        {db.label}
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          ({db.id})
                          {db.isDefault ? ' • default' : ''}
                        </span>
                      </span>
                    </span>
                    <span className="pl-4 text-xs text-muted-foreground">
                      {!db.enabled ? 'Disabled' : db.connected ? 'Connected' : db.error || 'Unhealthy'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="bg-background/90 text-card-foreground border rounded-xl p-6 relative">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-medium tracking-tight">Flows</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Flow pipelines and Flowpipe server status.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={refetchStatus}
            disabled={statusLoading}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Refresh flows status"
          >
            <RefreshCw
              className={`size-4 ${statusLoading ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>

        {statusLoading && <p className="text-muted-foreground mt-3">Loading...</p>}

        {statusData && (
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  statusData.flows?.flowpipeHealthy
                    ? 'bg-green-500 shadow-[0_0_6px_rgba(74,222,128,0.5)]'
                    : 'bg-red-500 shadow-[0_0_6px_rgba(248,113,113,0.5)]'
                }`}
              />
              <span>
                {statusData.flows?.flowpipeHealthy ? 'Healthy' : 'Unhealthy'}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Flows</dt>
              <dd>
                {statusData.flows?.configured
                  ? `${statusData.flows.count} flow${statusData.flows.count === 1 ? '' : 's'}`
                  : 'Not configured'}
              </dd>
            </dl>
            {!statusData.flows?.configured && (
              <p className="mt-2 text-sm text-muted-foreground">
                Configure flows in the Resources config page.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="bg-background/90 text-card-foreground border rounded-xl p-6 relative">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-medium tracking-tight">REST</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Configured REST API endpoints.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={refetchStatus}
            disabled={statusLoading}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Refresh REST status"
          >
            <RefreshCw
              className={`size-4 ${statusLoading ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>

        {statusLoading && <p className="text-muted-foreground mt-3">Loading...</p>}

        {statusData && (
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  statusData.rest?.configured
                    ? 'bg-green-500 shadow-[0_0_6px_rgba(74,222,128,0.5)]'
                    : 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]'
                }`}
              />
              <span>
                {statusData.rest?.configured
                  ? `${statusData.rest.count} configured`
                  : 'Not configured'}
              </span>
            </div>
            {!statusData.rest?.configured && (
              <p className="mt-2 text-sm text-muted-foreground">
                Add REST resources in the Resources config page.
              </p>
            )}
          </div>
        )}
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
                className={`h-2.5 w-2.5 rounded-full ${filesystemAggregate.className}`}
              />
              <span>{filesystemAggregate.label}</span>
            </div>
            {statusData.filesystem.configured ? (
              <ul className="mt-3 space-y-2 text-sm">
                {statusData.filesystem.paths.map((p) => (
                  <li key={p.id} className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          p.available === true ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      />
                      <span>
                        {p.label}
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          ({p.id})
                        </span>
                      </span>
                    </span>
                    <code className="pl-4 text-muted-foreground break-all text-xs">{p.path}</code>
                    {p.available !== true && (
                      <span className="pl-4 text-xs text-muted-foreground">
                        {p.error || 'Unhealthy'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Upload a config.yaml or create one from the example template.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfigEditorOpen(true)}
                    className="gap-2"
                  >
                    <FilePlus className="size-4" />
                    Create config.yaml
                  </Button>
                  <input
                    ref={configInputRef}
                    type="file"
                    accept=".yaml,.yml"
                    className="hidden"
                    onChange={handleConfigUpload}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => configInputRef.current?.click()}
                    disabled={configUploading}
                    className="gap-2"
                  >
                    <Upload className="size-4" />
                    {configUploading ? 'Uploading...' : 'Upload config.yaml'}
                  </Button>
                </div>
                {configUploadError && (
                  <p className="text-sm text-red-500">{configUploadError}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfigEditorSheet
        open={configEditorOpen}
        onOpenChange={setConfigEditorOpen}
        onSaved={refetchStatus}
      />
    </div>
  );
}
