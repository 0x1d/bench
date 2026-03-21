import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { fetchSchemaContent, fetchSchemaList } from '@/services/api';
import { NotConfiguredCard } from '@/components/not-configured-card';
import { detectSchemaType, parseSchema } from '@/lib/schema-registry';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CLOSE_PANEL_EVENT = 'bench:close-panel';

export function SchemaBrowserPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const onClose = () => setSelectedId(null);
    window.addEventListener(CLOSE_PANEL_EVENT, onClose);
    return () => window.removeEventListener(CLOSE_PANEL_EVENT, onClose);
  }, []);

  const { data: listData, isLoading: listLoading, error: listError } = useQuery({
    queryKey: ['schemas', 'list'],
    queryFn: () => fetchSchemaList(),
  });

  const searchLower = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const schemas = listData?.schemas ?? [];
    if (!searchLower) return schemas;
    return schemas.filter(
      (s) =>
        s.id.toLowerCase().includes(searchLower) ||
        (s.label || '').toLowerCase().includes(searchLower) ||
        s.type.toLowerCase().includes(searchLower)
    );
  }, [listData, searchLower]);

  const schemas = listData?.schemas ?? [];
  const selected = selectedId ? schemas.find((s) => s.id === selectedId) : null;
  const panelOpen = selectedId != null;

  const { data: content, isLoading: contentLoading, error: contentError } = useQuery({
    queryKey: ['schemas', 'content', selectedId ?? ''],
    queryFn: () => fetchSchemaContent(selectedId!),
    enabled: !!selectedId,
  });

  const parsed = useMemo(() => {
    if (!selected || content == null) return null;
    const detected = detectSchemaType(content);
    const kind =
      selected.type === 'openapi' ||
      selected.type === 'asyncapi' ||
      selected.type === 'json-schema'
        ? selected.type
        : detected !== 'unknown'
          ? detected
          : 'openapi';
    return parseSchema(content, kind);
  }, [selected, content]);

  if (listLoading) {
    return <p className="text-muted-foreground">Loading schemas...</p>;
  }

  if (listError) {
    return (
      <p className="text-destructive">
        {listError instanceof Error ? listError.message : 'Failed to load schemas'}
      </p>
    );
  }

  if (schemas.length === 0) {
    return (
      <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <span className="rounded px-2 py-1 text-muted-foreground">Schemas</span>
        </nav>
        <NotConfiguredCard
          title="No schemas registered"
          description="Add schemas on the Configuration page."
        />
      </div>
    );
  }

  const panelHeaderTitle = selected
    ? `Schema: ${selected.label?.trim() || selected.id}`
    : 'Schema';
  const panelHeaderSubtitle = selected ? `${selected.type} · ${selected.source.path}` : '';

  const panelInner = (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{panelHeaderTitle}</p>
          {panelHeaderSubtitle && (
            <p className="truncate text-xs text-muted-foreground">{panelHeaderSubtitle}</p>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={() => setSelectedId(null)} aria-label="Close panel">
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/20 p-3 font-mono text-xs sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">ID</span>
                <p className="break-all">{selected.id}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Label</span>
                <p>{selected.label?.trim() || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Type</span>
                <p>{selected.type}</p>
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Source path</span>
                <p className="break-all">{selected.source.path}</p>
              </div>
            </div>

            {contentLoading && <p className="text-muted-foreground">Loading schema content...</p>}
            {contentError && (
              <p className="text-destructive">
                {contentError instanceof Error ? contentError.message : 'Failed to load content'}
              </p>
            )}
            {content != null && parsed && (
              <div className="rounded-lg border border-border bg-card p-4">
                {parsed.type === 'openapi' && (
                  <div className="space-y-4">
                    {parsed.data.groups.map((g) => (
                      <div key={g.tag}>
                        <h3 className="mb-2 font-medium">{g.tag}</h3>
                        <ul className="space-y-1 font-mono text-xs">
                          {g.operations.map((op, i) => (
                            <li key={`${op.path}-${op.method}-${i}`}>
                              <span className="text-muted-foreground">{op.method}</span> {op.path}
                              {op.summary ? (
                                <span className="ml-2 text-muted-foreground">— {op.summary}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
                {parsed.type === 'asyncapi' && (
                  <div className="space-y-3">
                    <h3 className="font-medium">Channels</h3>
                    <ul className="space-y-2">
                      {parsed.data.operations.map((op, i) => (
                        <li key={`${op.channel}-${op.direction}-${i}`} className="font-mono text-xs">
                          <span className="text-muted-foreground">{op.direction}</span> {op.channel}
                          {op.summary ? (
                            <span className="ml-2 text-muted-foreground">— {op.summary}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {parsed.type === 'json-schema' && (
                  <div className="space-y-2">
                    {parsed.data.title && <p className="font-medium">{parsed.data.title}</p>}
                    <p className="text-muted-foreground">Properties</p>
                    <ul className="list-inside list-disc font-mono text-xs">
                      {parsed.data.properties
                        ? Object.keys(parsed.data.properties).map((k) => <li key={k}>{k}</li>)
                        : null}
                    </ul>
                  </div>
                )}
                {parsed.type === 'unknown' && (
                  <p className="text-muted-foreground">Could not parse this schema for preview.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex w-full min-h-0 flex-1 overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4 md:p-6">
        <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            <span className="rounded px-2 py-1 font-medium">Schemas</span>
          </nav>

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search schemas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium">ID</th>
                  <th className="px-4 py-3 text-left font-medium">Label</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Path</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className={cn(
                      'cursor-pointer border-b border-border/50 last:border-b-0 hover:bg-accent/30',
                      selectedId === s.id && 'bg-accent/50'
                    )}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <td className="px-4 py-2 font-mono">{s.id}</td>
                    <td className="px-4 py-2">{s.label || '—'}</td>
                    <td className="px-4 py-2 font-mono">{s.type}</td>
                    <td className="px-4 py-2 font-mono">{s.source.path}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'bg-sidebar text-sidebar-foreground fixed inset-x-0 bottom-0 top-[var(--header-height)] z-30 min-h-0 flex flex-col overflow-hidden border-l lg:hidden',
          panelOpen ? 'flex' : 'hidden'
        )}
      >
        {panelInner}
      </div>
      <div
        className={cn(
          'bg-sidebar text-sidebar-foreground relative z-20 hidden min-h-0 flex flex-col overflow-hidden border-l lg:flex',
          panelOpen ? 'lg:flex' : 'lg:hidden',
          'lg:w-[min(560px,50vw)]'
        )}
      >
        {panelInner}
      </div>
    </div>
  );
}
