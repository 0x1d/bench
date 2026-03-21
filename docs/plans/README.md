# Implementation Plans

This folder contains structured implementation plans for Bench features. Each plan has:

- **README.md** — Overview, current state, quick links (frontmatter: state, created, updated)
- **plan.md** — Full design document (frontmatter: state, created, updated)
- **TASKS.md** — Task index with checkboxes and spec links (frontmatter: state, created, updated)
- **specs/** — Task specs with frontmatter (id, phase, title, state, dependsOn, created, updated)

## Status & Metadata

Plans and tasks use **YAML frontmatter** for metadata:

| Field | Plans | Tasks |
|-------|-------|-------|
| `state` | DRAFT \| READY \| IN_PROGRESS \| DONE | TODO \| IN_PROGRESS \| DONE \| DEFERRED |
| `created` | YYYY-MM-DD | YYYY-MM-DD |
| `updated` | YYYY-MM-DD | YYYY-MM-DD |
| `dependsOn` | — | `["1.1", "2.3"]` — task IDs that must be done first |

**Plan state**: `DRAFT` (specs/plan in progress) → `READY` (ready for dev) → `IN_PROGRESS` (implementation) → `DONE` (done).

**Task state**: `DEFERRED` = out of scope for now; skip when picking tasks.

Tasks also use markdown checkboxes in TASKS.md: `[ ]` not started, `[x]` done.
Phase status: `TODO` | `IN_PROGRESS` | `DONE`

## Plans

| Plan | Status | Description |
|------|--------|-------------|
| [schema-registry](./schema-registry/) | READY | Schema registry for OpenAPI, AsyncAPI, JSON Schema; flow integration |
| [resource-config-ux-consolidation](./resource-config-ux-consolidation/) | READY | Per-page resource settings; Configuration Overview + Agent; rename filesystem/configuration modules |
