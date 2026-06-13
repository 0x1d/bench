---
state: DONE
created: 2026-05-08
updated: 2026-05-14
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
| 1 | DONE | Trigger config model and parsing |
| 2 | DONE | Trigger service (CRUD, file I/O) |
| 3 | DONE | Trigger API handlers and routes |
| 4 | DONE | UI - Triggers management page |
| 5 | DONE | UI - Flow editor expansion |
| 6 | DONE | Webhook URL + testing |

## Fixes Applied (2026-05-14)

### Critical — Route Parameter Mismatch (FIXED)
All trigger endpoints using `{id}` in the route pattern were broken because handlers read `r.PathValue("flowId")` but routes defined `{id}`.

**Fix**: Changed route patterns from `{id}` to `{flowId}` then to `{moduleId}` in `routes.go`.

### Critical — Flow vs Module Architecture (FIXED)
The original implementation used "Flow" to determine which `.fp` file to write triggers to. Per [Flowpipe's trigger documentation](https://flowpipe.io/docs/build/triggers), triggers are defined at the **module** level, not the flow level.

**Fix**: Renamed `Flow` → `Module` throughout the codebase (model, config, service, handlers, routes, UI). Triggers are now written to `triggers.fp` in the module directory.

### High — Workspace and Label Persistence (FIXED)
Trigger metadata (`workspace`, `label`) was lost on subsequent reads because only the `.fp` file was written, not config.yaml.

**Fix**: `CreateTrigger` and `UpdateTrigger` now persist trigger metadata to `config.yaml` under `flowpipe_triggers.triggers[]`. `ListTriggers` and `GetTrigger` enrich parsed HCL data with config.yaml metadata.

### Medium — HCL Regex Nested Braces (FIXED)
The trigger block regex `[^}]*` stopped at the first `}` character, breaking HTTP triggers with JSON body fields.

**Fix**: Replaced regex-based parsing with balanced brace counting. `parseTriggerBlocks()` finds matching `{...}` pairs by tracking brace depth, correctly handling nested braces in string values.

### UI — Pipeline Reference Selector (ADDED)
The trigger form now uses a `PipelineRefInput` component (adapted from the flow step panel) that provides autocomplete from existing pipelines. Users can select from available pipelines or type a custom reference.

## API Route Structure

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/flows/triggers` | List all triggers |
| POST | `/api/flows/triggers` | Create trigger (module from body) |
| GET | `/api/flows/triggers/root/{triggerId}` | Get root module trigger |
| PUT | `/api/flows/triggers/root/{triggerId}` | Update root module trigger |
| DELETE | `/api/flows/triggers/root/{triggerId}` | Delete root module trigger |
| POST | `/api/flows/triggers/root/{triggerId}/test` | Test root module trigger |
| GET | `/api/flows/triggers/root/{triggerId}/webhook` | Get root module webhook URL |
| GET | `/api/flows/{moduleId}/triggers/{triggerId}` | Get module trigger |
| PUT | `/api/flows/{moduleId}/triggers/{triggerId}` | Update module trigger |
| DELETE | `/api/flows/{moduleId}/triggers/{triggerId}` | Delete module trigger |
| POST | `/api/flows/{moduleId}/triggers/{triggerId}/test` | Test module trigger |
| GET | `/api/flows/{moduleId}/triggers/{triggerId}/webhook` | Get module webhook URL |

## How to Use This Plan

1. Pick a task from TASKS.md
2. Set `state: IN_PROGRESS` in the spec frontmatter (claim the task)
3. Implement the task per the spec
4. Set `state: DONE` and update TASKS.md when complete
5. Update "Last updated" when making progress
