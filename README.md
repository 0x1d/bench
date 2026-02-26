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
Set `API_TOKEN` before starting the API. Requests must include this value in the `X-API-Token` header.

### UI

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

## Development

- See `.cursor/rules/` for coding guidelines.
- Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.
- Run linters before committing: `pnpm lint` (UI), `golangci-lint run` (API).
