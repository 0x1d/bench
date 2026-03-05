const API_BASE = '/api';

export interface HealthStatus {
  status: string;
  version: string;
}

export interface FilesystemPath {
  id: string;
  label: string;
  path: string;
  available?: boolean;
  error?: string;
}

export interface StatusResponse {
  filesystem: {
    configured: boolean;
    paths: FilesystemPath[];
  };
  database?: {
    configured: boolean;
    defaultId?: string;
    databases?: {
      id: string;
      label: string;
      enabled: boolean;
      isDefault: boolean;
      connected: boolean;
      error?: string;
    }[];
  };
  rest?: {
    configured: boolean;
    count: number;
  };
  flows?: {
    configured: boolean;
    count: number;
    flowpipeHealthy: boolean;
  };
}

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function fetchStatus(): Promise<StatusResponse> {
  const response = await fetch(`${API_BASE}/status`);
  if (!response.ok) {
    throw new Error(`Status check failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function uploadConfig(file: File): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/config`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Upload failed: ${response.status}`);
  }
}

export async function fetchConfigExample(): Promise<string> {
  const response = await fetch(`${API_BASE}/config/example`);
  if (!response.ok) {
    throw new Error(`Failed to fetch example: ${response.status}`);
  }
  return response.text();
}

export async function fetchConfig(): Promise<string> {
  const response = await fetch(`${API_BASE}/config`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to fetch config: ${response.status}`);
  }
  return response.text();
}

export async function saveConfig(content: string): Promise<void> {
  const response = await fetch(`${API_BASE}/config/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/yaml; charset=utf-8' },
    body: content,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Save failed: ${response.status}`);
  }
}

// Resource types
export interface ResourceRoot {
  id: string;
  label: string;
}

export interface ResourceEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  mtime?: number;
}

export interface ResourceListResponse {
  entries: ResourceEntry[];
  roots: ResourceRoot[];
}

export interface TreeEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  mtime?: number;
  children?: TreeEntry[];
}

export interface TreeResponse {
  entries: TreeEntry[];
  roots: ResourceRoot[];
}

export interface RootsResponse {
  roots: ResourceRoot[];
}

