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
Starts Vite dev server on `:5173`. Set `VITE_API_BASE_URL` to point the UI and Vite proxy at your API host (host-only or full `/api` URL). If unset, it defaults to `http://localhost:8080/api`.

### Lint / Test / Build

| Check | API (`api/`) | UI (`ui/`) |
|-------|-------------|-----------|
| Lint | `go vet ./...` | `pnpm lint` |
| Test | `go test ./...` | `pnpm build` (type-check + build) |
| Build | `go build ./cmd/server` | `pnpm build` |
| Format | `gofmt -w .` | handled by ESLint |

### Non-obvious caveats

- **esbuild build scripts**: The `ui/package.json` includes `pnpm.onlyBuiltDependencies: ["esbuild"]` to allow esbuild's postinstall script non-interactively. Do not run `pnpm approve-builds` (interactive).
- **Vite proxy**: The UI uses `VITE_API_BASE_URL` for both frontend API calls and dev proxy routing. If unset, the default is `http://localhost:8080/api`.
- **Go module path**: The API module is `github.com/0x1d/bench/api`. When adding new packages, import from this path.
- **Coding guidelines**: See `.cursor/rules/` for TypeScript/React and Go coding standards. Follow Conventional Commits for git messages (see `.cursor/rules/general.mdc`).
