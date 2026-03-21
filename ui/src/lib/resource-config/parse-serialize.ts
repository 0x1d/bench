import yaml from 'js-yaml';
import type {
  AgentConfig,
  DatabaseResource,
  FilesystemResource,
  FlowsConfig,
  InfrastructureConfig,
  ResourceFormState,
  RestAuthConfig,
  RestResource,
  SchemaResourceEntry,
  WorkspaceResource,
} from './types';

export function emptyState(): ResourceFormState {
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

export function parseConfigToState(rawConfig: string): ResourceFormState {
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

  const filesystem: FilesystemResource[] = (parsed.resources?.filesystem ?? []).map((entry) => ({
    id: entry.id ?? '',
    label: entry.label ?? '',
    path: entry.path ?? '',
  }));

  const schemas: SchemaResourceEntry[] = (parsed.resources?.schemas ?? []).map((entry) => {
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

  const databases: DatabaseResource[] = (parsed.resources?.databases ?? []).map((entry) => ({
    id: entry.id ?? '',
    label: entry.label ?? '',
    url: entry.url ?? '',
    enabled: entry.enabled ?? true,
    default: entry.default ?? false,
  }));

  const rest: RestResource[] = (parsed.resources?.rest ?? []).map((entry) => ({
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

  const workspaces: WorkspaceResource[] = (parsed.flows?.workspaces ?? []).map((entry) => ({
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

/** Serializes resource form state to YAML (full config document). */
export function stateToConfig(state: ResourceFormState): string {
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
