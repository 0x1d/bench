import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { fetchSchemaContent } from '@/services/api';
import { ContextPanel } from '@/components/context-panel';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { ResourceSettingsSidePanel, SchemaResourceFields } from '@/components/resource-config';
import { detectSchemaType, parseSchema } from '@/lib/schema-registry';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  parseConfigToState,
  useResourceConfig,
  type SchemaResourceEntry,
} from '@/lib/resource-config';
import { BENCH_CLOSE_PANEL_EVENT } from '@/lib/bench-close-panel';

const defaultSchemaDraft = (): SchemaResourceEntry => ({
  id: '',
  label: '',
  type: 'openapi',
  source: { path: '' },
});

export function SchemaBrowserPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: rawConfig, mergeAndPersist, isPending: configPending, error: configError } =
    useResourceConfig();
  const schemasFromConfig = useMemo(
    () => parseConfigToState(rawConfig ?? '').schemas,
    [rawConfig]
  );

  const [editingSchema, setEditingSchema] = useState<'add' | number | null>(null);
  const [schemaDraft, setSchemaDraft] = useState<SchemaResourceEntry>(defaultSchemaDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [savePending, setSavePending] = useState(false);

  useEffect(() => {
    const onClose = () => {
      setSelectedId(null);
      setEditingSchema(null);
      setFormError(null);
      setDeleteIndex(null);
    };
    window.addEventListener(BENCH_CLOSE_PANEL_EVENT, onClose);
    return () => window.removeEventListener(BENCH_CLOSE_PANEL_EVENT, onClose);
  }, []);

  const searchLower = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!searchLower) return schemasFromConfig;
    return schemasFromConfig.filter(
      (s) =>
        s.id.toLowerCase().includes(searchLower) ||
        (s.label || '').toLowerCase().includes(searchLower) ||
        s.type.toLowerCase().includes(searchLower) ||
        s.source.path.toLowerCase().includes(searchLower)
    );
  }, [schemasFromConfig, searchLower]);

  const selected = selectedId ? schemasFromConfig.find((s) => s.id === selectedId) : null;
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

  const openAddSchema = () => {
    setSelectedId(null);
    setSchemaDraft(defaultSchemaDraft());
    setFormError(null);
    setEditingSchema('add');
  };

  const openEditSchema = (index: number) => {
    setSelectedId(null);
    setSchemaDraft(schemasFromConfig[index]);
    setFormError(null);
    setEditingSchema(index);
  };

  const applySchemaDraft = async () => {
    const id = schemaDraft.id.trim();
    const path = schemaDraft.source.path.trim();
    if (id === '' || path === '') {
      setFormError('Schema ID and source path are required.');
      return;
    }

    const duplicate = schemasFromConfig.some(
      (entry, idx) => idx !== (editingSchema === 'add' ? -1 : editingSchema) && entry.id.trim() === id
    );
    if (duplicate) {
      setFormError(`Schema ID "${id}" already exists.`);
      return;
    }

    const nextEntry: SchemaResourceEntry = {
      id,
      label: schemaDraft.label.trim(),
      type: schemaDraft.type,
      source: { path },
    };

    setFormError(null);
    setSavePending(true);
    try {
      await mergeAndPersist((prev) => {
        if (editingSchema === 'add') {
          return { ...prev, schemas: [...prev.schemas, nextEntry] };
        }
        if (typeof editingSchema === 'number') {
          return {
            ...prev,
            schemas: prev.schemas.map((entry, idx) =>
              idx === editingSchema ? nextEntry : entry
            ),
          };
        }
        return prev;
      });
      setEditingSchema(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavePending(false);
    }
  };

  const confirmDeleteSchema = async () => {
    if (deleteIndex == null) return;
    const idx = deleteIndex;
    const removedId = schemasFromConfig[idx]?.id;
    setSavePending(true);
    try {
      await mergeAndPersist((prev) => ({
        ...prev,
        schemas: prev.schemas.filter((_, i) => i !== idx),
      }));
      setDeleteIndex(null);
      if (removedId && selectedId === removedId) {
        setSelectedId(null);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSavePending(false);
    }
  };

  const configErr =
    configError instanceof Error ? configError.message : configError ? String(configError) : null;

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

      <div className="min-h-0 min-w-0 w-full flex-1 overflow-auto p-4">
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
              <div className="p-4">
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
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-row items-stretch overflow-hidden">
      <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-4 overflow-auto px-4 md:px-6 pt-4 md:pt-6 pb-4 md:pb-6">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            <span className="rounded px-2 py-1 font-medium">Schemas</span>
          </nav>
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search registry..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search schemas"
            />
          </div>
          <Button variant="outline" size="sm" onClick={openAddSchema} className="shrink-0 gap-1.5">
            <Plus className="size-4" />
            Add schema
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Registry entries are stored in configuration. OpenAPI schemas can be referenced from{' '}
          <a href="#rest" className="font-medium text-primary underline">
            REST
          </a>{' '}
          resources.
        </p>

        {configPending && <p className="text-muted-foreground">Loading configuration...</p>}
        {configErr && <p className="text-sm text-destructive">{configErr}</p>}

        {!configPending && !configErr && schemasFromConfig.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <h2 className="text-lg font-medium">No schemas in registry</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Add a schema entry to register OpenAPI, AsyncAPI, or JSON Schema files.
            </p>
            <Button type="button" className="mt-4" onClick={openAddSchema}>
              Add schema
            </Button>
          </div>
        )}

        {!configPending && !configErr && schemasFromConfig.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">No schemas match your search.</p>
        )}

        {!configPending && !configErr && filtered.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium">ID</th>
                  <th className="px-4 py-3 text-left font-medium">Label</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Path</th>
                  <th className="w-28 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => {
                  const index = schemasFromConfig.findIndex((e) => e.id === entry.id);
                  return (
                    <tr
                      key={entry.id}
                      className={cn(
                        'cursor-pointer border-b border-border/50 last:border-b-0 hover:bg-accent/30',
                        selectedId === entry.id && 'bg-accent/50'
                      )}
                      onClick={() => setSelectedId(entry.id)}
                    >
                      <td className="px-4 py-2 font-mono">{entry.id}</td>
                      <td className="px-4 py-2">{entry.label || '—'}</td>
                      <td className="px-4 py-2 font-mono">{entry.type}</td>
                      <td className="max-w-[200px] truncate px-4 py-2 font-mono" title={entry.source.path}>
                        {entry.source.path}
                      </td>
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => index >= 0 && openEditSchema(index)}
                            aria-label={`Edit schema ${entry.id}`}
                          >
                            <Pencil className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => index >= 0 && setDeleteIndex(index)}
                            aria-label={`Remove schema ${entry.id}`}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ContextPanel
        expanded={panelOpen}
        storageKey="bench-schema-preview-panel-width"
        minWidth={280}
        maxWidth={800}
        defaultWidth={560}
        mobileVariant="below-header"
      >
        {panelInner}
      </ContextPanel>

      <ResourceSettingsSidePanel
        open={editingSchema !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingSchema(null);
            setFormError(null);
          }
        }}
        title={editingSchema === 'add' ? 'Add schema' : 'Edit schema'}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingSchema(null);
                setFormError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={applySchemaDraft} disabled={savePending}>
              {editingSchema === 'add' ? 'Add' : 'Save changes'}
            </Button>
          </div>
        }
      >
        <SchemaResourceFields draft={schemaDraft} onChange={setSchemaDraft} />
        {formError && <p className="mt-2 text-sm text-destructive">{formError}</p>}
      </ResourceSettingsSidePanel>

      <ConfirmDeleteDialog
        open={deleteIndex != null}
        onOpenChange={(open) => {
          if (!open) setDeleteIndex(null);
        }}
        title="Remove schema?"
        description={
          deleteIndex != null && schemasFromConfig[deleteIndex]
            ? `Remove "${schemasFromConfig[deleteIndex].id}" from configuration?`
            : 'Remove this schema?'
        }
        onConfirm={confirmDeleteSchema}
        isLoading={savePending}
      />
    </div>
  );
}
