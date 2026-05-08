---
state: DRAFT
created: 2026-05-08
updated: 2026-05-08
---

# Task Specs

This folder contains task execution specs for the Flowpipe Triggers implementation plan.

## Spec Format

Each spec file (`{phase}.{index}-{slug}.md`) follows this structure:

### Frontmatter

```yaml
---
id: "{phase}.{index}"
phase: {n}
title: {Title}
state: TODO | IN_PROGRESS | DONE | DEFERRED
dependsOn: ["1.1", "1.2"]   # optional: task IDs that must be done first
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

### Body

```markdown
# Task {id}: {Title}

## Context

2-4 sentences: what, why, design decisions. Reference plan.md sections.

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

### Rules

- **Frontmatter**: Required fields are `id`, `phase`, `title`, `state`, `created`, `updated`
- **dependsOn**: Array of task IDs; use `[]` for tasks with no prerequisites
- **Context**: Enough for an agent to understand without reading the full plan
- **Steps**: Numbered, concrete, actionable
- **Files**: Exhaustive list; agent should only touch these
- **Acceptance**: Verifiable; use checkboxes
- **Validation**: Commands that must pass (vet, test, lint, build)

---

## Task Index

| ID | Spec | Phase | Title |
|----|------|-------|-------|
| 1.1 | [specs/1.1-config.md](1.1-config.md) | 1 | Trigger Config Model |
| 1.2 | [specs/1.2-config-helpers.md](1.2-config-helpers.md) | 1 | Trigger Config Helpers |
| 1.3 | [specs/1.3-validation.md](1.3-validation.md) | 1 | Trigger Validation |
| 1.4 | [specs/1.4-model.md](1.4-model.md) | 1 | Trigger Model Types |
| 2.1 | [specs/2.1-list-get.md](2.1-list-get.md) | 2 | List and Get Triggers |
| 2.2 | [specs/2.2-create.md](2.2-create.md) | 2 | Create Trigger |
| 2.3 | [specs/2.3-update.md](2.3-update.md) | 2 | Update Trigger |
| 2.4 | [specs/2.4-delete.md](2.4-delete.md) | 2 | Delete Trigger |
| 2.5 | [specs/2.5-test.md](2.5-test.md) | 2 | Test Trigger |
| 2.6 | [specs/2.6-tests.md](2.6-tests.md) | 2 | Service Unit Tests |
| 3.1 | [specs/3.1-handlers.md](3.1-handlers.md) | 3 | Trigger Handlers |
| 3.2 | [specs/3.2-test-handler.md](3.2-test-handler.md) | 3 | Test Trigger Handler |
| 3.3 | [specs/3.3-routes.md](3.3-routes.md) | 3 | Register Trigger Routes |
| 3.4 | [specs/3.4-tests.md](3.4-tests.md) | 3 | API Integration Tests |
| 4.1 | [specs/4.1-resources-config.md](4.1-resources-config.md) | 4 | Add Triggers Config Section |
| 4.2 | [specs/4.2-triggers-page.md](4.2-triggers-page.md) | 4 | Triggers Page |
| 4.3 | [specs/4.3-trigger-form.md](4.3-trigger-form.md) | 4 | Trigger Form Dialog |
| 4.4 | [specs/4.4-trigger-list.md](4.4-trigger-list.md) | 4 | Trigger List Component |
| 5.1 | [specs/5.1-flow-editor.md](5.1-flow-editor.md) | 5 | Trigger Tab in Flow Editor |
| 5.2 | [specs/5.2-flow-triggers.md](5.2-flow-triggers.md) | 5 | Flow Triggers List |
| 5.3 | [specs/5.3-inline-editor.md](5.3-inline-editor.md) | 5 | Inline Trigger Editor |
| 6.1 | [specs/6.1-webhook-url.md](6.1-webhook-url.md) | 6 | Webhook URL Generation |
| 6.2 | [specs/6.2-test-webhook.md](6.2-test-webhook.md) | 6 | Test Webhook Endpoint |
