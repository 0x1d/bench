---
state: READY
created: 2025-03-13
updated: 2025-03-13
---

# Schema Registry Plan

> Evolve REST + OpenAPI integration into a unified Schema Registry for OpenAPI, AsyncAPI, JSON Schema, and future formats.

## Quick Links

| Document | Description |
|----------|-------------|
| [plan.md](./plan.md) | Full design document |
| [TASKS.md](./TASKS.md) | Task index and status |
| [specs/](./specs/) | Task specs — execution plans for each task |

## Current Status

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | TODO | Schema registry API (list, get, content) |
| 2 | TODO | REST uses schemaId; backward compat |
| 3 | TODO | Schema config UI, standalone schemas |
| 4 | TODO | Schema type abstraction (parsers) |
| 5 | TODO | AsyncAPI flow integration |
| 6 | TODO | JSON Schema support |

**Next up**: Phase 1 — implement schema registry API.

## How to Use This Plan

1. **Pick a task** from [TASKS.md](./TASKS.md) — check `dependsOn` in spec frontmatter; only pick tasks whose dependencies are done
2. **Check off** `[ ]` → `[x]` in TASKS.md when done
3. **Update spec frontmatter**: set `state: DONE` and `updated: YYYY-MM-DD` in the spec file
4. **Update phase status** when a phase is complete (`TODO` → `IN_PROGRESS` → `DONE`)
5. **Update `updated`** and `state` in plan.md, TASKS.md, and README.md frontmatter when making progress (state: `DRAFT` → `READY` when specs done; `READY` → `IN_PROGRESS` when implementation starts; `IN_PROGRESS` → `DONE` when done)

## Summary

- **Goal**: Centralize schema storage so OpenAPI, AsyncAPI, JSON Schema can be used in flows and future features
- **Approach**: Phased rollout; backward compatible with existing `openapiSpec`
- **Effort**: Phases 1–2 small; 3–4 medium; 5–6 larger
