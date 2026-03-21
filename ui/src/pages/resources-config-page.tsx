import { useEffect, useMemo, useState } from 'react';
import yaml from 'js-yaml';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchConfig, fetchConfigExample, fetchSchemaContent, saveConfig } from '@/services/api';
import { detectSchemaType, parseSchema } from '@/lib/schema-registry';
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
  /** Registered OpenAPI schema id; takes precedence over openapiSpec when set. */
  schemaId?: string;
  openapiSpec: string;
  auth?: RestAuthConfig;
}

interface SchemaResourceEntry {
  id: string;
  label: string;
  type: 'openapi' | 'asyncapi' | 'json-schema';
  source: { path: string };
}

interface FlowsConfig {
  path: string;
}

interface InfrastructureConfig {
  path: string;
}

interface AgentConfig {
  endpoint: string;
  workingDirectory: string;
  agent: string;
  model: string;
}

interface WorkspaceResource {
  id: string;
  label: string;
  flowpipeUrl: string;
}

interface ResourceFormState {
  filesystem: FilesystemResource[];
  schemas: SchemaResourceEntry[];
  databases: DatabaseResource[];
  rest: RestResource[];
  workspaces: WorkspaceResource[];
  flows: FlowsConfig;
  infrastructure: InfrastructureConfig;
  agent: AgentConfig;
}

type PanelMode =
  | 'add-filesystem'
  | 'edit-filesystem'
  | 'add-schema'
  | 'edit-schema'
  | 'schema-detail'
  | 'add-database'
  | 'edit-database'
  | 'add-rest'
  | 'edit-rest'
  | 'add-workspace'
  | 'edit-workspace'
  | 'edit-flows'
  | 'edit-infrastructure'
  | 'edit-agent';

type DeleteTarget =
  | { type: 'filesystem'; index: number }
  | { type: 'schema'; index: number }
  | { type: 'database'; index: number }
  | { type: 'rest'; index: number }
  | { type: 'workspace'; index: number }
  | null;

type ResourceConfigTab =
  | 'filesystem'
  | 'schemas'
  | 'databases'
  | 'rest'
  | 'flows'
  | 'infrastructure'
  | 'agent';

function emptyState(): ResourceFormState {
  return {
    filesystem: [],
    schemas: [],
    databases: [],
    rest: [],
    workspaces: [],
    flows: { path: './flows' },
    infrastructure: { path: './workspace/infra' },
    agent: {
      endpoint: 'http://localhost:3001',
      workingDirectory: '',
      agent: 'cursor',
      model: '',
    },
  };
}

