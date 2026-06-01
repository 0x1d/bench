# Flows (Flowpipe Integration)

The bench Flows page provides a visual flow editor for building pipelines that run on [Flowpipe](https://flowpipe.io). Flows are stored as JSON and generated as Flowpipe HCL (`.fp` files). The API manages modules (folders), flows, and execution via a configured Flowpipe server.

## Overview

When `flows` is configured in `config.yaml`, the Flows page enables:

- **Module browser** — Organize flows in modules (subfolders) with tree view
- **Flow editor** — Visual graph editor with drag-and-drop steps and connections
- **Step types** — Input, output, HTTP (REST), query (database), message, sleep, transform, container, pipeline, plus Flowpipe common step attributes on executable steps
- **Triggers** — Manage Flowpipe trigger blocks for automated execution from the flow editor or the Triggers page
- **Execution** — Run flows on Flowpipe and view process history and execution details

Flows are persisted as `{id}.json` (Bench format) and `{id}.fp` (Flowpipe HCL). Trigger blocks are stored in the same `{id}.fp` files. Database connections used in flows are auto-generated in `connections.fpc`.

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

### Optional trigger metadata

Triggers are active when a `trigger` block exists in a flow's `.fp` file. The optional `flowpipe_triggers` section in `config.yaml` is used by Bench to validate configured trigger IDs and enrich trigger list responses with labels, workspaces, and type-specific details when the same trigger ID is found in HCL.

```yaml
flowpipe_triggers:
  triggers:
    - id: daily-report-webhook
      label: Daily Report Webhook
      workspace: default
      flow: daily_report
      type: webhook
      config:
        description: "Trigger daily report via webhook"
        pipeline: pipeline.daily_report
    - id: hourly-check-schedule
      label: Hourly Check
      flow: hourly_check
      type: schedule
      config:
        description: "Run hourly checks"
        pipeline: pipeline.hourly_check
        schedule:
          cron: "0 * * * *"
          timezone: "UTC"
```

Important constraints:

- `id`, `flow`, and `type` are required; `type` must be one of `webhook`, `schedule`, `alert`, `http`, or `notification`.
- UI and API trigger create/update/delete actions edit trigger blocks in root-level `{flow}.fp`; they do not write `flowpipe_triggers` back to `config.yaml`.
- `workspace` defaults to `default` when omitted.
- `config.pipeline` is required for API-created trigger blocks. Bench prefixes bare pipeline names with `pipeline.` when generating HCL.

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

### Common Step Attributes (advanced)

For all executable steps (`http`, `query`, `message`, `sleep`, `transform`, `container`, `pipeline`), Bench supports Flowpipe common step attributes via `config.commonAttributes`.

```json
{
  "id": "step_2",
  "type": "query",
  "label": "Fetch User",
  "config": {
    "databaseId": "main",
    "sql": "select * from users where id = $1",
    "args": ["param.user_id"],
    "commonAttributes": {
      "title": "Fetch primary user",
      "if": "param.user_id != \"\"",
      "max_concurrency": 5,
      "retry": {
        "enabled": true,
        "max_attempts": 3,
        "strategy": "exponential",
        "min_interval": 1000
      }
    }
  }
}
```

Supported keys in `commonAttributes`:

- Scalar: `title`, `description`, `timeout`, `if`, `for_each`, `max_concurrency`
- Blocks: `error`, `loop`, `retry`, `throw`, `output` (each uses `enabled: true` to emit)

Important constraints:

- `if`, `for_each`, and nested expression fields are emitted as raw HCL expressions (not quoted).
- `timeout` supports either a string (for example `"30s"`) or numeric seconds.
- `max_concurrency`, `retry.max_attempts`, and `retry.min_interval` are emitted only when numeric and greater than zero.
- `commonAttributes.output` creates per-step output blocks; this is separate from top-level pipeline outputs from `output` steps.
- `input` and `output` steps are virtual and do not emit step blocks, so common attributes do not apply to them.

## Triggers

Triggers automate flow execution by adding Flowpipe `trigger` blocks to a flow's `.fp` file.

### UI workflow

- Open **Flows → Triggers** (`#flows/triggers`) to list, filter, add, edit, delete, test, and copy webhook URLs for triggers.
- Open a root-level flow in the editor and use the **Triggers** section in the side panel to manage triggers scoped to that flow.
- Use **Flows → Settings** (`#flows/settings`) for flow storage/workspace configuration, not for trigger CRUD.
- When verifying generated HCL or integrating through the API, use the nested payload shape below; HCL generation reads type-specific fields from `config.schedule`, `config.alert`, `config.http`, and `config.notification`.

### Trigger types and fields

| Type | Purpose | Type-specific fields |
|------|---------|----------------------|
| `webhook` | Execute a pipeline from a Flowpipe webhook URL | No extra HCL fields beyond `description` and `pipeline` |
| `schedule` | Execute on a cron schedule | `cron`, `timezone` |
| `alert` | Execute from an alert source | `source`, `condition` |
| `http` | Execute from an HTTP callback definition | `url`, `method`, `body` |
| `notification` | Execute from a notification source/channel | `source`, `channel`, `conditions` |

Example generated HCL when nested schedule config is supplied:

```hcl
trigger "schedule" "hourly_check" {
  description = "Run hourly checks"
  pipeline    = pipeline.hourly_check
  cron        = "0 * * * *"
  timezone    = "UTC"
}
```

API trigger payloads use a base `config.pipeline` plus nested type-specific config for fields that must be emitted into HCL:

```json
{
  "id": "hourly_check",
  "label": "Hourly Check",
  "flow": "hourly_check",
  "type": "schedule",
  "workspace": "default",
  "config": {
    "description": "Run hourly checks",
    "pipeline": "pipeline.hourly_check",
    "schedule": {
      "cron": "0 * * * *",
      "timezone": "UTC"
    }
  }
}
```

### Runtime behavior

- Trigger discovery walks `.fp` files under the configured flows path and ignores `mod.fp`.
- Trigger list responses are derived from HCL blocks first, then enriched from matching `flowpipe_triggers.triggers[].id` entries in `config.yaml`.
- Trigger CRUD endpoints resolve `{flow}.fp` at the root of the flows path. Triggers in module files can be discovered, but module-scoped trigger CRUD is not exposed by the current API routes.
- Webhook URLs are returned as `{flowpipeUrl}/api/v0/webhook/{triggerId}` for the trigger's workspace.
- Testing a trigger calls Flowpipe's pipeline run API with the trigger pipeline reference. Webhook tests generate a synthetic `event` payload when no payload is supplied.

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

### Triggers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/flows/triggers` | List triggers discovered from `.fp` files |
| GET | `/api/flows/{id}/triggers/{triggerId}` | Get one trigger for flow `{id}` |
| POST | `/api/flows/{id}/triggers` | Create a trigger block in root-level `{id}.fp` |
| PUT | `/api/flows/{id}/triggers/{triggerId}` | Replace an existing trigger block |
| DELETE | `/api/flows/{id}/triggers/{triggerId}` | Delete a trigger block |
| POST | `/api/flows/{id}/triggers/{triggerId}/test` | Execute the trigger's pipeline through Flowpipe |
| GET | `/api/flows/{id}/triggers/{triggerId}/webhook` | Return the Flowpipe webhook URL |

**Query parameters (list):**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `workspace` | string | — | Filter by workspace (`default` also matches blank workspace) |
| `flow` | string | — | Filter by flow id |

**Request (POST/PUT trigger):** Trigger JSON with `id`, `flow`, `type`, and `config.pipeline` plus optional label, workspace, and type-specific nested config. Use nested config (`config.schedule`, `config.alert`, `config.http`, `config.notification`) for type-specific fields that should be written to HCL.

**Request (test trigger):**

```json
{
  "payload": {
    "event_id": "evt_123"
  }
}
```

**Responses:**

- List: `{ "triggers": [{ "id", "label", "flow", "type", "workspace", "enabled", "config", "status" }] }`
- Create/update/get: trigger entry or state JSON.
- Delete: `204 No Content`.
- Test: `{ "executedAt": "2026-06-01T16:00:00Z", "status": "pending" }`
- Webhook URL: `{ "url": "http://localhost:7103/api/v0/webhook/hourly_check" }`

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

### Execution behavior details

- Run arguments are filtered to only parameters declared by `input` steps.
- `query` steps with a configured `databaseId` automatically add `conn_{databaseId}` args on the server.
- Unknown request args are ignored before forwarding to Flowpipe.
- `dependsOn` relationships are emitted as Flowpipe `depends_on` references for non-input dependencies.
- `edges` are persisted for editor visualization; execution ordering is derived from `dependsOn`.

## File Layout

The flows directory contains:

| File | Description |
|------|--------------|
| `mod.fp` | Root module definition (auto-created) |
| `workspaces.fpc` | Flowpipe workspace blocks (host = flowpipeUrl) |
| `connections.fpc` | Auto-generated PostgreSQL connection blocks from `resources.databases` |
| `{module}/mod.fp` | Module metadata (title, description) |
| `{module}/{id}.json` | Flow definition (Bench format) |
| `{module}/{id}.fp` | Flowpipe pipeline HCL (generated from JSON), including any trigger blocks for the flow |

Path traversal (`..`) in module paths is rejected.

## Error Responses

| Condition | Status | Message |
|-----------|--------|---------|
| Flows path not configured | 404 | `flows path not configured` |
| Path not found | 404 | `path not found: {path}` |
| Module not found | 404 | `module not found: {path}` |
| Flow not found | 404 | `flow not found: {id}` |
| Trigger not found | 404 | `trigger not found: {triggerId} in flow {id}` |
| Invalid flow id | 400 | `invalid flow id: {id}` |
| Invalid module name | 400 | `invalid module name: {name}` |
| Invalid trigger payload | 400 | `trigger config.pipeline is required` or another validation message |
| Flowpipe request failed | 502 | `flowpipe request failed: {error}` |

## Troubleshooting

- **Flow runs but step order looks wrong**: verify `dependsOn` on steps (not just rendered edges).
- **Run args appear ignored**: only params declared in `input` steps are accepted.
- **Query step run fails with missing connection arg**: ensure the step has `databaseId` and that the database resource exists.
- **Flowpipe process list returns gateway error**: Bench converts upstream Flowpipe 5xx on process listing into a friendly `502` error response.
- **Trigger appears without label/workspace metadata**: ensure the trigger block exists in `{flow}.fp` and that any optional `flowpipe_triggers.triggers` entry in `config.yaml` uses the same `id`.
- **Trigger create fails with missing pipeline**: include `config.pipeline` in the API payload; type-specific nested pipeline fields are not a substitute for the base pipeline field.
- **Module trigger edits are not reflected**: trigger CRUD routes currently target root-level `{flow}.fp`; edit module flow trigger blocks directly in the module `.fp` file.
- **Webhook URL points at localhost**: configure the trigger workspace and `flows.workspaces[].flowpipeUrl`; blank workspace uses `default`.

## Security

- **Flowpipe URL**: Workspace `flowpipeUrl` is server-side only; the UI receives only workspace id and label.
- **Database credentials**: Connection blocks in `connections.fpc` use env-interpolated URLs; credentials never reach the client.
- **REST auth**: HTTP steps use Bench REST resources; auth is applied server-side when generating HCL or proxying.

See [security.md](security.md) for API authentication and token handling.
