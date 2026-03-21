---
state: IN_PROGRESS
created: 2025-03-21
updated: 2025-03-21
---

# Resource config UX consolidation

> Move resource configuration onto each feature page; slim Configuration to Overview + Agent; rename `resources-page` / `resources-config-page` for clarity.

## Quick links

| Document | Description |
|----------|-------------|
| [plan.md](./plan.md) | Full design document |
| [TASKS.md](./TASKS.md) | Task index and status |
| [specs/](./specs/) | Task specs |

## Current status

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | IN_PROGRESS | Rename modules; config lib; RMW hook |
| 2 | TODO | Extract editor components |
| 3 | TODO | Integrate Filesystem/DB, REST/Schema, Flows/Infra |
| 4 | TODO | Configuration Overview + Agent |
| 5 | TODO | Copy, queries, verification |

**Next up**: Phase 1 — Task 1.2 — Extract `parseConfigToState` / `stateToYaml` into `ui/src/lib/resource-config/`.

## How to use this plan

1. Work on a single task from [TASKS.md](./TASKS.md) following its spec in [specs/](specs/).
2. Check off the task in TASKS.md when done and update phase status.
3. Update `updated` dates in frontmatter when making progress.