export async function fetchRoots(): Promise<RootsResponse> {
  const response = await fetch(`${API_BASE}/resources/roots`);
  if (!response.ok) {
    throw new Error(`Failed to fetch roots: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function fetchResourceList(
  root: string,
  path: string
): Promise<ResourceListResponse> {
  const params = new URLSearchParams({ root, path: path || '.' });
  const response = await fetch(`${API_BASE}/resources?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to list resources: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function fetchResourceTree(
  root: string,
  path: string
): Promise<TreeResponse> {
  const params = new URLSearchParams({ root, path: path || '.', recursive: 'true' });
  const response = await fetch(`${API_BASE}/resources?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to list tree: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function downloadFile(root: string, path: string): Promise<Blob> {
  const params = new URLSearchParams({ root, path });
  const response = await fetch(`${API_BASE}/resources/download?${params}`);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }
  return response.blob();
}

/** Tries to download a file. Returns null if not found (404). */
export async function downloadFileIfExists(
  root: string,
  path: string
): Promise<Blob | null> {
  const params = new URLSearchParams({ root, path });
  const response = await fetch(`${API_BASE}/resources/download?${params}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }
  return response.blob();
}

/**
 * Returns cache paths to try for a preview.
 * Images: dir/.cache/thumbnails/{base}_thumb.jpg
 * Videos: dir/.cache/thumbnails/{base}_thumb_1.jpg (first frame)
 */
export function getPreviewCachePaths(filePath: string, isVideo: boolean): string[] {
  const parts = filePath.split('/').filter(Boolean);
  const name = parts.pop() ?? filePath;
  const dir = parts.length > 0 ? parts.join('/') : '.';
  const base = name.replace(/\.[^.]+$/, '');

  const thumbDir = `${dir}/.cache/thumbnails`;
  if (isVideo) {
    return [
      `${thumbDir}/${base}_thumb_1.jpg`,
      `${thumbDir}/${base}_thumb_1.png`,
      `${thumbDir}/${base}_thumb.jpg`,
      `${thumbDir}/${base}-poster.jpg`,
    ];
  }
  return [`${thumbDir}/${base}_thumb.jpg`];
}

/** Paths to try for video thumbnail at index (1-based). e.g. filename_thumb_2.jpg */
export function getVideoThumbPaths(filePath: string, index: number): string[] {
  const parts = filePath.split('/').filter(Boolean);
  const name = parts.pop() ?? filePath;
  const dir = parts.length > 0 ? parts.join('/') : '.';
  const base = name.replace(/\.[^.]+$/, '');
  return [
    `${dir}/.cache/thumbnails/${base}_thumb_${index}.jpg`,
    `${dir}/.cache/thumbnails/${base}_thumb_${index}.png`,
  ];
}

export async function uploadFile(
  root: string,
  path: string,
  file: File
): Promise<void> {
  const params = new URLSearchParams({ root, path: path || '.' });
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/resources?${params}`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Upload failed: ${response.status}`);
  }
}

/** Upload with progress callback via XMLHttpRequest. */
export function uploadFileWithProgress(
  root: string,
  path: string,
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const params = new URLSearchParams({ root, path: path || '.' });
    xhr.open('POST', `${API_BASE}/resources?${params}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(xhr.responseText || `Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));

    if (signal) {
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

/** Save text content to an existing file. Overwrites the file. */
export async function saveFile(
  root: string,
  path: string,
  content: string
): Promise<void> {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop() ?? path;
  const dirPath = parts.length > 0 ? parts.join('/') : '.';
  const file = new File([content], name, { type: 'text/plain' });
  return uploadFile(root, dirPath, file);
}

export async function createFolder(
  root: string,
  path: string,
  name: string
): Promise<void> {
  const params = new URLSearchParams({ root, path: path || '.' });
  const response = await fetch(`${API_BASE}/resources?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'mkdir', name }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Create folder failed: ${response.status}`);
  }
}

export async function renameResource(
  root: string,
  path: string,
  newName: string
): Promise<void> {
  const response = await fetch(`${API_BASE}/resources`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ root, path, newName }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Rename failed: ${response.status}`);
  }
}

export async function moveResource(
  root: string,
  path: string,
  destination: string
): Promise<void> {
  const response = await fetch(`${API_BASE}/resources`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ root, path, destination }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Move failed: ${response.status}`);
  }
}

export async function deleteResource(root: string, path: string): Promise<void> {
  const params = new URLSearchParams({ root, path });
  const response = await fetch(`${API_BASE}/resources?${params}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Delete failed: ${response.status}`);
  }
}

// Database types and API
export interface TableInfo {
  name: string;
  rows?: number;
}

export interface ForeignKeyRef {
  table: string;
  column: string;
  multiple?: boolean;
}

export interface TableSchemaResponse {
  columns: {
    name: string;
    dataType: string;
    required?: boolean;
    autoIncrement?: boolean;
    primaryKey?: boolean;
    references?: ForeignKeyRef;
  }[];
}

export interface TablesResponse {
  tables: TableInfo[];
}

export interface TableDataResponse {
  columns: string[];
  rows: unknown[][];
  total: number;
}

export interface CreateTableRequest {
  name: string;
  columns: {
    name: string;
    dataType: string;
    required?: boolean;
    autoIncrement?: boolean;
    primaryKey?: boolean;
    references?: ForeignKeyRef;
  }[];
}

export interface AlterTableRequest {
  columns: {
    name: string;
    dataType: string;
    required?: boolean;
    autoIncrement?: boolean;
    primaryKey?: boolean;
    references?: ForeignKeyRef;
  }[];
}

export interface QueryResponse {
  columns: string[];
  rows: unknown[][];
}

export interface QueryRowsAffectedResponse {
  rowsAffected: number;
}

