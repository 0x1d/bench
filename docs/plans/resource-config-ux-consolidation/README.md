---
state: READY
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
| 1 | TODO | Rename modules; config lib; RMW hook |
| 2 | TODO | Extract editor components |
| 3 | TODO | Integrate Filesystem/DB, REST/Schema, Flows/Infra |
| 4 | TODO | Configuration Overview + Agent |
| 5 | TODO | Copy, queries, verification |

**Next up**: Phase 1 — Task 1.1 — Rename `resources-page.tsx` → `filesystem-page.tsx` and `resources-config-page.tsx` → `configuration-page.tsx`.

## How to use this plan

1. Work on a single task from [TASKS.md](./TASKS.md) following its spec in [specs/](specs/).
2. Check off the task in TASKS.md when done and update phase status.
3. Update `updated` dates in frontmatter when making progress.
