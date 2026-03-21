import { useState } from 'react';
import { Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchRestList, fetchRestSpec } from '@/services/api';
import { NotConfiguredCard } from '@/components/not-configured-card';
import { RestClient } from '@/components/rest-client';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function RestPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: listData, isLoading: listLoading, error: listError } = useQuery({
    queryKey: ['rest', 'list'],
    queryFn: () => fetchRestList(),
  });

  const resources = listData?.resources ?? [];
  const searchLower = search.trim().toLowerCase();
  const filteredResources = searchLower
    ? resources.filter(
        (r) =>
          r.id.toLowerCase().includes(searchLower) ||
          (r.label || '').toLowerCase().includes(searchLower) ||
          (r.baseUrl || '').toLowerCase().includes(searchLower) ||
          (r.openapiSpec || '').toLowerCase().includes(searchLower) ||
          (r.schemaId || '').toLowerCase().includes(searchLower)
      )
    : resources;

  const selectedResource = selectedId ? resources.find((r) => r.id === selectedId) : null;

  const { data: specData, isLoading: specLoading, error: specError } = useQuery({
    queryKey: ['rest', 'spec', selectedId ?? ''],
    queryFn: () => fetchRestSpec(selectedId!),
    enabled: !!selectedId,
  });

  if (listLoading) {
    return (
      <p className="text-muted-foreground">Loading REST resources...</p>
    );
  }

  if (listError) {
    return (
      <p className="text-destructive">
        {listError instanceof Error ? listError.message : 'Failed to load REST resources'}
      </p>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <span className="rounded px-2 py-1 text-muted-foreground">REST</span>
        </nav>
        <NotConfiguredCard
          title="No REST resources configured"
          description="Add REST API endpoints on the Configuration page."
        />
      </div>
    );
  }

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className={cn(
            'rounded px-2 py-1',
            selectedId
              ? 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              : 'font-medium'
          )}
        >
          REST
        </button>
        {selectedResource && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="rounded px-2 py-1 font-mono">
              {selectedResource.label || selectedResource.id}
            </span>
          </>
        )}
      </nav>

      {/* Toolbar (only when showing resource table) */}
      {!selectedId && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <div className="relative flex-1 min-w-0 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search resources..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search REST resources"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-auto">
        {!selectedId ? (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium">ID</th>
                  <th className="px-4 py-3 text-left font-medium">Label</th>
                  <th className="px-4 py-3 text-left font-medium">Base URL</th>
                  <th className="px-4 py-3 text-left font-medium">OpenAPI spec</th>
                </tr>
              </thead>
              <tbody>
                {filteredResources.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="border-b border-border/50 last:border-b-0 cursor-pointer transition-colors hover:bg-accent/30"
                  >
                    <td className="px-4 py-3 font-mono">{r.id}</td>
                    <td className="px-4 py-3">{r.label || '—'}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground truncate max-w-[200px]" title={r.baseUrl}>
                      {r.baseUrl || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground truncate max-w-[180px]" title={r.openapiSpec}>
                      {r.openapiSpec || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredResources.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No resources match your search.
              </p>
            )}
          </div>
        ) : (
          <>
            {specLoading && (
              <p className="text-muted-foreground">Loading OpenAPI spec...</p>
            )}
            {specError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <p className="text-sm text-destructive">
                  {specError instanceof Error ? specError.message : 'Failed to load spec'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ensure the OpenAPI spec path is configured and the file exists.
                </p>
              </div>
            )}
            {specData && !specError && (
              <div className="min-h-0 overflow-auto rounded-lg border border-border bg-card">
                <RestClient restId={selectedId} spec={specData} />
              </div>
            )}
            {selectedId && !specLoading && !specData && !specError && (
              <p className="text-muted-foreground">No OpenAPI spec configured for this resource.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