export async function fetchDatabaseTables(dbId?: string): Promise<TablesResponse> {
  const response = await fetch(withDbQuery(`${API_BASE}/database/tables`, dbId));
  if (!response.ok) {
    throw new Error(`Failed to fetch tables: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export interface TableLookupResponse {
  columns: string[];
  rows: unknown[][];
  total: number;
}

export async function fetchTableLookup(
  tableName: string,
  valueColumn: string,
  search: string,
  limit = 50,
  dbId?: string
): Promise<TableLookupResponse> {
  const params = new URLSearchParams({
    column: valueColumn,
    limit: String(limit),
  });
  if (search) params.set('search', search);
  const response = await fetch(withDbParams(`${API_BASE}/database/tables/${encodeURIComponent(tableName)}/lookup`, params, dbId));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to fetch lookup: ${response.status}`);
  }
  return response.json();
}

export async function fetchTableSchema(tableName: string, dbId?: string): Promise<TableSchemaResponse> {
  const response = await fetch(withDbQuery(`${API_BASE}/database/schema/${encodeURIComponent(tableName)}`, dbId));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to fetch schema: ${response.status}`);
  }
  return response.json();
}

export async function insertRow(tableName: string, row: Record<string, unknown>, dbId?: string): Promise<void> {
  const response = await fetch(withDbQuery(`${API_BASE}/database/tables/${encodeURIComponent(tableName)}/rows`, dbId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to insert row: ${response.status}`);
  }
}

export async function fetchTableData(
  tableName: string,
  limit = 20,
  offset = 0,
  search = '',
  dbId?: string
): Promise<TableDataResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (search) params.set('search', search);
  const response = await fetch(withDbParams(`${API_BASE}/database/tables/${encodeURIComponent(tableName)}`, params, dbId));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to fetch table data: ${response.status}`);
  }
  return response.json();
}

export async function createTable(req: CreateTableRequest, dbId?: string): Promise<void> {
  const response = await fetch(withDbQuery(`${API_BASE}/database/tables`, dbId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to create table: ${response.status}`);
  }
}

export async function alterTable(tableName: string, req: AlterTableRequest, dbId?: string): Promise<void> {
  const response = await fetch(withDbQuery(`${API_BASE}/database/tables/${encodeURIComponent(tableName)}`, dbId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to alter table: ${response.status}`);
  }
}

export async function updateRow(
  tableName: string,
  where: Record<string, unknown>,
  set: Record<string, unknown>,
  dbId?: string
): Promise<void> {
  const response = await fetch(withDbQuery(`${API_BASE}/database/tables/${encodeURIComponent(tableName)}/rows`, dbId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where, set }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to update row: ${response.status}`);
  }
}

export async function deleteRow(
  tableName: string,
  where: Record<string, unknown>,
  dbId?: string
): Promise<void> {
  const response = await fetch(withDbQuery(`${API_BASE}/database/tables/${encodeURIComponent(tableName)}/rows`, dbId), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to delete row: ${response.status}`);
  }
}

export interface DropTableOptions {
  cascade?: boolean;
}

export async function dropTable(
  tableName: string,
  dbId?: string,
  options?: DropTableOptions
): Promise<void> {
  const params = new URLSearchParams();
  if (options?.cascade) {
    params.set('cascade', 'true');
  }
  const response = await fetch(
    withDbParams(`${API_BASE}/database/tables/${encodeURIComponent(tableName)}`, params, dbId),
    {
      method: 'DELETE',
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to drop table: ${response.status}`);
  }
}

