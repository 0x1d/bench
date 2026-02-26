# AGENTS.md

## Project Overview

**bench** is a tool for managing and running ComfyUI workflows. It is a monorepo with two services:

| Service | Directory | Tech | Default Port |
|---------|-----------|------|-------------|
| API | `api/` | Go 1.22+ | 8080 |
| UI | `ui/` | React 19 + TypeScript + Vite | 5173 |

## Cursor Cloud specific instructions

### Running the services

**API** — from repository root:
```bash
cd api && go run ./cmd/server
```
Listens on `:8080`. Override with `PORT` env var.

**UI** — from repository root:
```bash
cd ui && pnpm install && pnpm dev
```
Starts Vite dev server on `:5173`. The Vite config proxies `/api/*` requests to `http://localhost:8080` by default (override with `VITE_PROXY_TARGET`), so the API must be running for the UI to function fully.

### Lint / Test / Build

| Check | API (`api/`) | UI (`ui/`) |
|-------|-------------|-----------|
| Lint | `go vet ./...` | `pnpm lint` |
| Test | `go test ./...` | `pnpm build` (type-check + build) |
| Build | `go build ./cmd/server` | `pnpm build` |
| Format | `gofmt -w .` | handled by ESLint |

### Non-obvious caveats

- **esbuild build scripts**: The `ui/package.json` includes `pnpm.onlyBuiltDependencies: ["esbuild"]` to allow esbuild's postinstall script non-interactively. Do not run `pnpm approve-builds` (interactive).
- **Vite proxy**: The UI dev server proxies `/api/*` to `localhost:8080` by default; set `VITE_PROXY_TARGET` to change the target. Both services must be running for the health status page to show "Online".
- **Go module path**: The API module is `github.com/0x1d/bench/api`. When adding new packages, import from this path.
- **Coding guidelines**: See `.cursor/rules/` for TypeScript/React and Go coding standards. Follow Conventional Commits for git messages (see `.cursor/rules/general.mdc`).
