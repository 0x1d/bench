import { useEffect, useState } from 'react';
import yaml from 'js-yaml';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { cn } from '@/lib/utils';
import { fetchConfig, fetchConfigExample, saveConfig } from '@/services/api';
import { useStatus } from '@/hooks/use-status';

interface FilesystemResource {
  id: string;
  label: string;
  path: string;
}

interface DatabaseResource {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  default: boolean;
}

interface RestAuthConfig {
  type: 'none' | 'basic' | 'bearer' | 'apiKey';
  username?: string;
  password?: string;
  token?: string;
  name?: string;
  in?: string;
  value?: string;
}

interface RestResource {
  id: string;
  label: string;
  baseUrl: string;
  openapiSpec: string;
  auth?: RestAuthConfig;
}

interface FlowsConfig {
  path: string;
  flowpipeUrl: string;
}

interface ResourceFormState {
  filesystem: FilesystemResource[];
  databases: DatabaseResource[];
  rest: RestResource[];
  flows: FlowsConfig;
}

type PanelMode =
  | 'add-filesystem'
  | 'edit-filesystem'
  | 'add-database'
  | 'edit-database'
  | 'add-rest'
  | 'edit-rest'
  | 'edit-flows';

type DeleteTarget =
  | { type: 'filesystem'; index: number }
  | { type: 'database'; index: number }
  | { type: 'rest'; index: number }
  | null;

function emptyState(): ResourceFormState {
  return {
    filesystem: [],
    databases: [],
    rest: [],
    flows: { path: './flows', flowpipeUrl: 'http://localhost:7103' },
  };
}

function parseConfigToState(rawConfig: string): ResourceFormState {
  const parsed = (yaml.load(rawConfig) as {
    resources?: {
      filesystem?: Array<{ id?: string; label?: string; path?: string }>;
      databases?: Array<{
        id?: string;
        label?: string;
        url?: string;
        enabled?: boolean;
        default?: boolean;
      }>;
      rest?: Array<{
        id?: string;
        label?: string;
        baseUrl?: string;
        openapiSpec?: string;
        auth?: {
          type?: string;
          username?: string;
          password?: string;
          token?: string;
          name?: string;
          in?: string;
          value?: string;
        };
      }>;
    };
    flows?: { path?: string; flowpipeUrl?: string };
  }) ?? { resources: {} };

  const filesystem = (parsed.resources?.filesystem ?? []).map((entry) => ({
    id: entry.id ?? '',
    label: entry.label ?? '',
    path: entry.path ?? '',
  }));

  const databases = (parsed.resources?.databases ?? []).map((entry) => ({
    id: entry.id ?? '',
    label: entry.label ?? '',
    url: entry.url ?? '',
    enabled: entry.enabled ?? true,
    default: entry.default ?? false,
  }));

  const rest = (parsed.resources?.rest ?? []).map((entry) => ({
    id: entry.id ?? '',
    label: entry.label ?? '',
    baseUrl: entry.baseUrl ?? '',
    openapiSpec: entry.openapiSpec ?? '',
    auth: entry.auth
      ? {
        type: (entry.auth.type ?? 'none') as RestAuthConfig['type'],
        username: entry.auth.username ?? '',
        password: entry.auth.password ?? '',
        token: entry.auth.token ?? '',
        name: entry.auth.name ?? '',
        in: entry.auth.in ?? 'header',
        value: entry.auth.value ?? '',
      }
      : { type: 'none' as const },
  }));

  const flowsRaw = parsed.flows;
  const flows: FlowsConfig = {
    path: flowsRaw?.path ?? './flows',
    flowpipeUrl: flowsRaw?.flowpipeUrl ?? 'http://localhost:7103',
  };

  return { filesystem, databases, rest, flows };
}

