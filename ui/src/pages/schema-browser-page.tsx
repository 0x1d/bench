import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { fetchSchemaContent, fetchSchemaList } from '@/services/api';
import { NotConfiguredCard } from '@/components/not-configured-card';
import { detectSchemaType, parseSchema } from '@/lib/schema-registry';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function SchemaBrowserPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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
          description="Add schemas in the Resources config page."
        />
      </div>
    );
  }

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
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
          Schemas
        </button>
        {selected && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="rounded px-2 py-1 font-mono">{selected.label || selected.id}</span>
          </>
        )}
      </nav>

      {!selectedId && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <div className="relative flex-1 min-w-0 sm:max-w-xs">
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
      )}

      {!selectedId ? (
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
                  className="cursor-pointer border-b border-border/50 last:border-b-0 hover:bg-accent/30"
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
      ) : (
        <div className="min-h-0 flex-1 space-y-4">
          {contentLoading && <p className="text-muted-foreground">Loading schema content...</p>}
          {contentError && (
            <p className="text-destructive">
              {contentError instanceof Error ? contentError.message : 'Failed to load content'}
            </p>
          )}
          {content != null && parsed && (
            <div className="rounded-lg border border-border bg-card p-4 text-sm">
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
  );
}
