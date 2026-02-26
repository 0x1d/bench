# bench

A tool for managing and running [ComfyUI](https://github.com/comfyanonymous/ComfyUI) workflows.

## Project Structure

```
bench/
├── api/       # Go backend API
├── ui/        # React/TypeScript frontend (Vite)
└── .cursor/   # Cursor IDE rules and guidelines
```

## Prerequisites

- [Go](https://go.dev/) 1.22+
- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 10+

## Getting Started

### API

```bash
cd api
go run ./cmd/server
```

The API server starts on `http://localhost:8080`.

### UI

```bash
cd ui
pnpm install
pnpm dev
```

The dev server starts on `http://localhost:5173` and proxies API requests to the backend.
Set `VITE_PROXY_TARGET` to override the default proxy target (`http://localhost:8080`).

## Development

- See `.cursor/rules/` for coding guidelines.
- Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.
- Run linters before committing: `pnpm lint` (UI), `golangci-lint run` (API).
