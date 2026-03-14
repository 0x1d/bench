# Implementation Plans

This folder contains structured implementation plans for Bench features. Each plan has:

- **README.md** — Overview, current status, quick links (frontmatter: status, created, updated)
- **plan.md** — Full design document (frontmatter: status, created, updated)
- **TASKS.md** — Task index with checkboxes and spec links (frontmatter: status, created, updated)
- **specs/** — Task specs with frontmatter (id, phase, title, state, dependsOn, created, updated)

## Status & Metadata

Plans and tasks use **YAML frontmatter** for metadata:

| Field | Plans | Tasks |
|-------|-------|-------|
| `status` | draft \| ready \| in_progress \| complete | — |
| `state` | — | todo \| in_progress \| done |
| `created` | YYYY-MM-DD | YYYY-MM-DD |
| `updated` | YYYY-MM-DD | YYYY-MM-DD |
| `dependsOn` | — | `["1.1", "2.3"]` — task IDs that must be done first |

**Plan status**: `draft` (specs/plan in progress) → `ready` (ready for dev) → `in_progress` (implementation) → `complete` (done).

Tasks also use markdown checkboxes in TASKS.md: `[ ]` not started, `[x]` done.
Phase status: `TODO` | `IN_PROGRESS` | `DONE`

## Plans

| Plan | Status | Description |
|------|--------|-------------|
| [schema-registry](./schema-registry/) | ready | Schema registry for OpenAPI, AsyncAPI, JSON Schema; flow integration |