function parseConfigToState(rawConfig: string): ResourceFormState {
  const parsed = (yaml.load(rawConfig) as {
    resources?: {
      schemas?: Array<{
        id?: string;
        label?: string;
        type?: string;
        source?: { path?: string };
      }>;
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
        schemaId?: string;
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
    flows?: {
      path?: string;
      workspaces?: Array<{ id?: string; label?: string; flowpipeUrl?: string }>;
    };
    infrastructure?: { path?: string };
    agent?: {
      endpoint?: string;
      workingDirectory?: string;
      agent?: string;
      model?: string;
    };
  }) ?? { resources: {} };

  const filesystem = (parsed.resources?.filesystem ?? []).map((entry) => ({
    id: entry.id ?? '',
    label: entry.label ?? '',
    path: entry.path ?? '',
  }));

  const schemas = (parsed.resources?.schemas ?? []).map((entry) => {
    const t = (entry.type ?? 'openapi') as SchemaResourceEntry['type'];
    const safeType: SchemaResourceEntry['type'] =
      t === 'asyncapi' || t === 'json-schema' ? t : 'openapi';
    return {
      id: entry.id ?? '',
      label: entry.label ?? '',
      type: safeType,
      source: { path: entry.source?.path ?? '' },
    };
  });

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
    schemaId: entry.schemaId ?? '',
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

  const workspaces = (parsed.flows?.workspaces ?? []).map((entry) => ({
    id: entry.id ?? '',
    label: entry.label ?? '',
    flowpipeUrl: entry.flowpipeUrl ?? 'http://localhost:7103',
  }));

  const flowsRaw = parsed.flows;
  const flows: FlowsConfig = {
    path: flowsRaw?.path ?? './flows',
  };

  const infraRaw = parsed.infrastructure;
  const infrastructure: InfrastructureConfig = {
    path: infraRaw?.path ?? './workspace/infra',
  };

  const agentRaw = parsed.agent;
  const agent: AgentConfig = {
    endpoint: agentRaw?.endpoint ?? 'http://localhost:3001',
    workingDirectory: agentRaw?.workingDirectory ?? '',
    agent: agentRaw?.agent ?? 'cursor',
    model: agentRaw?.model ?? '',
  };

  return { filesystem, schemas, databases, rest, workspaces, flows, infrastructure, agent };
}

function stateToConfig(state: ResourceFormState): string {
  const resources = {
    schemas: state.schemas
      .filter((entry) => entry.id.trim() !== '' || entry.source.path.trim() !== '')
      .map((entry) => ({
        id: entry.id.trim(),
        label: entry.label.trim() || undefined,
        type: entry.type,
        source: { path: entry.source.path.trim() },
      })),
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
          schemaId: entry.schemaId?.trim() || undefined,
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

  const workspacesOut = state.workspaces
    .filter((entry) => entry.id.trim() !== '')
    .map((entry) => ({
      id: entry.id.trim(),
      label: entry.label.trim() || undefined,
      flowpipeUrl: entry.flowpipeUrl.trim() || undefined,
    }));

  if (state.flows.path.trim() !== '' || workspacesOut.length > 0) {
    output.flows = {
      path: state.flows.path.trim() || './flows',
      workspaces: workspacesOut.length > 0 ? workspacesOut : undefined,
    };
  }
  if (state.infrastructure.path.trim() !== '') {
    output.infrastructure = {
      path: state.infrastructure.path.trim() || './workspace/infra',
    };
  }
  if (state.agent.endpoint.trim() !== '') {
    output.agent = {
      endpoint: state.agent.endpoint.trim(),
      workingDirectory: state.agent.workingDirectory.trim(),
      agent: state.agent.agent.trim(),
      model: state.agent.model.trim() || undefined,
    };
  }
  return yaml.dump(output, { noRefs: true, lineWidth: 120 });
}

export function ResourcesConfigPage() {
  const queryClient = useQueryClient();
  const { refetch: refetchStatus } = useStatus();
  const [state, setState] = useState<ResourceFormState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);
  const [panelIndex, setPanelIndex] = useState<number | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [resourceTab, setResourceTab] = useState<ResourceConfigTab>('filesystem');
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
    schemaId: '',
    openapiSpec: '',
    auth: { type: 'none' },
  });
  const [schemaDraft, setSchemaDraft] = useState<SchemaResourceEntry>({
    id: '',
    label: '',
    type: 'openapi',
    source: { path: '' },
  });
  const [flowsDraft, setFlowsDraft] = useState<FlowsConfig>({
    path: './flows',
  });
  const [infrastructureDraft, setInfrastructureDraft] = useState<InfrastructureConfig>({
    path: './workspace/infra',
  });
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceResource>({
    id: '',
    label: '',
    flowpipeUrl: 'http://localhost:7103',
  });
  const [agentDraft, setAgentDraft] = useState<AgentConfig>({
    endpoint: 'http://localhost:3001',
    workingDirectory: '',
    agent: 'cursor',
    model: '',
  });

  const persistState = async (newState: ResourceFormState) => {
    setError(null);
    const nextConfig = stateToConfig(newState);
    await saveConfig(nextConfig);
    await refetchStatus();
    queryClient.invalidateQueries({ queryKey: ['flows', 'workspaces'] });
    queryClient.invalidateQueries({ queryKey: ['infrastructure'] });
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

  useEffect(() => {
    const handleClosePanel = () => {
      if (panelMode != null) {
        setPanelMode(null);
        setPanelIndex(null);
        setPanelError(null);
      }
    };
    window.addEventListener('bench:close-panel', handleClosePanel);
    return () => window.removeEventListener('bench:close-panel', handleClosePanel);
  }, [panelMode]);

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

  const openAddSchema = () => {
    setSchemaDraft({ id: '', label: '', type: 'openapi', source: { path: '' } });
    setPanelIndex(null);
    setPanelError(null);
    setPanelMode('add-schema');
  };

  const openEditSchema = (index: number) => {
    setSchemaDraft(state.schemas[index]);
    setPanelIndex(index);
    setPanelError(null);
    setPanelMode('edit-schema');
  };

  const openSchemaDetail = (index: number) => {
    setPanelIndex(index);
    setPanelError(null);
    setPanelMode('schema-detail');
  };

  const openRemoveSchema = (index: number) => {
    setDeleteTarget({ type: 'schema', index });
  };

  const openAddRest = () => {
    setRestDraft({
      id: '',
      label: '',
      baseUrl: '',
      schemaId: '',
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

  const openAddWorkspace = () => {
    setWorkspaceDraft({ id: '', label: '', flowpipeUrl: 'http://localhost:7103' });
    setPanelIndex(null);
    setPanelError(null);
    setPanelMode('add-workspace');
  };

  const openEditWorkspace = (index: number) => {
    setWorkspaceDraft(state.workspaces[index]);
    setPanelIndex(index);
    setPanelError(null);
    setPanelMode('edit-workspace');
  };

  const openRemoveWorkspace = (index: number) => {
    setDeleteTarget({ type: 'workspace', index });
  };

  const openEditFlows = () => {
    setFlowsDraft(state.flows);
    setPanelError(null);
    setPanelMode('edit-flows');
  };

  const openEditInfrastructure = () => {
    setInfrastructureDraft(state.infrastructure);
    setPanelError(null);
    setPanelMode('edit-infrastructure');
  };

  const openEditAgent = () => {
    setAgentDraft(state.agent);
    setPanelError(null);
    setPanelMode('edit-agent');
  };

  const closePanel = () => {
    setPanelMode(null);
    setPanelIndex(null);
    setPanelError(null);
  };

  const schemaDetailId =
    panelMode === 'schema-detail' && panelIndex != null
      ? (state.schemas[panelIndex]?.id ?? '').trim()
      : '';
  const schemaDetailEntry =
    panelMode === 'schema-detail' && panelIndex != null ? state.schemas[panelIndex] : null;

  const {
    data: schemaDetailRaw,
    isLoading: schemaDetailLoading,
    error: schemaDetailFetchError,
  } = useQuery({
    queryKey: ['schemas', 'content', schemaDetailId],
    queryFn: () => fetchSchemaContent(schemaDetailId),
    enabled: panelMode === 'schema-detail' && schemaDetailId.length > 0,
  });

  const schemaDetailParsed = useMemo(() => {
    if (!schemaDetailEntry || schemaDetailRaw == null) return null;
    const detected = detectSchemaType(schemaDetailRaw);
    const kind =
      schemaDetailEntry.type === 'openapi' ||
      schemaDetailEntry.type === 'asyncapi' ||
      schemaDetailEntry.type === 'json-schema'
        ? schemaDetailEntry.type
        : detected !== 'unknown'
          ? detected
          : 'openapi';
    return parseSchema(schemaDetailRaw, kind);
  }, [schemaDetailEntry, schemaDetailRaw]);

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

  const applySchemaDraft = async () => {
    const id = schemaDraft.id.trim();
    const path = schemaDraft.source.path.trim();
    if (id === '' || path === '') {
      setPanelError('Schema ID and source path are required.');
      return;
    }

    const duplicate = state.schemas.some(
      (entry, idx) => idx !== panelIndex && entry.id.trim() === id
    );
    if (duplicate) {
      setPanelError(`Schema ID "${id}" already exists.`);
      return;
    }

    const nextEntry: SchemaResourceEntry = {
      id,
      label: schemaDraft.label.trim(),
      type: schemaDraft.type,
      source: { path },
    };

    const prevState = state;
    const nextState =
      panelMode === 'add-schema'
        ? { ...prevState, schemas: [...prevState.schemas, nextEntry] }
        : panelMode === 'edit-schema' && panelIndex != null
          ? {
            ...prevState,
            schemas: prevState.schemas.map((entry, idx) =>
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
      schemaId: restDraft.schemaId?.trim() || undefined,
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

    const prevState = state;
    const nextState = {
      ...prevState,
      flows: { path },
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

  const applyInfrastructureDraft = async () => {
    const path = infrastructureDraft.path.trim() || './workspace/infra';

    const prevState = state;
    const nextState = {
      ...prevState,
      infrastructure: { path },
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

  const applyWorkspaceDraft = async () => {
    const id = workspaceDraft.id.trim();
    if (id === '') {
      setPanelError('Workspace ID is required.');
      return;
    }

    const duplicate = state.workspaces.some(
      (entry, idx) => idx !== panelIndex && entry.id.trim() === id
    );
    if (duplicate) {
      setPanelError(`Workspace ID "${id}" already exists.`);
      return;
    }

    const nextEntry: WorkspaceResource = {
      id,
      label: workspaceDraft.label.trim(),
      flowpipeUrl: workspaceDraft.flowpipeUrl.trim() || 'http://localhost:7103',
    };

    const prevState = state;
    const nextState =
      panelMode === 'add-workspace'
        ? { ...prevState, workspaces: [...prevState.workspaces, nextEntry] }
        : panelMode === 'edit-workspace' && panelIndex != null
          ? {
            ...prevState,
            workspaces: prevState.workspaces.map((entry, idx) =>
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

  const applyAgentDraft = async () => {
    const endpoint = agentDraft.endpoint.trim();
    const workingDirectory = agentDraft.workingDirectory.trim();
    const agent = agentDraft.agent.trim();

    if (endpoint === '' || workingDirectory === '' || agent === '') {
      setPanelError('Endpoint, working directory, and agent type are required.');
      return;
    }

    const prevState = state;
    const nextState = {
      ...prevState,
      agent: {
        ...agentDraft,
        endpoint,
        workingDirectory,
        agent,
        model: agentDraft.model.trim(),
      },
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
    let nextState: ResourceFormState;
    if (deleteTarget.type === 'filesystem') {
      nextState = {
        ...prevState,
        filesystem: prevState.filesystem.filter((_, idx) => idx !== deleteTarget.index),
      };
    } else if (deleteTarget.type === 'schema') {
      nextState = {
        ...prevState,
        schemas: prevState.schemas.filter((_, idx) => idx !== deleteTarget.index),
      };
    } else if (deleteTarget.type === 'database') {
      nextState = {
        ...prevState,
        databases: prevState.databases.filter((_, idx) => idx !== deleteTarget.index),
      };
    } else if (deleteTarget.type === 'workspace') {
      nextState = {
        ...prevState,
        workspaces: prevState.workspaces.filter((_, idx) => idx !== deleteTarget.index),
      };
    } else {
      nextState = {
        ...prevState,
        rest: prevState.rest.filter((_, idx) => idx !== deleteTarget.index),
      };
    }

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
        : panelMode === 'add-schema'
          ? 'Add schema'
          : panelMode === 'edit-schema'
            ? 'Edit schema'
            : panelMode === 'schema-detail'
              ? schemaDetailEntry
                ? `Schema: ${schemaDetailEntry.label?.trim() || schemaDetailEntry.id}`
                : 'Schema details'
              : panelMode === 'add-database'
              ? 'Add database resource'
              : panelMode === 'edit-database'
                ? 'Edit database resource'
                : panelMode === 'add-rest'
                  ? 'Add REST resource'
                  : panelMode === 'edit-rest'
                    ? 'Edit REST resource'
                    : panelMode === 'add-workspace'
                      ? 'Add flow workspace'
                      : panelMode === 'edit-workspace'
                        ? 'Edit flow workspace'
                        : panelMode === 'edit-flows'
                          ? 'Configure flows'
                          : panelMode === 'edit-infrastructure'
                            ? 'Configure infrastructure'
                            : panelMode === 'edit-agent'
                              ? 'Configure AI agent'
                              : 'Resource';
  const panelDescription = panelMode?.includes('filesystem')
    ? 'Configure filesystem resource fields used for file browsing.'
    : panelMode === 'add-schema' || panelMode === 'edit-schema'
      ? 'Path is relative to the config directory.'
      : panelMode === 'schema-detail' && schemaDetailEntry
        ? `${schemaDetailEntry.type} · ${schemaDetailEntry.source.path}`
        : panelMode?.includes('database')
        ? 'Configure database resource fields.'
        : panelMode?.includes('rest')
          ? 'Configure REST API endpoint with optional auth. Use a registered OpenAPI schema or a spec file path.'
        : panelMode?.includes('workspace')
          ? 'Flowpipe profile: named config for pipeline execution (host, port, etc.). Init adds block to flows/workspaces.fpc.'
          : panelMode === 'edit-flows'
            ? 'Flowpipe integration: flows directory and server URL.'
            : panelMode === 'edit-infrastructure'
              ? 'Terraform configuration directory for infrastructure as code.'
              : panelMode === 'edit-agent'
                ? 'AI agent settings for the chat interface.'
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
        {(panelMode === 'add-workspace' || panelMode === 'edit-workspace') && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>ID</Label>
              <Input
                value={workspaceDraft.id}
                onChange={(e) =>
                  setWorkspaceDraft((prev) => ({ ...prev, id: e.target.value }))
                }
                placeholder="default"
              />
            </div>
            <div className="space-y-1">
              <Label>Label</Label>
              <Input
                value={workspaceDraft.label}
                onChange={(e) =>
                  setWorkspaceDraft((prev) => ({ ...prev, label: e.target.value }))
                }
                placeholder="Default"
              />
            </div>
            <div className="space-y-1">
              <Label>Flowpipe URL</Label>
              <Input
                value={workspaceDraft.flowpipeUrl}
                onChange={(e) =>
                  setWorkspaceDraft((prev) => ({ ...prev, flowpipeUrl: e.target.value }))
                }
                placeholder="http://localhost:7103"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Flowpipe server URL. Written as host in flows/workspaces.fpc when profile is initialized.
              </p>
            </div>
          </div>
        )}

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

        {(panelMode === 'add-schema' || panelMode === 'edit-schema') && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>ID</Label>
              <Input
                value={schemaDraft.id}
                onChange={(e) =>
                  setSchemaDraft((prev) => ({ ...prev, id: e.target.value }))
                }
                placeholder="petstore-api"
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label>Label</Label>
              <Input
                value={schemaDraft.label}
                onChange={(e) =>
                  setSchemaDraft((prev) => ({ ...prev, label: e.target.value }))
                }
                placeholder="Petstore API"
              />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={schemaDraft.type}
                onValueChange={(v) =>
                  setSchemaDraft((prev) => ({
                    ...prev,
                    type: v as SchemaResourceEntry['type'],
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Schema type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openapi">openapi</SelectItem>
                  <SelectItem value="asyncapi">asyncapi</SelectItem>
                  <SelectItem value="json-schema">json-schema</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Source path</Label>
              <Input
                value={schemaDraft.source.path}
                onChange={(e) =>
                  setSchemaDraft((prev) => ({
                    ...prev,
                    source: { ...prev.source, path: e.target.value },
                  }))
                }
                placeholder="./workspace/rest/openapi.json"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Path to the schema file, relative to the Bench config directory.
              </p>
            </div>
          </div>
        )}

        {panelMode === 'schema-detail' && schemaDetailEntry && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/20 p-3 font-mono text-xs sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">ID</span>
                <p className="break-all">{schemaDetailEntry.id}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Label</span>
                <p>{schemaDetailEntry.label?.trim() || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Type</span>
                <p>{schemaDetailEntry.type}</p>
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Source path</span>
                <p className="break-all">{schemaDetailEntry.source.path}</p>
              </div>
            </div>

            {schemaDetailId === '' && (
              <p className="text-destructive text-sm">
                This schema has no ID. Set an ID in Edit schema to load content.
              </p>
            )}
            {schemaDetailLoading && (
              <p className="text-muted-foreground">Loading schema content...</p>
            )}
            {schemaDetailFetchError && (
              <p className="text-destructive">
                {schemaDetailFetchError instanceof Error
                  ? schemaDetailFetchError.message
                  : 'Failed to load schema content'}
              </p>
            )}
            {schemaDetailRaw != null && schemaDetailParsed && (
              <div className="rounded-lg border border-border bg-card p-4">
                {schemaDetailParsed.type === 'openapi' && (
                  <div className="space-y-4">
                    {schemaDetailParsed.data.groups.map((g) => (
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
                {schemaDetailParsed.type === 'asyncapi' && (
                  <div className="space-y-3">
                    <h3 className="font-medium">Channels</h3>
                    <ul className="space-y-2">
                      {schemaDetailParsed.data.operations.map((op, i) => (
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
                {schemaDetailParsed.type === 'json-schema' && (
                  <div className="space-y-2">
                    {schemaDetailParsed.data.title && (
                      <p className="font-medium">{schemaDetailParsed.data.title}</p>
                    )}
                    <p className="text-muted-foreground">Properties</p>
                    <ul className="list-inside list-disc font-mono text-xs">
                      {schemaDetailParsed.data.properties
                        ? Object.keys(schemaDetailParsed.data.properties).map((k) => (
                            <li key={k}>{k}</li>
                          ))
                        : null}
                    </ul>
                  </div>
                )}
                {schemaDetailParsed.type === 'unknown' && (
                  <p className="text-muted-foreground">Could not parse this schema for preview.</p>
                )}
              </div>
            )}
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
              <Label>OpenAPI schema (registry)</Label>
              <Select
                value={restDraft.schemaId?.trim() ? restDraft.schemaId : '__none__'}
                onValueChange={(v) =>
                  setRestDraft((prev) => ({
                    ...prev,
                    schemaId: v === '__none__' ? '' : v,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None (use path below)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (use path below)</SelectItem>
                  {state.schemas
                    .filter((s) => s.type === 'openapi')
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label?.trim() || s.id}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Use a registered OpenAPI schema (recommended) or specify a file path below. Registry schema
                takes precedence.
              </p>
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
                Path relative to config directory. Leave empty when using a registry schema above.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Auth type</Label>
              <Select
                value={restDraft.auth?.type ?? 'none'}
                onValueChange={(v) =>
                  setRestDraft((prev) => ({
                    ...prev,
                    auth: {
                      ...prev.auth,
                      type: v as RestAuthConfig['type'],
                    },
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="bearer">Bearer</SelectItem>
                  <SelectItem value="apiKey">API Key</SelectItem>
                </SelectContent>
              </Select>
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
                  <Select
                    value={restDraft.auth.in ?? 'header'}
                    onValueChange={(v) =>
                      setRestDraft((prev) => ({
                        ...prev,
                        auth: { ...prev.auth!, in: v },
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="header">Header</SelectItem>
                      <SelectItem value="query">Query</SelectItem>
                    </SelectContent>
                  </Select>
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
          </div>
        )}

        {panelMode === 'edit-infrastructure' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Infrastructure directory</Label>
              <Input
                value={infrastructureDraft.path}
                onChange={(e) =>
                  setInfrastructureDraft((prev) => ({ ...prev, path: e.target.value }))
                }
                placeholder="./workspace/infra"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Path for Terraform .tf files. Relative to config directory.
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

        {panelMode === 'edit-agent' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Endpoint</Label>
              <Input
                value={agentDraft.endpoint}
                onChange={(e) =>
                  setAgentDraft((prev) => ({ ...prev, endpoint: e.target.value }))
                }
                placeholder="http://localhost:3001"
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label>Working directory</Label>
              <Input
                value={agentDraft.workingDirectory}
                onChange={(e) =>
                  setAgentDraft((prev) => ({ ...prev, workingDirectory: e.target.value }))
                }
                placeholder="/home/user/bench/workspace"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Mandatory path where the agent will perform tasks.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Agent type</Label>
              <Select
                value={agentDraft.agent}
                onValueChange={(v) => setAgentDraft((prev) => ({ ...prev, agent: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cursor">Cursor</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Model (optional)</Label>
              <Input
                value={agentDraft.model}
                onChange={(e) =>
                  setAgentDraft((prev) => ({ ...prev, model: e.target.value }))
                }
                placeholder="gemini-2.0-flash"
                className="font-mono"
              />
            </div>
          </div>
        )}

        {panelError && <p className="mt-3 text-sm text-destructive">{panelError}</p>}
      </div>

      <div className="border-t px-4 py-3">
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" onClick={closePanel}>
            Cancel
          </Button>
          {panelMode === 'schema-detail' && panelIndex != null && (
            <Button onClick={() => openEditSchema(panelIndex)}>Edit schema</Button>
          )}
        {(panelMode === 'add-filesystem' || panelMode === 'edit-filesystem') && (
          <Button onClick={applyFilesystemDraft}>
              {panelMode === 'add-filesystem' ? 'Add' : 'Save changes'}
            </Button>
          )}
          {(panelMode === 'add-schema' || panelMode === 'edit-schema') && (
            <Button onClick={applySchemaDraft}>
              {panelMode === 'add-schema' ? 'Add' : 'Save changes'}
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
          {(panelMode === 'add-workspace' || panelMode === 'edit-workspace') && (
            <Button onClick={applyWorkspaceDraft}>
              {panelMode === 'add-workspace' ? 'Add' : 'Save changes'}
            </Button>
          )}
          {panelMode === 'edit-flows' && (
            <Button onClick={applyFlowsDraft}>Save changes</Button>
          )}
          {panelMode === 'edit-infrastructure' && (
            <Button onClick={applyInfrastructureDraft}>Save changes</Button>
          )}
          {panelMode === 'edit-agent' && (
            <Button onClick={applyAgentDraft}>Save changes</Button>
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
          'min-h-0 min-w-0 flex-1 overflow-auto p-4 md:p-6'
        )}
      >
        <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
          <Tabs
            value={resourceTab}
            onValueChange={(v) => setResourceTab(v as ResourceConfigTab)}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <TabsList variant="line" className="w-full shrink-0 flex-wrap justify-start gap-x-1">
              <TabsTrigger value="filesystem">Filesystem</TabsTrigger>
              <TabsTrigger value="schemas">Schemas</TabsTrigger>
              <TabsTrigger value="databases">Databases</TabsTrigger>
              <TabsTrigger value="rest">REST</TabsTrigger>
              <TabsTrigger value="flows">Flows</TabsTrigger>
              <TabsTrigger value="infrastructure">Infrastructure</TabsTrigger>
              <TabsTrigger value="agent">Agent</TabsTrigger>
            </TabsList>

            <TabsContent value="filesystem" className="mt-3 min-h-0 flex-1 overflow-auto">
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
            </TabsContent>

            <TabsContent value="schemas" className="mt-3 min-h-0 flex-1 overflow-auto">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-medium">Schemas</h3>
              <Button variant="outline" size="sm" onClick={openAddSchema}>
                <Plus className="size-4" />
                Add schema
              </Button>
            </div>
            {state.schemas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No schemas registered.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left font-medium">ID</th>
                      <th className="px-4 py-3 text-left font-medium">Label</th>
                      <th className="px-4 py-3 text-left font-medium">Type</th>
                      <th className="px-4 py-3 text-left font-medium">Source path</th>
                      <th className="w-28 px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {state.schemas.map((entry, index) => (
                      <tr
                        key={`schema-${index}`}
                        className="border-b border-border/50 last:border-b-0 cursor-pointer hover:bg-accent/30"
                        onClick={() => openSchemaDetail(index)}
                      >
                        <td className="px-4 py-2 font-mono">{entry.id}</td>
                        <td className="px-4 py-2">{entry.label || '—'}</td>
                        <td className="px-4 py-2 font-mono">{entry.type}</td>
                        <td className="px-4 py-2 font-mono">{entry.source.path}</td>
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => openEditSchema(index)}
                              aria-label={`Edit schema ${entry.id}`}
                            >
                              <Pencil className="size-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => openRemoveSchema(index)}
                              aria-label={`Remove schema ${entry.id}`}
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
            </TabsContent>

            <TabsContent value="databases" className="mt-3 min-h-0 flex-1 overflow-auto">
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
            </TabsContent>

            <TabsContent value="rest" className="mt-3 min-h-0 flex-1 overflow-auto">
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
                      <th className="px-4 py-3 text-left font-medium">Schema</th>
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
                        <td className="px-4 py-2 font-mono">{entry.schemaId?.trim() || '—'}</td>
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
            </TabsContent>

            <TabsContent value="flows" className="mt-3 min-h-0 flex-1 overflow-auto">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-medium">Flows</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={openAddWorkspace}>
                  <Plus className="size-4" />
                  Add workspace
                </Button>
                <Button variant="outline" size="sm" onClick={openEditFlows}>
                  <Pencil className="size-4" />
                  Configure
                </Button>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Path:</span>
                  <span className="font-mono">{state.flows.path || './flows'}</span>
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-medium">Workspaces</h4>
                {state.workspaces.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No profiles configured. Add Flowpipe workspace profiles for pipeline execution.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border bg-card">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="px-4 py-3 text-left font-medium">ID</th>
                          <th className="px-4 py-3 text-left font-medium">Label</th>
                          <th className="px-4 py-3 text-left font-medium">Flowpipe URL</th>
                          <th className="w-28 px-2 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {state.workspaces.map((entry, index) => (
                          <tr
                            key={`ws-${index}`}
                            className="border-b border-border/50 last:border-b-0 cursor-pointer hover:bg-accent/30"
                            onClick={() => openEditWorkspace(index)}
                          >
                            <td className="px-4 py-2 font-mono">{entry.id}</td>
                            <td className="px-4 py-2">{entry.label || '—'}</td>
                            <td className="px-4 py-2 font-mono text-xs">{entry.flowpipeUrl || '—'}</td>
                            <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => openEditWorkspace(index)}
                                  aria-label={`Edit workspace ${entry.id}`}
                                >
                                  <Pencil className="size-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => openRemoveWorkspace(index)}
                                  aria-label={`Remove workspace ${entry.id}`}
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
              </div>
            </div>
          </section>
            </TabsContent>

            <TabsContent value="infrastructure" className="mt-3 min-h-0 flex-1 overflow-auto">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-medium">Infrastructure</h3>
              <Button variant="outline" size="sm" onClick={openEditInfrastructure}>
                <Pencil className="size-4" />
                Configure
              </Button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground">Path:</span>
                <span className="font-mono">{state.infrastructure.path || './workspace/infra'}</span>
              </div>
              <p className="text-muted-foreground">
                Terraform configuration directory for infrastructure as code.
              </p>
            </div>
          </section>
            </TabsContent>

            <TabsContent value="agent" className="mt-3 min-h-0 flex-1 overflow-auto">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-medium">AI Agent</h3>
              <Button variant="outline" size="sm" onClick={openEditAgent}>
                <Pencil className="size-4" />
                Configure
              </Button>
            </div>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Endpoint:</span>
                  <span className="font-mono">{state.agent.endpoint}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="capitalize">{state.agent.agent}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Directory:</span>
                  <span className="font-mono truncate" title={state.agent.workingDirectory}>
                    {state.agent.workingDirectory || '—'}
                  </span>
                </div>
                {state.agent.model && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground">Model:</span>
                    <span className="font-mono">{state.agent.model}</span>
                  </div>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                AI agent configuration for the persistent chat and automated tasks.
              </p>
            </div>
          </section>
            </TabsContent>
          </Tabs>

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
          'bg-sidebar text-sidebar-foreground relative z-20 hidden min-h-0 flex-col overflow-auto border-l lg:flex',
          panelOpen ? 'lg:flex' : 'lg:hidden',
          panelMode === 'schema-detail' ? 'lg:w-[min(560px,50vw)]' : 'lg:w-[360px]'
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
                : deleteTarget?.type === 'schema'
                  ? `Remove schema "${state.schemas[deleteTarget.index]?.id}"?`
                  : deleteTarget?.type === 'workspace'
                    ? `Remove flow profile "${state.workspaces[deleteTarget.index]?.id}"?`
                    : 'Remove selected resource?'
        }
        onConfirm={confirmRemove}
        confirmLabel="Remove"
      />
    </div>
  );
}