export async function executeQuery(sql: string, dbId?: string): Promise<QueryResponse | QueryRowsAffectedResponse> {
  const response = await fetch(withDbQuery(`${API_BASE}/database/query`, dbId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to execute query: ${response.status}`);
  }
  return response.json();
}

function withDbQuery(url: string, dbId?: string): string {
  if (!dbId) return url;
  const params = new URLSearchParams({ db: dbId });
  return `${url}?${params.toString()}`;
}

function withDbParams(url: string, params: URLSearchParams, dbId?: string): string {
  if (dbId) {
    params.set('db', dbId);
  }
  const query = params.toString();
  return query ? `${url}?${query}` : url;
}

// REST resource types and API
export interface RestResource {
  id: string;
  label: string;
  baseUrl: string;
  openapiSpec?: string;
}

export interface RestListResponse {
  resources: RestResource[];
}

export async function fetchRestList(): Promise<RestListResponse> {
  const response = await fetch(`${API_BASE}/rest`);
  if (!response.ok) {
    throw new Error(`Failed to fetch REST resources: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function fetchRestSpec(id: string): Promise<string> {
  const response = await fetch(`${API_BASE}/rest/${encodeURIComponent(id)}/spec`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to fetch spec: ${response.status}`);
  }
  return response.text();
}

export interface RestProxyRequest {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string | null;
}

export async function fetchRestProxy(
  id: string,
  req: RestProxyRequest
): Promise<Response> {
  const response = await fetch(`${API_BASE}/rest/${encodeURIComponent(id)}/proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: req.method,
      path: req.path,
      headers: req.headers ?? {},
      body: req.body ?? null,
    }),
  });
  return response;
}

// Flow types and API
export interface FlowStepPosition {
  x: number;
  y: number;
}

export interface FlowStep {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  dependsOn?: string[];
  position?: FlowStepPosition;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

export interface Flow {
  id: string;
  name: string;
  description?: string;
  steps: FlowStep[];
  edges?: FlowEdge[];
}

export interface FlowListResponse {
  flows: Flow[];
}

export interface FlowWorkspace {
  id: string;
  label: string;
  path: string;
}

export interface FlowWorkspacesResponse {
  workspaces: FlowWorkspace[];
}

export interface FlowWorkspaceEntry {
  name: string;
  path: string;
  type: 'module' | 'flow';
  steps?: number;
  mtime?: number;
}

export interface FlowWorkspaceTreeEntry extends FlowWorkspaceEntry {
  children?: FlowWorkspaceTreeEntry[];
}

export interface FlowWorkspaceEntriesResponse {
  entries: FlowWorkspaceEntry[];
}

export interface FlowWorkspaceTreeResponse {
  entries: FlowWorkspaceTreeEntry[];
}

export async function fetchFlowWorkspaces(): Promise<FlowWorkspacesResponse> {
  const response = await fetch(`${API_BASE}/flows/workspaces`);
  if (!response.ok) {
    throw new Error(`Failed to fetch workspaces: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function fetchFlowEntries(path = '.'): Promise<FlowWorkspaceEntriesResponse> {
  const params = new URLSearchParams({ path });
  const response = await fetch(`${API_BASE}/flows/entries?${params}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to fetch entries: ${response.status}`);
  }
  return response.json();
}

export async function fetchFlowTree(path = '.'): Promise<FlowWorkspaceTreeResponse> {
  const params = new URLSearchParams({ path, recursive: 'true' });
  const response = await fetch(`${API_BASE}/flows/entries?${params}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to fetch flow tree: ${response.status}`);
  }
  return response.json();
}

export async function moveFlow(
  id: string,
  fromModule: string,
  toModule: string
): Promise<void> {
  const response = await fetch(`${API_BASE}/flows/${encodeURIComponent(id)}/move`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromModule: fromModule || '.',
      toModule: toModule || '.',
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to move flow: ${response.status}`);
  }
}

export interface FlowModuleMeta {
  title: string;
  description: string;
}

export async function fetchFlowModule(path: string): Promise<FlowModuleMeta> {
  const params = new URLSearchParams({ path });
  const response = await fetch(`${API_BASE}/flows/module?${params}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to fetch module: ${response.status}`);
  }
  return response.json();
}

export async function updateFlowModule(
  path: string,
  meta: FlowModuleMeta
): Promise<FlowModuleMeta> {
  const params = new URLSearchParams({ path });
  const response = await fetch(`${API_BASE}/flows/module?${params}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to update module: ${response.status}`);
  }
  return response.json();
}

