# Configuration and Status Workflow

Bench uses `config.yaml` as the runtime contract for resource integrations and operational settings. This page documents how configuration is loaded, edited, validated, and surfaced in the UI.

## Overview

Two pages work together:

- **Status** (`#status`): operational health summary and first-time setup actions.
- **Configuration** (`#configuration`): structured editor for filesystem, schemas, databases, REST, flows, infrastructure, and agent settings.

Legacy hash `#resources` is redirected to `#configuration`.

## What the Configuration page edits

The Configuration UI reads and writes the same `config.yaml` used by the API:

- `resources.filesystem`
- `resources.schemas`
- `resources.databases`
- `resources.rest`
- `flows.path`
- `flows.workspaces`
- `infrastructure.path`
- `agent` (endpoint, working directory, agent type, optional model)

Save operations are persisted as YAML and validated by the API before acceptance.

## API reference

All routes require `X-API-Token`.

### Config file endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config` | Return current `config.yaml` content |
| GET | `/api/config/example` | Return `config.example.yaml` content (embedded fallback if file is missing on disk) |
| POST | `/api/config/save` | Save raw YAML body as `config.yaml` |
| POST | `/api/config` | Upload `config.yaml` via multipart form (`file`) |

#### POST `/api/config/save`

- Request content type: `text/yaml` (raw body)
- Success: `200 OK`
- Validation failure: `400 invalid config: ...`
- Runtime-apply failure after write: `500 config saved but failed to apply runtime: ...`

#### POST `/api/config`

- Request content type: `multipart/form-data`
- Required form field: `file`
- Success: `201 Created`
- Validation failure: `400 invalid config: ...`

### Status endpoint

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Aggregate status used by the Status page cards |

`/api/status` includes:

- `filesystem` (`configured`, per-root availability)
- `database` (`configured`, default id, per-db connected/enabled state)
- `rest` (`configured`, configured count)
- `flows` (`configured`, flow count, `flowpipeHealthy`)

## Save-time runtime behavior

After a successful config write, the API immediately applies selected runtime effects:

1. **Database runtime reload**
   - Uses `resources.databases` when present.
   - Falls back to `DATABASE_URL` when no database entries are configured.
   - Closes active DB runtime when neither is configured.
2. **Flows runtime sync**
   - Ensures flows module files exist.
   - Syncs `flows.workspaces` to `workspaces.fpc`.

This means config changes affect runtime behavior without restarting the API in most cases.

## Validation and constraints

The API enforces these constraints on save:

- **Databases**
  - `id` and `url` are required.
  - IDs must be unique.
  - At most one `default: true`.
- **REST**
  - `id` and `baseUrl` are required.
  - IDs must be unique.
  - `auth.type` must be one of: `none`, `basic`, `bearer`, `apiKey`.
  - Auth-specific required fields are enforced.
  - `schemaId` must reference an existing schema with `type: openapi`.
- **Schemas**
  - `id`, `type`, and `source.path` are required.
  - IDs must be unique.
  - `type` must be one of: `openapi`, `asyncapi`, `json-schema`.
- **Flow workspaces**
  - Each workspace requires unique `id`.
- **Agent**
  - If `agent` is present, `endpoint`, `workingDirectory`, and `agent` are required.
  - `agent` must be `cursor` or `gemini`.

## Path resolution rules

- Relative paths in config are resolved relative to the directory containing `config.yaml`.
- This applies to filesystem roots, schema files, REST `openapiSpec`, flows path, and infrastructure path.

Config lookup order:

1. `BENCH_CONFIG` (absolute path or path relative to current working directory)
2. `./config.yaml` or `./config.yml`
3. `../config.yaml` or `../config.yml` (when running from `api/`)

When creating a new config file (no existing config found), save defaults to:

- `BENCH_CONFIG_WRITE` if set
- otherwise repo-root `config.yaml` when running from `api/`
- otherwise `./config.yaml`

## UI workflow examples

### First-time setup from Status page

1. Open **Status**.
2. Use **Create config.yaml** (loads example template) or **Upload config.yaml**.
3. Move to **Configuration** for structured edits.
4. Re-check **Status** to confirm cards become configured/healthy.

### Resolving "not configured" pages

Pages such as Database, REST, Infrastructure, and Filesystem show a shared "Open configuration" card when required config is missing. The link always targets `#configuration`.

## Troubleshooting

| Symptom | Likely cause | What to check |
|--------|---------------|---------------|
| `invalid config: missing environment variables: ...` | `${VAR}` placeholders are unresolved at save/read time | Set required env vars on the API process |
| `config saved but failed to apply runtime: ...` | Write succeeded, runtime apply step failed | Inspect DB credentials/availability and retry save |
| REST save fails with schema reference error | `schemaId` points to missing or non-OpenAPI schema | Ensure schema exists in `resources.schemas` with `type: openapi` |
| Flow runs still use old workspace profiles | Workspace sync did not complete | Re-save config and verify `flows.workspaces` values |
| Direct link to `#resources` no longer shows page | Route alias changed | Use `#configuration` (redirect exists) |

## Example (minimal, multi-feature)

```yaml
resources:
  filesystem:
    - id: workspace
      label: Workspace
      path: ./workspace
  databases:
    - id: main
      label: Main DB
      url: ${BENCH_DB_MAIN_URL}
      enabled: true
      default: true
  schemas:
    - id: petstore-api
      label: Petstore API
      type: openapi
      source:
        path: ./workspace/rest/petstore.json
  rest:
    - id: petstore
      label: Petstore API
      baseUrl: https://petstore.swagger.io/v2
      schemaId: petstore-api

flows:
  path: ./workspace/flows
  workspaces:
    - id: default
      label: Default
      flowpipeUrl: http://localhost:7103

infrastructure:
  path: ./workspace/infra

agent:
  endpoint: http://localhost:3001
  workingDirectory: /workspace
  agent: cursor
```

