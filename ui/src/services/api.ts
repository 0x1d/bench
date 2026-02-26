const API_BASE = '/api';

export interface HealthStatus {
  status: string;
  version: string;
}

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
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
