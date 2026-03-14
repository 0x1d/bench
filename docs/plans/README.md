# Implementation Plans

This folder contains structured implementation plans for Bench features. Each plan has:

- **README.md** — Overview, current status, quick links (frontmatter: state, created, updated)
- **plan.md** — Full design document (frontmatter: state, created, updated)
- **TASKS.md** — Task index with checkboxes and spec links (frontmatter: state, created, updated)
- **specs/** — Task specs with frontmatter (id, phase, title, state, dependsOn, created, updated)

## Status & Metadata

Plans and tasks use **YAML frontmatter** for metadata:

| Field | Plans | Tasks |
|-------|-------|-------|
| `state` | draft \| in_progress \| done | todo \| in_progress \| done |
| `created` | YYYY-MM-DD | YYYY-MM-DD |
| `updated` | YYYY-MM-DD | YYYY-MM-DD |
| `dependsOn` | — | `["1.1", "2.3"]` — task IDs that must be done first |

Tasks also use markdown checkboxes in TASKS.md: `[ ]` not started, `[x]` done.
Phase status: `TODO` | `IN_PROGRESS` | `DONE`

## Plans

| Plan | Status | Description |
|------|--------|-------------|
| [schema-registry](./schema-registry/) | In progress | Schema registry for OpenAPI, AsyncAPI, JSON Schema; flow integration |
