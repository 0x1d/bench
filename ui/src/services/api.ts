const API_BASE = '/api';

export interface HealthStatus {
  status: string;
  version: string;
}

export interface FilesystemPath {
  id: string;
  label: string;
  path: string;
}

export interface StatusResponse {
  filesystem: {
    configured: boolean;
    paths: FilesystemPath[];
  };
  database?: {
    configured: boolean;
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

export async function fetchDatabaseTables(): Promise<TablesResponse> {
  const response = await fetch(`${API_BASE}/database/tables`);
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
  limit = 50
): Promise<TableLookupResponse> {
  const params = new URLSearchParams({
    column: valueColumn,
    limit: String(limit),
  });
  if (search) params.set('search', search);
  const response = await fetch(
    `${API_BASE}/database/tables/${encodeURIComponent(tableName)}/lookup?${params}`
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to fetch lookup: ${response.status}`);
  }
  return response.json();
}

export async function fetchTableSchema(tableName: string): Promise<TableSchemaResponse> {
  const response = await fetch(`${API_BASE}/database/schema/${encodeURIComponent(tableName)}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to fetch schema: ${response.status}`);
  }
  return response.json();
}

export async function insertRow(tableName: string, row: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${API_BASE}/database/tables/${encodeURIComponent(tableName)}/rows`, {
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
  search = ''
): Promise<TableDataResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (search) params.set('search', search);
  const response = await fetch(`${API_BASE}/database/tables/${encodeURIComponent(tableName)}?${params}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to fetch table data: ${response.status}`);
  }
  return response.json();
}

export async function createTable(req: CreateTableRequest): Promise<void> {
  const response = await fetch(`${API_BASE}/database/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to create table: ${response.status}`);
  }
}

export async function alterTable(tableName: string, req: AlterTableRequest): Promise<void> {
  const response = await fetch(`${API_BASE}/database/tables/${encodeURIComponent(tableName)}`, {
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
  set: Record<string, unknown>
): Promise<void> {
  const response = await fetch(`${API_BASE}/database/tables/${encodeURIComponent(tableName)}/rows`, {
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
  where: Record<string, unknown>
): Promise<void> {
  const response = await fetch(`${API_BASE}/database/tables/${encodeURIComponent(tableName)}/rows`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to delete row: ${response.status}`);
  }
}

export async function dropTable(tableName: string): Promise<void> {
  const response = await fetch(`${API_BASE}/database/tables/${encodeURIComponent(tableName)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to drop table: ${response.status}`);
  }
}

export async function executeQuery(sql: string): Promise<QueryResponse | QueryRowsAffectedResponse> {
  const response = await fetch(`${API_BASE}/database/query`, {
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
