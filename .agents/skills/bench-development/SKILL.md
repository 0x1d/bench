---
name: bench-development
description: Bench monorepo — api/ Go backend, ui/ React frontend, structure, Conventional Commits, gofmt, React Query, dev.sh. Use for any code change in this repo, new features, refactors, API handlers, or cross-cutting work. Invoke for Bench development tasks; required alongside area-specific skills (e.g. bench-ui for ui/).
---

# Bench Development Guidelines

**Invoke this skill for almost any Bench code change** in `api/`, `ui/`, or repo tooling. Pair with **bench-ui** when editing the frontend.

This skill provides the core development guidelines for the `bench` monorepo. Use these guidelines whenever you create or modify code in this repository.

## Project Structure
- `api/`: Go 1.22+ backend API.
- `ui/`: React 19 + TypeScript + Vite frontend.

## Generative AI Guidelines
- **Commit Messages**: Follow Conventional Commits format (`type(scope): summary`).
- **Small Commits**: One logical unit of work per commit.

## Go API (`api/`)
- **Formatting**: Always format with `gofmt` before committing.
- **Error Handling**: Never ignore errors. Wrap errors with `fmt.Errorf("context: %w", err)`. Return them to callers.
- **Naming**: `PascalCase` for exported, `camelCase` for unexported.
- **Concurrency**: Prefer channels, always clean up goroutines using context cancellation.
- **Testing**: Write table-driven tests.

## React UI (`ui/`)
- **TypeScript**: Strict mode. Use interfaces for object shapes, prefer `unknown` over `any`.
- **Components**: Functional components only. Keep them small (<100 lines). `PascalCase` naming.
- **State**: Minimize `useState` and `useEffect`. Use TanStack React Query for data fetching.
- **Styling**: Tailwind CSS and **shadcn/ui** components. Avoid inline styles.
- **File Naming**: `kebab-case.ts/tsx`.

## Development & Verification
- **Running Locally**: Use `./dev.sh` to run both services (API and UI) locally.
- **Verification**: When verifying changes or testing functionality, you **MUST** ensure the backend and UI are running via `./dev.sh`.
- **Termination**: Do not run `docker compose` in detached mode (`-d`) for local dev; let it run in the foreground so Ctrl+C stops it gracefully.
