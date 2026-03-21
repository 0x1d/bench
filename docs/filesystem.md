# Filesystem Browser

The bench Filesystem page provides a file browser for configured directory roots. It supports listing, downloading, uploading, creating folders, renaming, and deleting files and directories.

## Overview

Resource roots are defined in `config.yaml` under `resources.filesystem`. Each root has an `id`, `label`, and `path`. The API operates on paths relative to each root; path traversal (`..`) is blocked to keep access within the root.

## Configuration

In `config.yaml`:

```yaml
resources:
  filesystem:
    - id: default
      label: My Data
      path: /path/to/your/data
    - id: workflows
      label: Workflows
      path: /path/to/workflows
```

- **id** — Unique identifier used in API requests
- **label** — Display name in the UI
- **path** — Absolute or relative path (relative to the config file location)

If no roots are configured, the Filesystem page shows a setup message.

## API Reference

All endpoints require the `X-API-Token` header. Base path: **`/api/configuration`**. The same handlers are also mounted at **`/api/resources`** for backward compatibility.

### Roots

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/configuration/roots` | List configured roots (id and label only) |

**Response:** `{ "roots": [{ "id": string, "label": string }] }`

Root paths are never exposed to the client.

### List Directory

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/configuration` | List directory contents |

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `root` | string | required | Root id |
| `path` | string | `.` | Relative path within the root |

**Response:**

```json
{
  "entries": [
    {
      "name": "file.txt",
      "path": "file.txt",
      "isDir": false,
      "size": 1024,
      "mtime": 1709123456
    },
    {
      "name": "subdir",
      "path": "subdir",
      "isDir": true,
      "mtime": 1709123400
    }
  ],
  "roots": [{ "id": "default", "label": "My Data" }]
}
```

- **name** — File or directory name
- **path** — Relative path from the current directory
- **isDir** — `true` for directories
- **size** — File size in bytes (directories omit this)
- **mtime** — Modification time (Unix timestamp)

Listings are capped at 1000 entries.

### Download File

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/configuration/download` | Stream a file for download |

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `root` | string | Root id |
| `path` | string | Relative path to the file (required) |

**Response:** Binary stream with `Content-Disposition: attachment` and `Content-Type: application/octet-stream`.

### Upload File

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/configuration` | Upload a file (multipart) |

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `root` | string | required | Root id |
| `path` | string | `.` | Target directory (relative) |

**Request:** `multipart/form-data` with a `file` field.

**Limits:**

- Max file size: 500 MB
- Multipart form memory: 512 MB

### Create Folder

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/configuration` | Create a directory (JSON) |

**Query parameters:** Same as upload (`root`, `path`).

**Request body:**

```json
{
  "action": "mkdir",
  "name": "new-folder"
}
```

### Rename

| Method | Path | Description |
|--------|------|-------------|
| PATCH | `/api/configuration` | Rename a file or directory |

**Request body:**

```json
{
  "root": "default",
  "path": "old-name.txt",
  "newName": "new-name.txt"
}
```

### Delete

| Method | Path | Description |
|--------|------|-------------|
| DELETE | `/api/configuration` | Delete a file or directory |

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `root` | string | Root id |
| `path` | string | Relative path to file or directory (required) |

Directories are deleted recursively.

## Error Responses

| Condition | Status | Message |
|-----------|--------|---------|
| Root not found | 404 | `root not found` |
| Path traversal attempt | 400 | `invalid path` |
| Path is not a directory | 400 | `path is not a directory` |
| Path is not a file | 400 | `path is not a file` |
| Invalid name (path components) | 400 | `invalid path or name` |
| Empty name | 400 | `name cannot be empty` |
| File too large | 413 | `file too large` |

## Path Security

- All paths are resolved relative to the configured root.
- Path traversal (`..`) is rejected; requests cannot escape the root.
- Filenames in upload, create-folder, and rename must not contain path separators (e.g. `/` or `\`).

See [security.md](security.md) for more on filesystem security.
