import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import {
  AgentConfigFields,
  DatabaseResourceFields,
  FilesystemResourceFields,
  FlowsConfigFields,
  InfrastructurePathFields,
  RestResourceFields,
  SchemaDetailPreview,
  SchemaResourceFields,
  WorkspaceResourceFields,
} from '@/components/resource-config';
import { ContextPanel } from '@/components/context-panel';
import { BENCH_CLOSE_PANEL_EVENT } from '@/lib/bench-close-panel';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { fetchSchemaContent } from '@/services/api';
import { detectSchemaType, parseSchema } from '@/lib/schema-registry';
import {
  emptyState,
  parseConfigToState,
  useResourceConfig,
  type AgentConfig,
  type DatabaseResource,
  type FilesystemResource,
  type FlowsConfig,
  type InfrastructureConfig,
  type ResourceFormState,
  type RestResource,
  type SchemaResourceEntry,
  type WorkspaceResource,
} from '@/lib/resource-config';

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

export function ConfigurationPage() {
  const {
    data: rawConfig,
    isPending,
    error: queryError,
    persistState: persistConfigToServer,
  } = useResourceConfig();
  const [draft, setDraft] = useState<ResourceFormState | null>(null);
  const state = useMemo(() => {
    if (draft !== null) return draft;
    if (rawConfig !== undefined) return parseConfigToState(rawConfig);
    return emptyState();
  }, [draft, rawConfig]);
  const [error, setError] = useState<string | null>(null);
  const loadErrorMessage =
    queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null;
  const displayError = error ?? loadErrorMessage;
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
    await persistConfigToServer(newState);
  };

  useEffect(() => {
    const handleClosePanel = () => {
      if (panelMode != null) {
        setPanelMode(null);
        setPanelIndex(null);
        setPanelError(null);
      }
    };
    window.addEventListener(BENCH_CLOSE_PANEL_EVENT, handleClosePanel);
    return () => window.removeEventListener(BENCH_CLOSE_PANEL_EVENT, handleClosePanel);
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

    setDraft(nextState);
    try {
      await persistState(nextState);
      closePanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setDraft(prevState);
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

    setDraft(nextState);
    try {
      await persistState(nextState);
      closePanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setDraft(prevState);
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

    setDraft(nextState);
    try {
      await persistState(nextState);
      closePanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setDraft(prevState);
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

    setDraft(nextState);
    try {
      await persistState(nextState);
      closePanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setDraft(prevState);
    }
  };

  const applyFlowsDraft = async () => {
    const path = flowsDraft.path.trim() || './flows';

    const prevState = state;
    const nextState = {
      ...prevState,
      flows: { path },
    };

    setDraft(nextState);
    try {
      await persistState(nextState);
      closePanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setDraft(prevState);
    }
  };

  const applyInfrastructureDraft = async () => {
    const path = infrastructureDraft.path.trim() || './workspace/infra';

    const prevState = state;
    const nextState = {
      ...prevState,
      infrastructure: { path },
    };

    setDraft(nextState);
    try {
      await persistState(nextState);
      closePanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setDraft(prevState);
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

    setDraft(nextState);
    try {
      await persistState(nextState);
      closePanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setDraft(prevState);
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

    setDraft(nextState);
    try {
      await persistState(nextState);
      closePanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setDraft(prevState);
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

    setDraft(nextState);
    setDeleteTarget(null);
    try {
      await persistState(nextState);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setDraft(prevState);
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
          ? 'Flowpipe profile: id, label, and server URL.'
          : panelMode === 'edit-flows'
            ? 'Flowpipe integration: flows directory and server URL.'
            : panelMode === 'edit-infrastructure'
              ? 'Terraform configuration directory for infrastructure as code.'
              : panelMode === 'edit-agent'
                ? 'AI agent settings for the chat interface.'
                : '';

  const panelBody = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        {(panelMode === 'add-workspace' || panelMode === 'edit-workspace') && (
          <WorkspaceResourceFields draft={workspaceDraft} onChange={setWorkspaceDraft} />
        )}

        {(panelMode === 'add-filesystem' || panelMode === 'edit-filesystem') && (
          <FilesystemResourceFields draft={filesystemDraft} onChange={setFilesystemDraft} />
        )}

        {(panelMode === 'add-schema' || panelMode === 'edit-schema') && (
          <SchemaResourceFields draft={schemaDraft} onChange={setSchemaDraft} />
        )}

        {panelMode === 'schema-detail' && schemaDetailEntry && (
          <SchemaDetailPreview
            entry={schemaDetailEntry}
            schemaId={schemaDetailId}
            loading={schemaDetailLoading}
            fetchError={schemaDetailFetchError}
            raw={schemaDetailRaw}
            parsed={schemaDetailParsed}
          />
        )}

        {(panelMode === 'add-rest' || panelMode === 'edit-rest') && (
          <RestResourceFields
            draft={restDraft}
            onChange={setRestDraft}
            openapiSchemas={state.schemas.filter((s) => s.type === 'openapi')}
          />
        )}

        {panelMode === 'edit-flows' && (
          <FlowsConfigFields draft={flowsDraft} onChange={setFlowsDraft} />
        )}

        {panelMode === 'edit-infrastructure' && (
          <InfrastructurePathFields draft={infrastructureDraft} onChange={setInfrastructureDraft} />
        )}

        {(panelMode === 'add-database' || panelMode === 'edit-database') && (
          <DatabaseResourceFields draft={databaseDraft} onChange={setDatabaseDraft} />
        )}

        {panelMode === 'edit-agent' && (
          <AgentConfigFields draft={agentDraft} onChange={setAgentDraft} />
        )}

        {panelError && <p className="mt-3 text-sm text-destructive">{panelError}</p>}
      </div>

      <div className="shrink-0 border-t border-sidebar-border px-4 py-3">
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
    </div>
  );

  if (isPending) {
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
          <section className="flex flex-col gap-4 p-4">
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
          <section className="flex flex-col gap-4 p-4">
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
          <section className="flex flex-col gap-4 p-4">
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
          <section className="flex flex-col gap-4 p-4">
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
          <section className="flex flex-col gap-4 p-4">
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
          <section className="flex flex-col gap-4 p-4">
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
          <section className="flex flex-col gap-4 p-4">
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

          {displayError && <p className="text-sm text-destructive">{displayError}</p>}
        </div>
      </div>

      <ContextPanel
        expanded={panelOpen}
        storageKey="bench-configuration-panel-width"
        minWidth={320}
        maxWidth={800}
        defaultWidth={panelMode === 'schema-detail' ? 560 : 360}
        mobileVariant="below-header"
      >
        {panelBody}
      </ContextPanel>

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
