import { useState, useMemo } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchRestSpec } from '@/services/api';
import { ContextPanel } from '@/components/context-panel';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { RestClient } from '@/components/rest-client';
import { Input } from '@/components/ui/input';
import { RestResourceFields, ResourceSettingsSidePanel } from '@/components/resource-config';
import { cn } from '@/lib/utils';
import {
  parseConfigToState,
  useResourceConfig,
  type RestResource,
} from '@/lib/resource-config';

const defaultRestDraft = (): RestResource => ({
  id: '',
  label: '',
  baseUrl: '',
  schemaId: '',
  openapiSpec: '',
  auth: { type: 'none' },
});

export function RestPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: rawConfig, mergeAndPersist, isPending: configPending, error: configError } =
    useResourceConfig();
  const openapiSchemas = useMemo(
    () => parseConfigToState(rawConfig ?? '').schemas.filter((s) => s.type === 'openapi'),
    [rawConfig]
  );
  const restFromConfig = useMemo(() => parseConfigToState(rawConfig ?? '').rest, [rawConfig]);

  const [editingRest, setEditingRest] = useState<'add' | number | null>(null);
  const [restDraft, setRestDraft] = useState<RestResource>(defaultRestDraft());
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [savePending, setSavePending] = useState(false);

  const searchLower = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!searchLower) return restFromConfig;
    return restFromConfig.filter(
      (r) =>
        r.id.toLowerCase().includes(searchLower) ||
        (r.label || '').toLowerCase().includes(searchLower) ||
        (r.baseUrl || '').toLowerCase().includes(searchLower) ||
        (r.openapiSpec || '').toLowerCase().includes(searchLower) ||
        (r.schemaId || '').toLowerCase().includes(searchLower)
    );
  }, [restFromConfig, searchLower]);

  const selectedEntry = selectedId ? restFromConfig.find((r) => r.id === selectedId) : null;
  const panelOpen = selectedId != null;

  const { data: specData, isLoading: specLoading, error: specError } = useQuery({
    queryKey: ['rest', 'spec', selectedId ?? ''],
    queryFn: () => fetchRestSpec(selectedId!),
    enabled: !!selectedId,
  });

  const openAddRest = () => {
    setSelectedId(null);
    setRestDraft(defaultRestDraft());
    setFormError(null);
    setEditingRest('add');
  };

  const openEditRest = (index: number) => {
    setSelectedId(null);
    const entry = restFromConfig[index];
    setRestDraft({
      id: entry.id,
      label: entry.label,
      baseUrl: entry.baseUrl,
      schemaId: entry.schemaId ?? '',
      openapiSpec: entry.openapiSpec,
      auth: entry.auth ?? { type: 'none' },
    });
    setFormError(null);
    setEditingRest(index);
  };

  const applyRestDraft = async () => {
    const id = restDraft.id.trim();
    const baseUrl = restDraft.baseUrl.trim();
    if (id === '' || baseUrl === '') {
      setFormError('REST ID and base URL are required.');
      return;
    }

    const duplicate = restFromConfig.some(
      (entry, idx) => idx !== (editingRest === 'add' ? -1 : editingRest) && entry.id.trim() === id
    );
    if (duplicate) {
      setFormError(`REST ID "${id}" already exists.`);
      return;
    }

    const auth = restDraft.auth;
    if (auth?.type === 'basic' && (!auth.username?.trim() || !auth.password?.trim())) {
      setFormError('Username and password are required for basic auth.');
      return;
    }
    if (auth?.type === 'bearer' && !auth.token?.trim()) {
      setFormError('Token is required for bearer auth.');
      return;
    }
    if (auth?.type === 'apiKey' && (!auth.name?.trim() || !auth.value?.trim())) {
      setFormError('Name and value are required for API key auth.');
      return;
    }

    const nextEntry: RestResource = {
      id,
      label: restDraft.label.trim(),
      baseUrl,
      schemaId: restDraft.schemaId?.trim() || undefined,
      openapiSpec: restDraft.openapiSpec.trim(),
      auth: auth && auth.type !== 'none' ? auth : undefined,
    };

    setFormError(null);
    setSavePending(true);
    try {
      await mergeAndPersist((prev) => {
        if (editingRest === 'add') {
          return { ...prev, rest: [...prev.rest, nextEntry] };
        }
        if (typeof editingRest === 'number') {
          return {
            ...prev,
            rest: prev.rest.map((entry, idx) => (idx === editingRest ? nextEntry : entry)),
          };
        }
        return prev;
      });
      setEditingRest(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavePending(false);
    }
  };

  const confirmDeleteRest = async () => {
    if (deleteIndex == null) return;
    const idx = deleteIndex;
    const removedId = restFromConfig[idx]?.id;
    setSavePending(true);
    try {
      await mergeAndPersist((prev) => ({
        ...prev,
        rest: prev.rest.filter((_, i) => i !== idx),
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

  const previewTitle = selectedEntry
    ? selectedEntry.label?.trim() || selectedEntry.id
    : 'REST resource';

  const panelInner = (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{previewTitle}</p>
          {selectedEntry && (
            <p className="truncate text-xs text-muted-foreground">
              {selectedEntry.baseUrl}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={() => setSelectedId(null)} aria-label="Close panel">
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 min-w-0 w-full flex-1 overflow-auto p-4">
        {selectedId && (
          <>
            {specLoading && <p className="text-muted-foreground">Loading OpenAPI spec...</p>}
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
              <div className="min-h-0 min-w-0 w-full overflow-auto rounded-lg border border-border bg-card">
                <RestClient restId={selectedId} spec={specData} />
              </div>
            )}
            {!specLoading && !specData && !specError && (
              <p className="text-muted-foreground">No OpenAPI spec configured for this resource.</p>
            )}
          </>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-row items-stretch overflow-hidden">
      <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-4 overflow-auto px-4 md:px-6 pt-4 md:pt-6 pb-4 md:pb-6">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            <span className="rounded px-2 py-1 font-medium">REST</span>
          </nav>
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
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
          <Button variant="outline" size="sm" onClick={openAddRest} className="shrink-0 gap-1.5">
            <Plus className="size-4" />
            Add REST resource
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Register OpenAPI specs under{' '}
          <a href="#schemas" className="font-medium text-primary underline">
            Schemas
          </a>{' '}
          to reference them here. Select a row to try requests against the API.
        </p>

        {configPending && <p className="text-muted-foreground">Loading configuration...</p>}
        {configErr && <p className="text-sm text-destructive">{configErr}</p>}

        {!configPending && !configErr && restFromConfig.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <h2 className="text-lg font-medium">No REST resources configured</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Add a REST entry to set base URL, spec, and auth. You can also use the Configuration page.
            </p>
            <Button type="button" className="mt-4" onClick={openAddRest}>
              Add REST resource
            </Button>
          </div>
        )}

        {!configPending && !configErr && restFromConfig.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">No resources match your search.</p>
        )}

        {!configPending && !configErr && filtered.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium">ID</th>
                  <th className="px-4 py-3 text-left font-medium">Label</th>
                  <th className="px-4 py-3 text-left font-medium">Base URL</th>
                  <th className="px-4 py-3 text-left font-medium">Spec</th>
                  <th className="w-28 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => {
                  const index = restFromConfig.findIndex((e) => e.id === entry.id);
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
                      <td
                        className="max-w-[180px] truncate px-4 py-2 font-mono"
                        title={entry.baseUrl}
                      >
                        {entry.baseUrl}
                      </td>
                      <td
                        className="max-w-[140px] truncate px-4 py-2 font-mono text-muted-foreground"
                        title={entry.schemaId || entry.openapiSpec}
                      >
                        {entry.schemaId || entry.openapiSpec || '—'}
                      </td>
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => index >= 0 && openEditRest(index)}
                            aria-label={`Edit REST ${entry.id}`}
                          >
                            <Pencil className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => index >= 0 && setDeleteIndex(index)}
                            aria-label={`Remove REST ${entry.id}`}
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
        storageKey="bench-rest-preview-panel-width"
        minWidth={320}
        maxWidth={900}
        defaultWidth={560}
        mobileVariant="below-header"
      >
        {panelInner}
      </ContextPanel>

      <ResourceSettingsSidePanel
        open={editingRest !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRest(null);
            setFormError(null);
          }
        }}
        title={editingRest === 'add' ? 'Add REST resource' : 'Edit REST resource'}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingRest(null);
                setFormError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={applyRestDraft} disabled={savePending}>
              {editingRest === 'add' ? 'Add' : 'Save changes'}
            </Button>
          </div>
        }
      >
        <RestResourceFields
          draft={restDraft}
          onChange={setRestDraft}
          openapiSchemas={openapiSchemas}
        />
        {formError && <p className="mt-2 text-sm text-destructive">{formError}</p>}
      </ResourceSettingsSidePanel>

      <ConfirmDeleteDialog
        open={deleteIndex != null}
        onOpenChange={(open) => {
          if (!open) setDeleteIndex(null);
        }}
        title="Remove REST resource?"
        description={
          deleteIndex != null && restFromConfig[deleteIndex]
            ? `Remove "${restFromConfig[deleteIndex].id}" from configuration?`
            : 'Remove this resource?'
        }
        onConfirm={confirmDeleteRest}
        isLoading={savePending}
      />
    </div>
  );
}
