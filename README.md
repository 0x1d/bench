# bench

A tool for workflow and resource management.

## Project Structure

```
bench/
├── api/             # Go backend API
├── ui/              # React/TypeScript frontend (Vite)
├── docs/            # Documentation (database API, security)
├── config.yaml      # Resource roots (see config.example.yaml)
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

## Documentation

- [docs/database.md](docs/database.md) — Database integration API reference, query endpoint, and features
- [docs/filesystem.md](docs/filesystem.md) — File system resource manager API reference
- [docs/security.md](docs/security.md) — Security concepts (API token, credentials, path traversal prevention)

## Resources (File System)

The Resources page provides a file browser for configured directory roots. Configure roots in `config.yaml` under `resources.filesystem`. Each entry has `id`, `label`, and `path` (absolute or relative to the config file). Supports list, download, upload, create folder, rename, and delete.

See [docs/filesystem.md](docs/filesystem.md) for the full API reference.

## Configuration

Resource roots are defined in `config.yaml` under `resources.filesystem`. Each entry has `id`, `label`, and `path` (absolute or relative to the config file). Previously: `BENCH_RESOURCES_ROOT` and `COMFYUI_PATH` environment variables. Now: configure `resources.filesystem` in `config.yaml`.

## Development

- See `.cursor/rules/` for coding guidelines.
- Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.
- Run linters before committing: `pnpm lint` (UI), `golangci-lint run` (API).
