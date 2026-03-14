---
name: plan-creation
description: Create implementation plans with tasks and specs. Use when starting a new feature, large refactor, or multi-step initiative that needs structured tracking.
---
# Plan Creation

Use this skill when creating a new implementation plan for Bench. Plans live in `docs/plans/` and consist of a design document, task index, and executable task specs.

## Feature Branch

Plans **must** be created and developed on a feature branch.

- **Branch name**: `feat/{feature-name}` — name after the feature, not the plan (e.g. `feat/schema-registry`, not `feat/schema-registry-plan`).
- If already on a feature branch for this plan, proceed.
- If on `main` or another non-feature branch, create a feature branch: `git checkout -b feat/{feature-name}`
- Follow project branch naming: `feat/`, `fix/`, `chore/`
- **When the plan is created**: Commit all plan files to the feature branch and push: `git add docs/plans/... && git commit -m "docs: add {feature} implementation plan" && git push -u origin feat/{feature-name}`
- Do not add plans directly to `main`.

## When to Create a Plan

- New feature spanning API + UI (e.g. schema registry, new resource type)
- Large refactor with multiple phases
- Initiative with 5+ distinct tasks or 2+ phases
- Work that will be done incrementally or by multiple agents

## Folder Structure

```
docs/plans/{plan-name}/
├── README.md      # Overview, status, quick links
├── plan.md        # Full design document
├── TASKS.md       # Task index with checkboxes and spec links
└── specs/         # One spec per task
    ├── README.md  # Spec format, index
    ├── 1.1-*.md
    ├── 1.2-*.md
    └── ...
```

Use `kebab-case` for plan name (e.g. `schema-registry`, `oauth-providers`).

## 1. Create plan.md (Design Document)

Add **frontmatter** at the top:

```yaml
---
state: DRAFT | READY | IN_PROGRESS | DONE
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

**Plan state**:

| State | Meaning |
|-------|---------|
| `DRAFT` | Specs and plan being worked on; not ready for implementation |
| `READY` | Plan and specs complete; ready for development |
| `IN_PROGRESS` | Implementation being worked on |
| `DONE` | Plan fully implemented |

Include these sections:

| Section | Purpose |
|---------|---------|
| **Executive Summary** | 1–2 paragraphs: what, why, outcome |
| **Current State** | What exists today; tables by layer (config, API, UI) |
| **Goals** | Numbered list of objectives |
| **Architecture** | Data model, config structure, API endpoints; diagrams if helpful |
| **Implementation Phases** | Phases with scope and deliverable; link to TASKS.md |
| **Data Model** | Structs, config YAML examples |
| **Security** | Path traversal, auth, validation |
| **Testing Strategy** | Unit, integration, regression |
| **Migration** | Backward compat, user migration path |
| **Future Enhancements** | Out-of-scope ideas |

Reference: `docs/plans/schema-registry/plan.md`

## 2. Break Work into Phases

- **Phase** = one deliverable; can be shipped independently
- Order phases by dependency (Phase 2 builds on Phase 1)
- Keep phases small enough to complete in 1–2 sessions
- Typical: 3–6 phases per plan

Example: Phase 1 (API core) → Phase 2 (integration) → Phase 3 (UI) → Phase 4+ (extensions)

## 3. Break Phases into Tasks

- **Task** = one logical unit an agent can execute in one go
- One task ≈ one spec file
- Group related work (e.g. "Config" = struct + validation + helpers + example)
- Typical: 3–8 tasks per phase

Task ID format: `{phase}.{index}` (e.g. 1.1, 1.2, 2.1)

## 4. Create TASKS.md (Task Index)

Add **frontmatter** (use same `state` as plan.md):

```yaml
---
state: DRAFT | READY | IN_PROGRESS | DONE
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

