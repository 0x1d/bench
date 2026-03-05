# Flows (Flowpipe Integration)

The bench Flows page provides a visual flow editor for building pipelines that run on [Flowpipe](https://flowpipe.io). Flows are stored as JSON and generated as Flowpipe HCL (`.fp` files). The API manages modules (folders), flows, and execution via a configured Flowpipe server.

## Overview

When `flows` is configured in `config.yaml`, the Flows page enables:

- **Module browser** — Organize flows in modules (subfolders) with tree view
- **Flow editor** — Visual graph editor with drag-and-drop steps and connections
- **Step types** — Input, output, HTTP (REST), query (database), message, sleep, transform, container, pipeline
- **Execution** — Run flows on Flowpipe and view process history and execution details

Flows are persisted as `{id}.json` (Bench format) and `{id}.fp` (Flowpipe HCL). Database connections used in flows are auto-generated in `connections.fpc`.

## Configuration

In `config.yaml`:

```yaml
flows:
  path: ./flows
  workspaces:
    - id: default
      label: Default
      flowpipeUrl: http://localhost:7103
    - id: remote
      label: Remote
      flowpipeUrl: https://flowpipe.example.com
```

- **path** — Directory for flows (relative to config file or absolute). Defaults to `./flows` when omitted.
- **workspaces** — Flowpipe workspace profiles. Each workspace has:
  - **id** — Unique identifier (used in API requests)
  - **label** — Display name in the UI
  - **flowpipeUrl** — Flowpipe server URL (default `http://localhost:7103`)

If no workspaces are configured but `path` is set, a default workspace (`id: default`) is used.

## Flow Structure

A flow is a directed graph of steps connected by edges:

```json
{
  "id": "my_flow",
  "name": "My Flow",
  "description": "Optional description",
  "steps": [
    {
      "id": "step_1",
      "type": "input",
      "label": "Input",
      "config": {
        "params": [
          { "name": "user_id", "type": "string", "description": "User ID" }
        ]
      }
    },
    {
      "id": "step_2",
      "type": "query",
      "label": "Fetch User",
      "config": {
        "databaseId": "main",
        "sql": "SELECT * FROM users WHERE id = $1",
        "args": ["param.user_id"]
      },
      "dependsOn": ["step_1"]
    }
  ],
  "edges": [
    { "id": "e1", "source": "step_1", "target": "step_2" }
  ]
}
```

### Step Types

| Type | Description | Config fields |
|------|-------------|---------------|
| `input` | Pipeline parameters (virtual; no step block in HCL) | `params`: `[{ name, type?, description?, default? }]` |
| `output` | Pipeline outputs (virtual) | `outputs`: `[{ name, value }]` |
| `http` | REST API call | `restId`, `method`, `path`, `body?`, `headers?` |
| `query` | SQL query (PostgreSQL) | `databaseId`, `sql`, `args?` |
| `message` | Send notification | `notifier`, `text` |
| `sleep` | Pause execution | `duration` (e.g. `5s`) |
| `transform` | HCL expression | `value` |
| `container` | Run container | `image` or `source`, `cmd?`, `env?` |
| `pipeline` | Call another pipeline | `pipelineRef`, `args?` |

Step references in `args` use Flowpipe syntax: `param.name`, `step.http.foo.response_body.id`.

## API Reference

All endpoints require the `X-API-Token` header. Base path: `/api/flows`.

### Workspaces

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/flows/workspaces` | List configured Flowpipe workspaces |

**Response:** `{ "workspaces": [{ "id": string, "label": string }] }`

### Entries (Modules & Flows)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/flows/entries` | List modules and flows at path |

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | string | `.` | Relative path within flows directory |
| `recursive` | string | — | `true` for tree structure with nested children |

**Response (flat):**

```json
{
  "entries": [
    { "name": "my_module", "path": "my_module", "type": "module", "mtime": 1709123456 },
    { "name": "My Flow", "path": "my_flow", "type": "flow", "steps": 3, "mtime": 1709123400 }
  ]
}
```

**Response (recursive):** Same structure with `children` array on module entries.

### Module Metadata

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/flows/module` | Get module metadata from mod.fp |
| PUT | `/api/flows/module` | Update module metadata |
| POST | `/api/flows/modules` | Create a new module |

**Query parameters (GET/PUT):** `path` — module path (required, e.g. `my_module`).

**Request (PUT module):** `{ "title": string, "description": string }`

**Request (POST modules):** `{ "name": string }`

### Flows CRUD

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/flows` | List flows in module |
| GET | `/api/flows/{id}` | Get a flow |
| POST | `/api/flows` | Create a flow |
| PUT | `/api/flows/{id}` | Update a flow |
| DELETE | `/api/flows/{id}` | Delete a flow |
| PUT | `/api/flows/{id}/move` | Move flow between modules |

**Query parameters:** `module` — module path (default `.` for root).

**Request (POST/PUT flow):** Flow JSON (id, name, description, steps, edges).

**Request (PUT move):**

```json
{
  "fromModule": ".",
  "toModule": "my_module"
}
```

### Execution

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/flows/{id}/run` | Execute flow on Flowpipe |
| GET | `/api/flows/processes` | List recent Flowpipe processes |
| GET | `/api/flows/executions/{execId}` | Get execution details |

**Query parameters (run):** `module` (default `.`), `workspace` (default `default`).

**Request body (run):**

```json
{
  "args": {
    "user_id": "123",
    "conn_main": "main"
  }
}
```

- **args** — Pipeline parameters. Only params defined in input steps are accepted. Query steps add `conn_{databaseId}` automatically.

**Response (run):** Proxied from Flowpipe (pipeline run result).

**Response (processes):** Proxied from Flowpipe `/api/v0/process`.

**Response (executions):** Proxied from Flowpipe `/api/v0/process/{execId}/execution`.

## File Layout

The flows directory contains:

| File | Description |
|------|--------------|
| `mod.fp` | Root module definition (auto-created) |
| `workspaces.fpc` | Flowpipe workspace blocks (host = flowpipeUrl) |
| `connections.fpc` | Auto-generated PostgreSQL connection blocks from `resources.databases` |
| `{module}/mod.fp` | Module metadata (title, description) |
| `{module}/{id}.json` | Flow definition (Bench format) |
| `{module}/{id}.fp` | Flowpipe pipeline HCL (generated from JSON) |

Path traversal (`..`) in module paths is rejected.

## Error Responses

| Condition | Status | Message |
|-----------|--------|---------|
| Flows path not configured | 404 | `flows path not configured` |
| Path not found | 404 | `path not found: {path}` |
| Module not found | 404 | `module not found: {path}` |
| Flow not found | 404 | `flow not found: {id}` |
| Invalid flow id | 400 | `invalid flow id: {id}` |
| Invalid module name | 400 | `invalid module name: {name}` |
| Flowpipe request failed | 502 | `flowpipe request failed: {error}` |

## Security

- **Flowpipe URL**: Workspace `flowpipeUrl` is server-side only; the UI receives only workspace id and label.
- **Database credentials**: Connection blocks in `connections.fpc` use env-interpolated URLs; credentials never reach the client.
- **REST auth**: HTTP steps use Bench REST resources; auth is applied server-side when generating HCL or proxying.

See [security.md](security.md) for API authentication and token handling.
