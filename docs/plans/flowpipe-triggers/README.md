---
state: DRAFT
created: 2026-05-08
updated: 2026-05-08
---

# Flowpipe Triggers Implementation Plan

> Add Flowpipe trigger configuration and management to Bench, enabling users to create, edit, and test triggers that automatically execute pipelines when events occur.

## Quick Links

| Document | Description |
|----------|-------------|
| [plan.md](./plan.md) | Full design document |
| [TASKS.md](./TASKS.md) | Task index and status |
| [specs/](./specs/) | Task specs |

## Current Status

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | TODO | Trigger config model and parsing |
| 2 | TODO | Trigger service (CRUD, file I/O) |
| 3 | TODO | Trigger API handlers and routes |
| 4 | TODO | UI - Triggers management page |
| 5 | TODO | UI - Flow editor expansion |
| 6 | TODO | Webhook URL + testing |

**Next up**: Phase 1 — Define trigger types and configuration model.

## How to Use This Plan

1. Pick a task from TASKS.md
2. Set `state: IN_PROGRESS` in the spec frontmatter (claim the task)
3. Implement the task per the spec
4. Set `state: DONE` and updateTASKS.md when complete
5. Update "Last updated" when making progress