```markdown
# Plan Name — Task Tracker

**Status legend**: `[ ]` Not started · `[x]` Done · Phase: `TODO` | `IN_PROGRESS` | `DONE`

**Task specs**: Each task has an execution plan in [specs/](specs/). Task metadata (state, dependsOn) is in spec frontmatter.

---

## Phase 1: Phase Title

**Phase status**: TODO
**Deliverable**: One-line outcome

### Section

- [ ] **1.1** Task title — [specs/1.1-config.md](specs/1.1-config.md)
- [ ] **1.2** Task title — [specs/1.2-model.md](specs/1.2-model.md)

---

## Progress Summary

| Phase | Tasks | Done | Status |
|-------|-------|------|--------|
| 1 | 5 | 0 | TODO |
...
```

## 5. Create Task Specs

Each spec file: `specs/{phase}.{index}-{slug}.md` (e.g. `1.1-config.md`)

### Spec Template

Add **frontmatter** with task metadata:

```yaml
---
id: "{id}"
phase: {n}
title: {Title}
state: TODO | IN_PROGRESS | DONE
dependsOn: ["1.1", "1.2"]   # task IDs that must be done first; [] for first task
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

```markdown
# Task {id}: {Title}

## Context

{2–4 sentences: what, why, design decisions. Reference plan.md sections.}

## Steps

1. **Action** — detail
2. **Action** — detail
...

## Files

| Path | Action |
|------|--------|
| path/to/file | Create / Modify |

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
...

## Validation

```bash
cd api && go vet ./... && go test ./...
```
```

### Spec Rules

- **Frontmatter**: Include `id`, `phase`, `title`, `state` (TODO | IN_PROGRESS | DONE), `dependsOn`, `created`, `updated`
- **dependsOn**: Array of task IDs; use `[]` for tasks with no prerequisites; cross-phase deps use prior phase's last task (e.g. `["1.5"]` for first task of phase 2)
- **Context**: Enough for an agent to understand without reading the full plan
- **Steps**: Numbered, concrete, actionable
- **Files**: Exhaustive list; agent should only touch these
- **Acceptance**: Verifiable; use checkboxes
- **Validation**: Commands that must pass (vet, test, lint, build)

Reference: `docs/plans/schema-registry/specs/1.1-config.md`

## 6. Create README.md (Plan Overview)

Add **frontmatter** (same as plan.md):

```yaml
---
state: DRAFT | READY | IN_PROGRESS | DONE
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

```markdown
# Plan Title

> One-line description

## Quick Links

| Document | Description |
|----------|-------------|
| [plan.md](./plan.md) | Full design document |
| [TASKS.md](./TASKS.md) | Task index and status |
| [specs/](./specs/) | Task specs |

## Current Status

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | TODO | ... |
...

**Next up**: Phase 1 — ...

## How to Use This Plan

1. Pick a task from TASKS.md
2. Check off when done
3. Update phase status
4. Update "Last updated" when making progress
```

## 7. Create specs/README.md

- Document **frontmatter** fields: `id`, `phase`, `title`, `state`, `dependsOn`, `created`, `updated`
- Explain body sections: Context, Steps, Files, Acceptance, Validation
- Table: ID | Spec | Phase for all specs

## 8. Register the Plan

Add a row to `docs/plans/README.md` in the Plans table:

```markdown
| [plan-name](./plan-name/) | TODO | Short description |
```

## Checklist

- [ ] On a feature branch (create one if not)
- [ ] plan.md, TASKS.md, README.md have frontmatter (state, created, updated)
- [ ] plan.md has all sections
- [ ] Phases are ordered by dependency
- [ ] Each task has a spec file with frontmatter (id, phase, title, state, dependsOn, created, updated)
- [ ] Specs have Context, Steps, Files, Acceptance, Validation
- [ ] dependsOn correctly chains tasks (cross-phase: last task of prior phase)
- [ ] TASKS.md links every task to its spec
- [ ] README.md has state table and quick links
- [ ] Plan registered in docs/plans/README.md
- [ ] Plan committed and pushed to feature branch (`git add`, `git commit`, `git push -u origin feat/{feature-name}`)
