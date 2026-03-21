export interface FilesystemResource {
  id: string;
  label: string;
  path: string;
}

export interface DatabaseResource {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  default: boolean;
}

export interface RestAuthConfig {
  type: 'none' | 'basic' | 'bearer' | 'apiKey';
  username?: string;
  password?: string;
  token?: string;
  name?: string;
  in?: string;
  value?: string;
}

export interface RestResource {
  id: string;
  label: string;
  baseUrl: string;
  /** Registered OpenAPI schema id; takes precedence over openapiSpec when set. */
  schemaId?: string;
  openapiSpec: string;
  auth?: RestAuthConfig;
}

export interface SchemaResourceEntry {
  id: string;
  label: string;
  type: 'openapi' | 'asyncapi' | 'json-schema';
  source: { path: string };
}

export interface FlowsConfig {
  path: string;
}

export interface InfrastructureConfig {
  path: string;
}

export interface AgentConfig {
  endpoint: string;
  workingDirectory: string;
  agent: string;
  model: string;
}

export interface WorkspaceResource {
  id: string;
  label: string;
  flowpipeUrl: string;
}

export interface ResourceFormState {
  filesystem: FilesystemResource[];
  schemas: SchemaResourceEntry[];
  databases: DatabaseResource[];
  rest: RestResource[];
  workspaces: WorkspaceResource[];
  flows: FlowsConfig;
  infrastructure: InfrastructureConfig;
  agent: AgentConfig;
}
