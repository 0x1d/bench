# AGENTS.md

## Project Overview

**bench** is a tool for workflow and resource management. It is a monorepo with two services:

| Service | Directory | Tech | Default Port |
|---------|-----------|------|-------------|
| API | `api/` | Go 1.22+ | 8080 |
| UI | `ui/` | React 19 + TypeScript + Vite | 5173 |

## Development Workflow

Use these skills when working on the project:
- Planning: Create implementation plans with tasks and specs. Use when starting a new feature, large refactor, or multi-step initiative that needs structured tracking.
  - .skills/plan-creation
- Implementation: Execute tasks from implementation plans. Use when working on any plan in docs/plans/ that has task specs.
  - .skills/plan-task-execution
- Multi-Agent Coordination: Coordinate with other agents to complete tasks. Use when multiple agents may work on the same plan; prevents duplicate work via state-based locking.
  - .skills/agent-coordination

## Development Guidelines

Follow these guidelines when working on the project:
- General: .skills/bench-development
- UI: .skills/bench-ui
- API: .skills/bench-api

## Cursor Cloud specific instructions

### Running the services

**Both (local dev)** — from repository root:
```bash
./dev.sh [config.yaml]
```
Starts API and UI together. Loads `.env` if present. Optional first argument: path to config file (sets `BENCH_CONFIG`). Use Ctrl+C to stop both.

**API** — from repository root:
```bash
cd api && go run ./cmd/server
```
Listens on `:8080`. Override with `PORT` env var. `API_TOKEN` is required and is validated from the `X-API-Token` request header.

**UI** — from repository root:
```bash
cd ui && pnpm install && pnpm dev
```
Starts Vite dev server on `:5173`. The browser always calls `/api`; Vite proxies requests to `API_BASE_URL` and injects `API_TOKEN` as `X-API-Token`. `API_BASE_URL` accepts a host-only value or full `/api` URL and defaults to `http://localhost:8080/api`.

### Lint / Test / Build

| Check | API (`api/`) | UI (`ui/`) |
|-------|-------------|-----------|
| Lint | `go vet ./...` | `pnpm lint` |
| Test | `go test ./...` | `pnpm build` (type-check + build) |
| Build | `go build ./cmd/server` | `pnpm build` |
| Format | `gofmt -w .` | handled by ESLint |

### Pre-commit quality gate

Before creating any commit, always run lint and test checks for both services (plus required build checks), and only commit when all checks pass:

```bash
# API
cd api && go vet ./... && go test ./... && go build ./cmd/server

# UI
cd ui && pnpm lint && pnpm build
```

### Non-obvious caveats

- **esbuild build scripts**: The `ui/package.json` includes `pnpm.onlyBuiltDependencies: ["esbuild"]` to allow esbuild's postinstall script non-interactively. Do not run `pnpm approve-builds` (interactive).
- **Vite proxy**: The browser always uses `/api`; Vite forwards to `API_BASE_URL` (default `http://localhost:8080/api`) and preserves the `/api/*` path.
- **API auth**: API requests must include `X-API-Token` matching `API_TOKEN`. UI proxy layers (Vite and Vercel function) inject this header server-side.
- **Go module path**: The API module is `github.com/0x1d/bench/api`. When adding new packages, import from this path.
- **Coding guidelines**: See `.cursor/rules/` for TypeScript/React and Go coding standards. Follow Conventional Commits for git messages (see `.cursor/rules/general.mdc`).
