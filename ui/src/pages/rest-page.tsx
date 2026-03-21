import { useState, useMemo } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchRestList, fetchRestSpec } from '@/services/api';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { RestClient } from '@/components/rest-client';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RestResourceFields } from '@/components/resource-config';
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
  const [pageTab, setPageTab] = useState<'browse' | 'settings'>('browse');
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
  const [restDraft, setRestDraft] = useState<RestResource>(defaultRestDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [savePending, setSavePending] = useState(false);

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
    enabled: !!selectedId && pageTab === 'browse',
  });

  const openAddRest = () => {
    setRestDraft(defaultRestDraft());
    setFormError(null);
    setEditingRest('add');
  };

  const openEditRest = (index: number) => {
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
    setSavePending(true);
    try {
      await mergeAndPersist((prev) => ({
        ...prev,
        rest: prev.rest.filter((_, i) => i !== idx),
      }));
      setDeleteIndex(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSavePending(false);
    }
  };

  const configErr =
    configError instanceof Error ? configError.message : configError ? String(configError) : null;

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
      <Tabs
        value={pageTab}
        onValueChange={(v) => setPageTab(v as 'browse' | 'settings')}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <TabsList variant="line" className="w-fit max-w-full shrink-0 justify-start gap-x-1">
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="mt-3 flex min-h-0 flex-1 flex-col gap-4">
          {listLoading && (
            <p className="text-muted-foreground">Loading REST resources...</p>
          )}
          {listError && (
            <p className="text-destructive">
              {listError instanceof Error ? listError.message : 'Failed to load REST resources'}
            </p>
          )}
          {!listLoading && !listError && resources.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <h2 className="text-lg font-medium">No REST resources configured</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Add REST API entries in Settings, or use the Configuration page for other resource
                types.
              </p>
              <Button type="button" className="mt-4" onClick={() => setPageTab('settings')}>
                Open Settings
              </Button>
            </div>
          )}
          {!listLoading && !listError && resources.length > 0 && (
            <>
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

              {!selectedId && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
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
                </div>
              )}

              <div className="min-w-0 flex-1 overflow-auto">
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
                            className="cursor-pointer border-b border-border/50 transition-colors last:border-b-0 hover:bg-accent/30"
                          >
                            <td className="px-4 py-3 font-mono">{r.id}</td>
                            <td className="px-4 py-3">{r.label || '—'}</td>
                            <td
                              className="max-w-[200px] truncate px-4 py-3 font-mono text-muted-foreground"
                              title={r.baseUrl}
                            >
                              {r.baseUrl || '—'}
                            </td>
                            <td
                              className="max-w-[180px] truncate px-4 py-3 font-mono text-muted-foreground"
                              title={r.openapiSpec}
                            >
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
            </>
          )}
        </TabsContent>

        <TabsContent
          value="settings"
          className="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-auto"
        >
          {configPending && (
            <p className="text-muted-foreground">Loading configuration...</p>
          )}
          {configErr && <p className="text-sm text-destructive">{configErr}</p>}
          {!configPending && (
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-medium">REST resources</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Register OpenAPI specs under{' '}
                    <a href="#schemas" className="font-medium text-primary underline">
                      Schemas
                    </a>{' '}
                    to pick them here.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={openAddRest} className="shrink-0">
                  <Plus className="size-4" />
                  Add REST resource
                </Button>
              </div>
              {restFromConfig.length === 0 ? (
                <p className="text-sm text-muted-foreground">No REST resources configured.</p>
              ) : (
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
                      {restFromConfig.map((entry, index) => (
                        <tr
                          key={`rest-${index}`}
                          className="cursor-pointer border-b border-border/50 last:border-b-0 hover:bg-accent/30"
                          onClick={() => openEditRest(index)}
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
                                onClick={() => openEditRest(index)}
                                aria-label={`Edit REST ${entry.id}`}
                              >
                                <Pencil className="size-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => setDeleteIndex(index)}
                                aria-label={`Remove REST ${entry.id}`}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {editingRest !== null && (
                <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
                  <h4 className="mb-3 text-sm font-medium">
                    {editingRest === 'add' ? 'Add REST resource' : 'Edit REST resource'}
                  </h4>
                  <RestResourceFields
                    draft={restDraft}
                    onChange={setRestDraft}
                    openapiSchemas={openapiSchemas}
                  />
                  {formError && <p className="mt-2 text-sm text-destructive">{formError}</p>}
                  <div className="mt-4 flex justify-end gap-2">
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
                </div>
              )}
            </section>
          )}
        </TabsContent>
      </Tabs>

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