function stateToConfig(state: ResourceFormState): string {
  const resources = {
    filesystem: state.filesystem
      .filter((entry) => entry.id.trim() !== '' || entry.path.trim() !== '')
      .map((entry) => ({
        id: entry.id.trim(),
        label: entry.label.trim() || undefined,
        path: entry.path.trim(),
      })),
    databases: state.databases
      .filter((entry) => entry.id.trim() !== '' || entry.url.trim() !== '')
      .map((entry) => ({
        id: entry.id.trim(),
        label: entry.label.trim() || undefined,
        url: entry.url.trim(),
        enabled: entry.enabled,
        default: entry.default || undefined,
      })),
    rest: state.rest
      .filter((entry) => entry.id.trim() !== '' || entry.baseUrl.trim() !== '')
      .map((entry) => {
        const base: Record<string, unknown> = {
          id: entry.id.trim(),
          label: entry.label.trim() || undefined,
          baseUrl: entry.baseUrl.trim(),
          openapiSpec: entry.openapiSpec.trim() || undefined,
        };
        const auth = entry.auth;
        if (auth && auth.type !== 'none') {
          base.auth = {
            type: auth.type,
            ...(auth.type === 'basic' && {
              username: auth.username?.trim(),
              password: auth.password?.trim(),
            }),
            ...(auth.type === 'bearer' && { token: auth.token?.trim() }),
            ...(auth.type === 'apiKey' && {
              name: auth.name?.trim(),
              in: auth.in || 'header',
              value: auth.value?.trim(),
            }),
          };
        }
        return base;
      }),
  };

  const output: Record<string, unknown> = { resources };
  if (state.flows.path.trim() !== '' || state.flows.flowpipeUrl.trim() !== '') {
    output.flows = {
      path: state.flows.path.trim() || './flows',
      flowpipeUrl: state.flows.flowpipeUrl.trim() || 'http://localhost:7103',
    };
  }
  return yaml.dump(output, { noRefs: true, lineWidth: 120 });
}

