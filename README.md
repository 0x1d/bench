# Bench

An integration and automation platform.

## Project Structure

```
bench/
├── api/             # Go backend API
├── ui/              # React/TypeScript frontend (Vite)
├── flows/           # Flow definitions (Flowpipe HCL and JSON)
├── docs/            # Documentation (configuration, database, filesystem, flows, infrastructure, rest, schema-registry, security)
├── config.yaml      # Resource roots and flows config (see config.example.yaml)
├── dev.sh           # Run API and UI together for local development
├── example.env
└── .cursor/         # Cursor IDE rules and guidelines
```

## Prerequisites

- [Go](https://go.dev/) 1.22+
- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 10+

## Getting Started

### Run both (local development)

From the repository root:

```bash
cp example.env .env          # edit .env with your API_TOKEN, etc.
cp config.example.yaml config.yaml   # configure resource roots
./dev.sh
```

This starts the API and UI together. Environment variables are loaded from `.env` if present. Resource roots are configured in `config.yaml` (see `config.example.yaml`). Use Ctrl+C to stop both.

To use a different config file: `./dev.sh /path/to/config.yaml`

### API (standalone)

```bash
cd api
go run ./cmd/server
```

The API server starts on `http://localhost:8080`.
Set `API_TOKEN` before starting the API. Requests must include this value in the `X-API-Token` header.
Resource roots are configured in `config.yaml` at the project root (or path from `BENCH_CONFIG`).

### UI (standalone)

```bash
cd ui
pnpm install
pnpm dev
```

The dev server starts on `http://localhost:5173`.
The browser always calls `/api`; requests are proxied server-side.
Set `API_BASE_URL` to point the UI proxy at your API host.
You can provide either a host (for example, `https://your-api.example.com`) or a full `/api` URL.
If unset, it defaults to `http://localhost:8080/api`.
Set `API_TOKEN` in the UI runtime environment so the proxy can send `X-API-Token` to the API.

## Database (PostgreSQL)

The Database page provides a table browser, table creator, schema editor, and SQL query editor. It works with local PostgreSQL or [Supabase](https://supabase.com).

### Features

- **Tables**: Create, alter, and browse tables with pagination and search.
- **Foreign keys**: Add single references (one-to-one / many-to-one) or multiple references (one-to-many) via the "Many" checkbox. Multiple references use array columns (`integer[]`, `bigint[]`, `uuid[]`) and support multi-select when adding or editing rows.
- **Query editor**: Run ad-hoc SQL and view results.

**Local development**: Start Postgres with Docker (run in foreground so Ctrl+C stops it):

```bash
docker compose up
```

Then set `DATABASE_URL` in `.env`:

```
DATABASE_URL=postgresql://bench:bench@localhost:5432/bench
```

**Supabase**: Use the connection string from your project dashboard (Connect → Connection string). Set `DATABASE_URL` in your deployment environment.

If `DATABASE_URL` is not set, the Database page shows a setup message and the nav item remains available.

See [docs/database.md](docs/database.md) for the full API reference and query endpoint details.

## Flows (Flowpipe)

The Flows page provides a visual flow editor for building pipelines that run on [Flowpipe](https://flowpipe.io). Flows are stored as JSON and generated as Flowpipe HCL (`.fp` files).

### Features

- **Module browser** — Organize flows in modules (subfolders) with tree view
- **Flow editor** — Visual graph editor with drag-and-drop steps and connections
- **Step types** — Input, output, HTTP (REST), query (database), message, sleep, transform, container, pipeline
- **Execution** — Run flows on Flowpipe and view process history and execution details

Configure `flows` in `config.yaml` with a `path` and `workspaces` (Flowpipe server URLs). If `flows` is not configured, the Flows page shows a setup message and the nav item remains available.

See [docs/flows.md](docs/flows.md) for configuration, step types, and API details.

## Infrastructure (Terraform)

The Infrastructure page provides Terraform file editing, dependency graph visualization, and command execution (`init`, `plan`, `apply`, `destroy`).

Configure infrastructure in `config.yaml`:

```yaml
infrastructure:
  path: ./workspace/infra
```

If infrastructure is not configured or Terraform is not installed on the API host, the page shows setup guidance.

See [docs/infrastructure.md](docs/infrastructure.md) for workflow details, API reference, and troubleshooting.

## Schema registry

The schema registry holds OpenAPI, AsyncAPI, and JSON Schema files declared under `resources.schemas`. REST resources can reference a registered OpenAPI document with `schemaId` (it takes precedence over `openapiSpec`). Register and edit schemas on the Configuration page (`#configuration`); the Schemas page (`#schemas`) lists entries and shows a simple preview by type.

See [docs/schema-registry.md](docs/schema-registry.md) for configuration, REST integration, UI, and API details.

## Documentation

- [docs/database.md](docs/database.md) — Database integration API reference, query endpoint, and features
- [docs/configuration.md](docs/configuration.md) — Configuration and Status workflow (`config.yaml`, `/api/config*`, `/api/status`, runtime reload behavior)
- [docs/flows.md](docs/flows.md) — Flows (Flowpipe) configuration, step types, and execution
- [docs/filesystem.md](docs/filesystem.md) — File system resource manager API reference
- [docs/infrastructure.md](docs/infrastructure.md) — Terraform workflow, command runbook, and API reference
- [docs/rest.md](docs/rest.md) — REST resource proxy and OpenAPI-based tooling
- [docs/schema-registry.md](docs/schema-registry.md) — Schema registry (OpenAPI / AsyncAPI / JSON Schema), REST `schemaId`, Schemas UI, API
- [docs/security.md](docs/security.md) — Security concepts (API token, credentials, path traversal prevention)

## Filesystem

The Configuration page (`#configuration`) provides a file browser for configured directory roots. Configure roots in `config.yaml` under `resources.filesystem`. Each entry has `id`, `label`, and `path` (absolute or relative to the config file). Supports list, download, upload, create folder, rename, and delete.

See [docs/filesystem.md](docs/filesystem.md) for the full API reference.

## Configuration

Configuration is in `config.yaml` (see `config.example.yaml`):

- **resources.filesystem** — File browser roots: `id`, `label`, `path` per entry
- **resources.databases** — PostgreSQL connections for the Database page
- **resources.rest** — REST API resources for the REST page and flow HTTP steps (optional `schemaId` pointing at a registered OpenAPI schema)
- **resources.schemas** — Registered schema files (OpenAPI, AsyncAPI, JSON Schema) for the registry API and UI
- **flows** — Flow storage path and Flowpipe workspace URLs for the Flows page

See [docs/configuration.md](docs/configuration.md) for configuration editing workflow, `/api/config*` endpoints, status signals, and runtime reload behavior.

## Development

- See `.cursor/rules/` for coding guidelines.
- Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.
- Run pre-commit checks before committing:
  - API: `cd api && go vet ./... && go test ./... && go build ./cmd/server`
  - UI: `cd ui && pnpm lint && pnpm build`
