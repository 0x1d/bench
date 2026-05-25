# Flows (Flowpipe Integration)

The bench Flows page provides a visual flow editor for building pipelines that run on [Flowpipe](https://flowpipe.io). Flows are stored as JSON and generated as Flowpipe HCL (`.fp` files). The API manages modules (folders), flows, and execution via a configured Flowpipe server.

## Overview

When `flows` is configured in `config.yaml`, the Flows page enables:

- **Module browser** — Organize flows in modules (subfolders) with tree view
- **Flow editor** — Visual graph editor with drag-and-drop steps and connections
- **Step types** — Input, output, HTTP (REST), query (database), message, sleep, transform, container, pipeline, plus Flowpipe common step attributes on executable steps
- **Execution** — Run flows on Flowpipe and view process history and execution details
- **Triggers** — Manage Flowpipe trigger blocks for webhook, schedule, alert, HTTP, and notification events

Flows are persisted as `{id}.json` (Bench format) and `{id}.fp` (Flowpipe HCL). Trigger CRUD writes Flowpipe `trigger` blocks into the matching `{id}.fp` file. Database connections used in flows are auto-generated in `connections.fpc`.

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

Optional trigger metadata can be declared under `flowpipe_triggers.triggers[]`:

```yaml
flowpipe_triggers:
  triggers:
    - id: daily-report-webhook
      label: Daily Report Webhook
      workspace: default
      flow: daily_report
      type: webhook
      config:
        pipeline: pipeline.daily_report
```

`flowpipe_triggers` does not create triggers by itself. Runtime triggers are discovered from `trigger "<type>" "<id>" { ... }` blocks in flow `.fp` files; matching config entries overlay labels, workspace selection, and richer config values in API/UI responses.

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

Triggers are Flowpipe trigger blocks attached to a flow. The Triggers page is available at `#flows/triggers`, and the flow editor side panel can edit triggers for the currently open flow.

Supported trigger types:

| Type | Purpose | Additional config |
|------|---------|-------------------|
| `webhook` | Run a pipeline from a Flowpipe webhook URL | none beyond `pipeline` and optional `description` |
| `schedule` | Run on a cron schedule | `schedule.cron`, `schedule.timezone` |
| `alert` | Run from an alert source | `alert.source`, `alert.condition` |
| `http` | Run from an HTTP polling trigger | `http.url`, `http.method`, `http.body` |
| `notification` | Run from notification events | `notification.source`, `notification.channel`, `notification.conditions` |

**Storage model:**

- Creating or updating a trigger writes a `trigger "<type>" "<id>" { ... }` block into `{flows.path}/{flow}.fp`.
- The flow `.fp` file must already exist; create the flow before adding triggers.
- Listing triggers walks all `.fp` files under `flows.path` except `mod.fp`.
- `flowpipe_triggers.triggers[]` entries in `config.yaml` only enrich matching runtime triggers; they are not a declarative source of trigger blocks.

Example webhook block:

```hcl
trigger "webhook" "daily-report-webhook" {
  description = "Trigger daily report via webhook"
  pipeline    = pipeline.daily_report
}
```

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/flows/triggers` | List triggers across flows |
| GET | `/api/flows/{flowId}/triggers/{triggerId}` | Get a trigger |
| POST | `/api/flows/{flowId}/triggers` | Create a trigger in the flow `.fp` file |
| PUT | `/api/flows/{flowId}/triggers/{triggerId}` | Replace a trigger block |
| DELETE | `/api/flows/{flowId}/triggers/{triggerId}` | Delete a trigger block |
| POST | `/api/flows/{flowId}/triggers/{triggerId}/test` | Run the trigger's configured pipeline through Flowpipe |
| GET | `/api/flows/{flowId}/triggers/{triggerId}/webhook` | Return the Flowpipe webhook URL for a webhook trigger |

**List query parameters:**

| Param | Description |
|-------|-------------|
| `workspace` | Optional workspace filter. Empty trigger workspace is treated as `default`. |
| `flow` | Optional flow id filter. |

**Create/update request:**

```json
{
  "id": "daily-report-webhook",
  "label": "Daily Report Webhook",
  "workspace": "default",
  "flow": "daily_report",
  "type": "webhook",
  "config": {
    "description": "Trigger daily report via webhook",
    "pipeline": "pipeline.daily_report"
  }
}
```

`config.pipeline` is required. If it omits the `pipeline.` prefix, Bench adds it when writing HCL.

**Test request:** `POST /api/flows/{flowId}/triggers/{triggerId}/test`

```json
{
  "payload": {
    "user_id": "123"
  }
}
```

Bench forwards the payload as Flowpipe run args. For webhook triggers with no payload, Bench sends a default test event containing `timestamp`, `trigger`, and `flow`.

**Webhook URL response:** `GET /api/flows/{flowId}/triggers/{triggerId}/webhook`

```json
{
  "url": "http://localhost:7103/api/v0/webhook/daily-report-webhook"
}
```

The URL is `{flows.workspaces[].flowpipeUrl}/api/v0/webhook/{triggerId}` using the trigger workspace or `default`.

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
| `{module}/{id}.fp` | Flowpipe pipeline HCL (generated from JSON) plus trigger blocks |

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
| Trigger not found | 404 | `trigger not found: {triggerId} in flow {flowId}` |
| Trigger duplicate | 409 | `trigger "{triggerId}" already exists in flow "{flowId}"` |
| Missing trigger pipeline | 400 | `trigger config.pipeline is required` |
| Flowpipe request failed | 502 | `flowpipe request failed: {error}` |

## Troubleshooting

- **Flow runs but step order looks wrong**: verify `dependsOn` on steps (not just rendered edges).
- **Run args appear ignored**: only params declared in `input` steps are accepted.
- **Query step run fails with missing connection arg**: ensure the step has `databaseId` and that the database resource exists.
- **Create trigger returns "Create flow first"**: trigger CRUD writes to `{flow}.fp`; save or create the flow before adding triggers.
- **Trigger test cannot connect to Flowpipe**: verify the trigger workspace and `flows.workspaces[].flowpipeUrl`.
- **Webhook URL points at the wrong host**: set the trigger `workspace` in `flowpipe_triggers` or choose the correct workspace in the UI; otherwise `default` is used.
- **Flowpipe process list returns gateway error**: Bench converts upstream Flowpipe 5xx on process listing into a friendly `502` error response.

## Security

- **Flowpipe URL**: Workspace `flowpipeUrl` is server-side only; the UI receives only workspace id and label.
- **Triggers**: Webhook URLs expose the Flowpipe host configured for the trigger workspace. Trigger testing runs the configured pipeline on that server.
- **Database credentials**: Connection blocks in `connections.fpc` use env-interpolated URLs; credentials never reach the client.
- **REST auth**: HTTP steps use Bench REST resources; auth is applied server-side when generating HCL or proxying.

See [security.md](security.md) for API authentication and token handling.