export function ResourcesConfigPage() {
  const { refetch: refetchStatus } = useStatus();
  const [state, setState] = useState<ResourceFormState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);
  const [panelIndex, setPanelIndex] = useState<number | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [filesystemDraft, setFilesystemDraft] = useState<FilesystemResource>({
    id: '',
    label: '',
    path: '',
  });
  const [databaseDraft, setDatabaseDraft] = useState<DatabaseResource>({
    id: '',
    label: '',
    url: '',
    enabled: true,
    default: false,
  });
  const [restDraft, setRestDraft] = useState<RestResource>({
    id: '',
    label: '',
    baseUrl: '',
    openapiSpec: '',
    auth: { type: 'none' },
  });
  const [flowsDraft, setFlowsDraft] = useState<FlowsConfig>({
    path: './flows',
    flowpipeUrl: 'http://localhost:7103',
  });

  const persistState = async (newState: ResourceFormState) => {
    setError(null);
    const nextConfig = stateToConfig(newState);
    await saveConfig(nextConfig);
    await refetchStatus();
  };

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      setLoading(true);
      setError(null);
      try {
        const [currentResult, exampleResult] = await Promise.allSettled([
          fetchConfig(),
          fetchConfigExample(),
        ]);
        if (cancelled) return;
        const base =
          currentResult.status === 'fulfilled'
            ? currentResult.value
            : exampleResult.status === 'fulfilled'
              ? exampleResult.value
              : '';
        setState(parseConfigToState(base));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load config');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  const openAddFilesystem = () => {
    setFilesystemDraft({ id: '', label: '', path: '' });
    setPanelIndex(null);
    setPanelError(null);
    setPanelMode('add-filesystem');
  };

  const openEditFilesystem = (index: number) => {
    setFilesystemDraft(state.filesystem[index]);
    setPanelIndex(index);
    setPanelError(null);
    setPanelMode('edit-filesystem');
  };

  const openRemoveFilesystem = (index: number) => {
    setDeleteTarget({ type: 'filesystem', index });
  };

  const openAddDatabase = () => {
    const hasDefault = state.databases.some((db) => db.default);
    setDatabaseDraft({
      id: '',
      label: '',
      url: '',
      enabled: true,
      default: !hasDefault,
    });
    setPanelIndex(null);
    setPanelError(null);
    setPanelMode('add-database');
  };

  const openEditDatabase = (index: number) => {
    setDatabaseDraft(state.databases[index]);
    setPanelIndex(index);
    setPanelError(null);
    setPanelMode('edit-database');
  };

  const openRemoveDatabase = (index: number) => {
    setDeleteTarget({ type: 'database', index });
  };

  const openAddRest = () => {
    setRestDraft({
      id: '',
      label: '',
      baseUrl: '',
      openapiSpec: '',
      auth: { type: 'none' },
    });
    setPanelIndex(null);
    setPanelError(null);
    setPanelMode('add-rest');
  };

  const openEditRest = (index: number) => {
    setRestDraft(state.rest[index]);
    setPanelIndex(index);
    setPanelError(null);
    setPanelMode('edit-rest');
  };

  const openRemoveRest = (index: number) => {
    setDeleteTarget({ type: 'rest', index });
  };

  const openEditFlows = () => {
    setFlowsDraft(state.flows);
    setPanelError(null);
    setPanelMode('edit-flows');
  };

  const closePanel = () => {
    setPanelMode(null);
    setPanelIndex(null);
    setPanelError(null);
  };

  const applyFilesystemDraft = async () => {
    const id = filesystemDraft.id.trim();
    const path = filesystemDraft.path.trim();
    if (id === '' || path === '') {
      setPanelError('Filesystem ID and path are required.');
      return;
    }

    const duplicate = state.filesystem.some(
      (entry, idx) => idx !== panelIndex && entry.id.trim() === id
    );
    if (duplicate) {
      setPanelError(`Filesystem ID "${id}" already exists.`);
      return;
    }

    const nextEntry: FilesystemResource = {
      id,
      label: filesystemDraft.label.trim(),
      path,
    };

    const prevState = state;
    const nextState =
      panelMode === 'add-filesystem'
        ? { ...prevState, filesystem: [...prevState.filesystem, nextEntry] }
        : panelMode === 'edit-filesystem' && panelIndex != null
          ? {
            ...prevState,
            filesystem: prevState.filesystem.map((entry, idx) =>
              idx === panelIndex ? nextEntry : entry
            ),
          }
          : prevState;

    if (nextState === prevState) return;

    setState(nextState);
    try {
      await persistState(nextState);
      closePanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setState(prevState);
    }
  };

  const applyDatabaseDraft = async () => {
    const id = databaseDraft.id.trim();
    const url = databaseDraft.url.trim();
    if (id === '' || url === '') {
      setPanelError('Database ID and URL are required.');
      return;
    }

    const duplicate = state.databases.some(
      (entry, idx) => idx !== panelIndex && entry.id.trim() === id
    );
    if (duplicate) {
      setPanelError(`Database ID "${id}" already exists.`);
      return;
    }

    const nextEntry: DatabaseResource = {
      id,
      label: databaseDraft.label.trim(),
      url,
      enabled: databaseDraft.enabled,
      default: databaseDraft.default,
    };

    const applyWithDefaultRule = (entries: DatabaseResource[]) => {
      if (!nextEntry.default) return entries;
      return entries.map((entry, idx) =>
        panelMode === 'edit-database' && panelIndex != null
          ? idx === panelIndex
            ? entry
            : { ...entry, default: false }
          : { ...entry, default: false }
      );
    };

    const prevState = state;
    const normalized =
      panelMode === 'add-database'
        ? applyWithDefaultRule(prevState.databases)
        : applyWithDefaultRule(
          prevState.databases.map((entry, idx) =>
            panelMode === 'edit-database' && panelIndex != null && idx === panelIndex
              ? nextEntry
              : entry
          )
        );
    const nextState =
      panelMode === 'add-database'
        ? { ...prevState, databases: [...normalized, nextEntry] }
        : panelMode === 'edit-database' && panelIndex != null
          ? { ...prevState, databases: normalized }
          : prevState;

    if (nextState === prevState) return;

    setState(nextState);
    try {
      await persistState(nextState);
      closePanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setState(prevState);
    }
  };

  const applyRestDraft = async () => {
    const id = restDraft.id.trim();
    const baseUrl = restDraft.baseUrl.trim();
    if (id === '' || baseUrl === '') {
      setPanelError('REST ID and base URL are required.');
      return;
    }

    const duplicate = state.rest.some(
      (entry, idx) => idx !== panelIndex && entry.id.trim() === id
    );
    if (duplicate) {
      setPanelError(`REST ID "${id}" already exists.`);
      return;
    }

    const auth = restDraft.auth;
    if (auth?.type === 'basic' && (!auth.username?.trim() || !auth.password?.trim())) {
      setPanelError('Username and password are required for basic auth.');
      return;
    }
    if (auth?.type === 'bearer' && !auth.token?.trim()) {
      setPanelError('Token is required for bearer auth.');
      return;
    }
    if (auth?.type === 'apiKey' && (!auth.name?.trim() || !auth.value?.trim())) {
      setPanelError('Name and value are required for API key auth.');
      return;
    }

    const nextEntry: RestResource = {
      id,
      label: restDraft.label.trim(),
      baseUrl,
      openapiSpec: restDraft.openapiSpec.trim(),
      auth: auth && auth.type !== 'none' ? auth : undefined,
    };

    const prevState = state;
    const nextState =
      panelMode === 'add-rest'
        ? { ...prevState, rest: [...prevState.rest, nextEntry] }
        : panelMode === 'edit-rest' && panelIndex != null
          ? {
            ...prevState,
            rest: prevState.rest.map((entry, idx) =>
              idx === panelIndex ? nextEntry : entry
            ),
          }
          : prevState;

    if (nextState === prevState) return;

    setState(nextState);
    try {
      await persistState(nextState);
      closePanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setState(prevState);
    }
  };

  const applyFlowsDraft = async () => {
    const path = flowsDraft.path.trim() || './flows';
    const flowpipeUrl = flowsDraft.flowpipeUrl.trim() || 'http://localhost:7103';

    const prevState = state;
    const nextState = {
      ...prevState,
      flows: { path, flowpipeUrl },
    };

    setState(nextState);
    try {
      await persistState(nextState);
      closePanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setState(prevState);
    }
  };

  const confirmRemove = async () => {
    if (!deleteTarget) return;
    const prevState = state;
    const nextState =
      deleteTarget.type === 'filesystem'
        ? {
          ...prevState,
          filesystem: prevState.filesystem.filter((_, idx) => idx !== deleteTarget.index),
        }
        : deleteTarget.type === 'database'
          ? {
            ...prevState,
            databases: prevState.databases.filter((_, idx) => idx !== deleteTarget.index),
          }
          : {
            ...prevState,
            rest: prevState.rest.filter((_, idx) => idx !== deleteTarget.index),
          };

    setState(nextState);
    setDeleteTarget(null);
    try {
      await persistState(nextState);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setState(prevState);
    }
  };

  const panelOpen = panelMode != null;
  const panelTitle =
    panelMode === 'add-filesystem'
      ? 'Add filesystem resource'
      : panelMode === 'edit-filesystem'
        ? 'Edit filesystem resource'
        : panelMode === 'add-database'
          ? 'Add database resource'
          : panelMode === 'edit-database'
            ? 'Edit database resource'
            : panelMode === 'add-rest'
              ? 'Add REST resource'
              : panelMode === 'edit-rest'
                ? 'Edit REST resource'
                : panelMode === 'edit-flows'
                  ? 'Configure flows'
                  : 'Resource';
  const panelDescription = panelMode?.includes('filesystem')
    ? 'Configure filesystem resource fields used for file browsing.'
    : panelMode?.includes('database')
      ? 'Configure database resource fields.'
      : panelMode?.includes('rest')
        ? 'Configure REST API endpoint with optional auth and OpenAPI spec.'
        : panelMode === 'edit-flows'
          ? 'Flowpipe integration: flows directory and server URL.'
          : '';

  const panelBody = (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
        <div>
          <p className="text-sm font-medium">{panelTitle}</p>
          {panelDescription && (
            <p className="text-xs text-muted-foreground">{panelDescription}</p>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={closePanel} aria-label="Close panel">
          <X className="size-4" />
        </Button>
      </div>

      <div className="p-4">
        {(panelMode === 'add-filesystem' || panelMode === 'edit-filesystem') && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>ID</Label>
              <Input
                value={filesystemDraft.id}
                onChange={(e) =>
                  setFilesystemDraft((prev) => ({ ...prev, id: e.target.value }))
                }
                placeholder="data"
              />
            </div>
            <div className="space-y-1">
              <Label>Label</Label>
              <Input
                value={filesystemDraft.label}
                onChange={(e) =>
                  setFilesystemDraft((prev) => ({ ...prev, label: e.target.value }))
                }
                placeholder="Data"
              />
            </div>
            <div className="space-y-1">
              <Label>Path</Label>
              <Input
                value={filesystemDraft.path}
                onChange={(e) =>
                  setFilesystemDraft((prev) => ({ ...prev, path: e.target.value }))
                }
                placeholder="/mnt/data"
                className="font-mono"
              />
            </div>
          </div>
        )}

        {(panelMode === 'add-rest' || panelMode === 'edit-rest') && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>ID</Label>
              <Input
                value={restDraft.id}
                onChange={(e) =>
                  setRestDraft((prev) => ({ ...prev, id: e.target.value }))
                }
                placeholder="petstore"
              />
            </div>
            <div className="space-y-1">
              <Label>Label</Label>
              <Input
                value={restDraft.label}
                onChange={(e) =>
                  setRestDraft((prev) => ({ ...prev, label: e.target.value }))
                }
                placeholder="Petstore API"
              />
            </div>
            <div className="space-y-1">
              <Label>Base URL</Label>
              <Input
                value={restDraft.baseUrl}
                onChange={(e) =>
                  setRestDraft((prev) => ({ ...prev, baseUrl: e.target.value }))
                }
                placeholder="https://api.example.com"
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label>OpenAPI spec path</Label>
              <Input
                value={restDraft.openapiSpec}
                onChange={(e) =>
                  setRestDraft((prev) => ({ ...prev, openapiSpec: e.target.value }))
                }
                placeholder="specs/api.json"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Path relative to config directory.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Auth type</Label>
              <select
                value={restDraft.auth?.type ?? 'none'}
                onChange={(e) =>
                  setRestDraft((prev) => ({
                    ...prev,
                    auth: {
                      ...prev.auth,
                      type: e.target.value as RestAuthConfig['type'],
                    },
                  }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="none">None</option>
                <option value="basic">Basic</option>
                <option value="bearer">Bearer</option>
                <option value="apiKey">API Key</option>
              </select>
            </div>
            {restDraft.auth?.type === 'basic' && (
              <>
                <div className="space-y-1">
                  <Label>Username</Label>
                  <Input
                    value={restDraft.auth.username ?? ''}
                    onChange={(e) =>
                      setRestDraft((prev) => ({
                        ...prev,
                        auth: { ...prev.auth!, username: e.target.value },
                      }))
                    }
                    placeholder={'${BENCH_REST_USER}'}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={restDraft.auth.password ?? ''}
                    onChange={(e) =>
                      setRestDraft((prev) => ({
                        ...prev,
                        auth: { ...prev.auth!, password: e.target.value },
                      }))
                    }
                    placeholder={'${BENCH_REST_PASS}'}
                    className="font-mono"
                  />
                </div>
              </>
            )}
            {restDraft.auth?.type === 'bearer' && (
              <div className="space-y-1">
                <Label>Token</Label>
                <Input
                  type="password"
                  value={restDraft.auth.token ?? ''}
                  onChange={(e) =>
                    setRestDraft((prev) => ({
                      ...prev,
                      auth: { ...prev.auth!, token: e.target.value },
                    }))
                  }
                  placeholder={'${BENCH_REST_TOKEN}'}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Use env placeholders for secrets.
                </p>
              </div>
            )}
            {restDraft.auth?.type === 'apiKey' && (
              <>
                <div className="space-y-1">
                  <Label>Header/param name</Label>
                  <Input
                    value={restDraft.auth.name ?? ''}
                    onChange={(e) =>
                      setRestDraft((prev) => ({
                        ...prev,
                        auth: { ...prev.auth!, name: e.target.value },
                      }))
                    }
                    placeholder="X-API-Key"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Location</Label>
                  <select
                    value={restDraft.auth.in ?? 'header'}
                    onChange={(e) =>
                      setRestDraft((prev) => ({
                        ...prev,
                        auth: { ...prev.auth!, in: e.target.value },
                      }))
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="header">Header</option>
                    <option value="query">Query</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Value</Label>
                  <Input
                    type="password"
                    value={restDraft.auth.value ?? ''}
                    onChange={(e) =>
                      setRestDraft((prev) => ({
                        ...prev,
                        auth: { ...prev.auth!, value: e.target.value },
                      }))
                    }
                    placeholder={'${BENCH_REST_API_KEY}'}
                    className="font-mono"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {panelMode === 'edit-flows' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Flows directory</Label>
              <Input
                value={flowsDraft.path}
                onChange={(e) =>
                  setFlowsDraft((prev) => ({ ...prev, path: e.target.value }))
                }
                placeholder="./flows"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Path to store flow JSON and .fp files. Relative to config directory.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Flowpipe server URL</Label>
              <Input
                value={flowsDraft.flowpipeUrl}
                onChange={(e) =>
                  setFlowsDraft((prev) => ({ ...prev, flowpipeUrl: e.target.value }))
                }
                placeholder="http://localhost:7103"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Flowpipe server for running flows.
              </p>
            </div>
          </div>
        )}

        {(panelMode === 'add-database' || panelMode === 'edit-database') && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>ID</Label>
              <Input
                value={databaseDraft.id}
                onChange={(e) =>
                  setDatabaseDraft((prev) => ({ ...prev, id: e.target.value }))
                }
                placeholder="main"
              />
            </div>
            <div className="space-y-1">
              <Label>Label</Label>
              <Input
                value={databaseDraft.label}
                onChange={(e) =>
                  setDatabaseDraft((prev) => ({ ...prev, label: e.target.value }))
                }
                placeholder="Main DB"
              />
            </div>
            <div className="space-y-1">
              <Label>URL</Label>
              <Input
                value={databaseDraft.url}
                onChange={(e) =>
                  setDatabaseDraft((prev) => ({ ...prev, url: e.target.value }))
                }
                placeholder="${BENCH_DB_MAIN_URL}"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                URL supports env placeholders like{' '}
                <code className="rounded bg-muted px-1">${'{BENCH_DB_MAIN_URL}'}</code>.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={databaseDraft.enabled}
                onCheckedChange={(v) =>
                  setDatabaseDraft((prev) => ({ ...prev, enabled: v === true }))
                }
              />
              Enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={databaseDraft.default}
                onCheckedChange={(v) =>
                  setDatabaseDraft((prev) => ({ ...prev, default: v === true }))
                }
              />
              Default
            </label>
          </div>
        )}

        {panelError && <p className="mt-3 text-sm text-destructive">{panelError}</p>}
      </div>

      <div className="border-t px-4 py-3">
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" onClick={closePanel}>
            Cancel
          </Button>
          {(panelMode === 'add-filesystem' || panelMode === 'edit-filesystem') && (
            <Button onClick={applyFilesystemDraft}>
              {panelMode === 'add-filesystem' ? 'Add' : 'Save changes'}
            </Button>
          )}
          {(panelMode === 'add-database' || panelMode === 'edit-database') && (
            <Button onClick={applyDatabaseDraft}>
              {panelMode === 'add-database' ? 'Add' : 'Save changes'}
            </Button>
          )}
          {(panelMode === 'add-rest' || panelMode === 'edit-rest') && (
            <Button onClick={applyRestDraft}>
              {panelMode === 'add-rest' ? 'Add' : 'Save changes'}
            </Button>
          )}
          {panelMode === 'edit-flows' && (
            <Button onClick={applyFlowsDraft}>Save changes</Button>
          )}
        </div>
      </div>
    </>
  );

  if (loading) {
    return <p className="text-muted-foreground">Loading resource configuration...</p>;
  }

  return (
    <div className="flex w-full min-h-0 flex-1 overflow-hidden">
      <div
        className={cn(
          'min-h-0 min-w-0 flex-1 overflow-auto pr-0 lg:pr-2',
          panelOpen && 'lg:pr-[428px]'
        )}
      >
        <div className="flex w-full min-h-0 flex-1 flex-col gap-6">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-lg font-medium tracking-tight">Resources</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure filesystem roots, database resources, REST API endpoints, and flows (Flowpipe).
            </p>
          </div>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-medium">Filesystem resources</h3>
              <Button variant="outline" size="sm" onClick={openAddFilesystem}>
                <Plus className="size-4" />
                Add filesystem
              </Button>
            </div>
            {state.filesystem.length === 0 ? (
              <p className="text-sm text-muted-foreground">No filesystem resources configured.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left font-medium">ID</th>
                      <th className="px-4 py-3 text-left font-medium">Label</th>
                      <th className="px-4 py-3 text-left font-medium">Path</th>
                      <th className="w-28 px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {state.filesystem.map((entry, index) => (
                      <tr
                        key={`fs-${index}`}
                        className="border-b border-border/50 last:border-b-0 cursor-pointer hover:bg-accent/30"
                        onClick={() => openEditFilesystem(index)}
                      >
                        <td className="px-4 py-2 font-mono">{entry.id}</td>
                        <td className="px-4 py-2">{entry.label || '—'}</td>
                        <td className="px-4 py-2 font-mono">{entry.path}</td>
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => openEditFilesystem(index)}
                              aria-label={`Edit filesystem ${entry.id}`}
                            >
                              <Pencil className="size-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => openRemoveFilesystem(index)}
                              aria-label={`Remove filesystem ${entry.id}`}
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
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-medium">Database resources</h3>
              <Button variant="outline" size="sm" onClick={openAddDatabase}>
                <Plus className="size-4" />
                Add database
              </Button>
            </div>
            {state.databases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No database resources configured.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left font-medium">ID</th>
                      <th className="px-4 py-3 text-left font-medium">Label</th>
                      <th className="px-4 py-3 text-left font-medium">URL</th>
                      <th className="px-4 py-3 text-left font-medium">Enabled</th>
                      <th className="px-4 py-3 text-left font-medium">Default</th>
                      <th className="w-28 px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {state.databases.map((entry, index) => (
                      <tr
                        key={`db-${index}`}
                        className="border-b border-border/50 last:border-b-0 cursor-pointer hover:bg-accent/30"
                        onClick={() => openEditDatabase(index)}
                      >
                        <td className="px-4 py-2 font-mono">{entry.id}</td>
                        <td className="px-4 py-2">{entry.label || '—'}</td>
                        <td className="px-4 py-2 font-mono">{entry.url}</td>
                        <td className="px-4 py-2">{entry.enabled ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-2">{entry.default ? 'Yes' : 'No'}</td>
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => openEditDatabase(index)}
                              aria-label={`Edit database ${entry.id}`}
                            >
                              <Pencil className="size-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => openRemoveDatabase(index)}
                              aria-label={`Remove database ${entry.id}`}
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
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-medium">REST resources</h3>
              <Button variant="outline" size="sm" onClick={openAddRest}>
                <Plus className="size-4" />
                Add REST
              </Button>
            </div>
            {state.rest.length === 0 ? (
              <p className="text-sm text-muted-foreground">No REST resources configured.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left font-medium">ID</th>
                      <th className="px-4 py-3 text-left font-medium">Label</th>
                      <th className="px-4 py-3 text-left font-medium">Base URL</th>
                      <th className="px-4 py-3 text-left font-medium">OpenAPI spec</th>
                      <th className="w-28 px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {state.rest.map((entry, index) => (
                      <tr
                        key={`rest-${index}`}
                        className="border-b border-border/50 last:border-b-0 cursor-pointer hover:bg-accent/30"
                        onClick={() => openEditRest(index)}
                      >
                        <td className="px-4 py-2 font-mono">{entry.id}</td>
                        <td className="px-4 py-2">{entry.label || '—'}</td>
                        <td className="px-4 py-2 font-mono truncate max-w-[200px]">{entry.baseUrl}</td>
                        <td className="px-4 py-2 font-mono">{entry.openapiSpec || '—'}</td>
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
                              onClick={() => openRemoveRest(index)}
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
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-medium">Flows</h3>
              <Button variant="outline" size="sm" onClick={openEditFlows}>
                <Pencil className="size-4" />
                Configure
              </Button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground">Path:</span>
                <span className="font-mono">{state.flows.path || './flows'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground">Flowpipe URL:</span>
                <span className="font-mono">{state.flows.flowpipeUrl || 'http://localhost:7103'}</span>
              </div>
            </div>
          </section>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>

      <div
        className={cn(
          'bg-sidebar text-sidebar-foreground fixed inset-x-0 bottom-0 top-[var(--header-height)] z-30 min-h-0 flex-col overflow-auto border-l lg:hidden',
          panelOpen ? 'flex' : 'hidden'
        )}
      >
        {panelBody}
      </div>
      <div
        className={cn(
          'bg-sidebar text-sidebar-foreground fixed right-0 bottom-0 top-[var(--header-height)] z-20 hidden min-h-0 w-[420px] flex-col overflow-auto border-l lg:flex',
          panelOpen ? 'lg:flex' : 'lg:hidden'
        )}
      >
        {panelBody}
      </div>

      <ConfirmDeleteDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove resource"
        description={
          deleteTarget?.type === 'filesystem'
            ? `Remove filesystem resource "${state.filesystem[deleteTarget.index]?.id}"?`
            : deleteTarget?.type === 'database'
              ? `Remove database resource "${state.databases[deleteTarget.index]?.id}"?`
              : deleteTarget?.type === 'rest'
                ? `Remove REST resource "${state.rest[deleteTarget.index]?.id}"?`
                : 'Remove selected resource?'
        }
        onConfirm={confirmRemove}
        confirmLabel="Remove"
      />
    </div>
  );
}