export async function createFlowModule(name: string): Promise<void> {
  const response = await fetch(`${API_BASE}/flows/modules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to create module: ${response.status}`);
  }
}

export async function fetchFlowList(module?: string): Promise<FlowListResponse> {
  const params = new URLSearchParams();
  if (module) params.set('module', module);
  const qs = params.toString();
  const url = qs ? `${API_BASE}/flows?${qs}` : `${API_BASE}/flows`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch flows: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function fetchFlow(id: string, module?: string): Promise<Flow> {
  const params = new URLSearchParams();
  if (module) params.set('module', module);
  const qs = params.toString();
  const url = qs
    ? `${API_BASE}/flows/${encodeURIComponent(id)}?${qs}`
    : `${API_BASE}/flows/${encodeURIComponent(id)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to fetch flow: ${response.status}`);
  }
  return response.json();
}

export async function createFlow(
  flow: Partial<Flow>,
  module?: string
): Promise<Flow> {
  const params = new URLSearchParams();
  if (module) params.set('module', module);
  const qs = params.toString();
  const url = qs ? `${API_BASE}/flows?${qs}` : `${API_BASE}/flows`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(flow),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to create flow: ${response.status}`);
  }
  return response.json();
}

export async function updateFlow(
  id: string,
  flow: Partial<Flow>,
  module?: string
): Promise<Flow> {
  const params = new URLSearchParams();
  if (module) params.set('module', module);
  const qs = params.toString();
  const url = qs
    ? `${API_BASE}/flows/${encodeURIComponent(id)}?${qs}`
    : `${API_BASE}/flows/${encodeURIComponent(id)}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...flow, id }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to update flow: ${response.status}`);
  }
  return response.json();
}

export async function deleteFlow(id: string, module?: string): Promise<void> {
  const params = new URLSearchParams();
  if (module) params.set('module', module);
  const qs = params.toString();
  const url = qs
    ? `${API_BASE}/flows/${encodeURIComponent(id)}?${qs}`
    : `${API_BASE}/flows/${encodeURIComponent(id)}`;
  const response = await fetch(url, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to delete flow: ${response.status}`);
  }
}

export async function runFlow(
  id: string,
  args?: Record<string, unknown>,
  runOpts?: { workspace?: string; module?: string }
): Promise<unknown> {
  const params = new URLSearchParams();
  if (runOpts?.workspace) params.set('workspace', runOpts.workspace);
  if (runOpts?.module) params.set('module', runOpts.module);
  const qs = params.toString();
  const url = qs
    ? `${API_BASE}/flows/${encodeURIComponent(id)}/run?${qs}`
    : `${API_BASE}/flows/${encodeURIComponent(id)}/run`;
  const fetchOpts: RequestInit = {
    method: 'POST',
  };
  if (args && Object.keys(args).length > 0) {
    fetchOpts.headers = { 'Content-Type': 'application/json' };
    fetchOpts.body = JSON.stringify({ args });
  }
  const response = await fetch(url, fetchOpts);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to run flow: ${response.status}`);
  }
  // Try to parse JSON, fall back to text
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return { output: await response.text() };
}

export async function fetchFlowProcesses(workspace?: string): Promise<unknown> {
  const params = new URLSearchParams();
  if (workspace) params.set('workspace', workspace);
  const qs = params.toString();
  const url = qs ? `${API_BASE}/flows/processes?${qs}` : `${API_BASE}/flows/processes`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch processes: ${response.status}`);
  }
  return response.json();
}

export async function fetchFlowExecution(
  executionId: string,
  workspace?: string
): Promise<unknown> {
  const params = new URLSearchParams();
  if (workspace) params.set('workspace', workspace);
  const qs = params.toString();
  const url = qs
    ? `${API_BASE}/flows/executions/${encodeURIComponent(executionId)}?${qs}`
    : `${API_BASE}/flows/executions/${encodeURIComponent(executionId)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch execution: ${response.status}`);
  }
  return response.json();
}
