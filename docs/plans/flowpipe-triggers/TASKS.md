---
state: DRAFT
created: 2026-05-08
updated: 2026-05-13
---

# Flowpipe Triggers — Task Tracker

**Status legend**: `[ ]` Not started · `[x]` Done · Phase: `TODO` | `IN_PROGRESS` | `DONE`

**Task specs**: Each task has an execution plan in [specs/](specs/). Read the spec before starting. Task metadata (state, dependsOn) is in spec frontmatter.

**Execution**: Use plan-task-execution and agent-coordination skills when working on the plan.

---

## Phase 1: Trigger Config Model & Parsing

**Phase status**: DONE
**Deliverable**: Config can parse `flowpipe_triggers[]` from config.yaml; model types defined.

### Config

- [x] **1.1** Define trigger type constants and config structs — [specs/1.1-config.md](specs/1.1-config.md)
- [x] **1.2** Add Triggers() helpers to config service — [specs/1.2-config-helpers.md](specs/1.2-config-helpers.md)
- [x] **1.3** Add validation for trigger entries — [specs/1.3-validation.md](specs/1.3-validation.md)

### Model

- [x] **1.4** Create trigger model types — [specs/1.4-model.md](specs/1.4-model.md)

---

## Phase 2: Trigger Service (CRUD + File I/O)

**Phase status**: IN_PROGRESS
**Deliverable**: Service can read, write, list, create, update, delete triggers in Flowpipe mod files.

### Service

- [x] **2.1** Add ListTriggers() and GetTrigger() — [specs/2.1-list-get.md](specs/2.1-list-get.md)
- [x] **2.2** Add CreateTrigger() — [specs/2.2-create.md](specs/2.2-create.md)
- [x] **2.3** Add UpdateTrigger() — [specs/2.3-update.md](specs/2.3-update.md)
- [x] **2.4** Add DeleteTrigger() — [specs/2.4-delete.md](specs/2.4-delete.md)
- [x] **2.5** Add TestTrigger() — [specs/2.5-test.md](specs/2.5-test.md)

### Tests

- [x] **2.6** Service unit tests — [specs/2.6-tests.md](specs/2.6-tests.md)
  - Added comprehensive unit tests for `BuildTriggerHCLBlock` covering all trigger types
  - Tests for `ParseTriggerBlock` to verify HCL parsing
  - Validations tests for required fields
  - Edge case tests for different trigger types
  - 95.5% coverage on `BuildTriggerHCLBlock`
- [x] **2.5** Add TestTrigger() — [specs/2.5-test.md](specs/2.5-test.md)

---

## Phase 3: Trigger API Handlers & Routes

**Phase status**: DONE
**Deliverable**: HTTP endpoints for all trigger operations.

### Handler

- [x] **3.1** Create trigger handlers (list, get, create, update, delete) — [specs/3.1-handlers.md](specs/3.1-handlers.md)
- [x] **3.2** Test trigger handler — [specs/3.2-test-handler.md](specs/3.2-test-handler.md)
- [x] **3.3** Register routes in routes.go — [specs/3.3-routes.md](specs/3.3-routes.md)

### Tests

- [x] **3.4** API integration tests — [specs/3.4-tests.md](specs/3.4-tests.md)

---

## Phase 4: UI - Triggers Management Page

**Phase status**: DONE
**Deliverable**: Full CRUD UI for triggers at `/flows/triggers`.

### Resources Config Page

- [x] **4.1** Add triggers section (list, add, edit, remove) — [specs/4.1-resources-config.md](specs/4.1-resources-config.md)

### Triggers Page

- [x] **4.2** Triggers page (new page) — [specs/4.2-triggers-page.md](specs/4.2-triggers-page.md)
- [x] **4.3** Trigger form dialog (create/edit) — [specs/4.3-trigger-form.md](specs/4.3-trigger-form.md)
- [x] **4.4** Trigger list with filters (by type, flow) — [specs/4.4-trigger-list.md](specs/4.4-trigger-list.md)

---

## Phase 5: UI - Flow Editor Expansion

**Phase status**: DONE
**Deliverable**: Trigger editor panel in flow editor for each flow.

### Flow Editor

- [x] **5.1** Trigger tab in flow editor panel — [specs/5.1-flow-editor.md](specs/5.1-flow-editor.md)
- [x] **5.2** Trigger list in flow panel — [specs/5.2-flow-triggers.md](specs/5.2-flow-triggers.md)
- [x] **5.3** Inline trigger CRUD in editor — [specs/5.3-inline-editor.md](specs/5.3-inline-editor.md)

---

## Phase 6: Webhook URL + Testing

**Phase status**: DONE
**Deliverable**: Webhook URL exposure and trigger testing functionality.

### Webhook

- [x] **6.1** Webhook URL generation — [specs/6.1-webhook-url.md](specs/6.1-webhook-url.md)
- [x] **6.2** Test webhook endpoint — [specs/6.2-test-webhook.md](specs/6.2-test-webhook.md)

---

## Progress Summary

| Phase | Tasks | Done | Status |
|-------|-------|------|--------|
| 1 | 4 | 4 | DONE |
| 2 | 6 | 6 | DONE |
| 3 | 4 | 4 | DONE |
| 4 | 4 | 4 | DONE |
| 5 | 3 | 3 | DONE |
| 6 | 2 | 2 | DONE |

---

## Notes

- **dependsOn**: Cross-phase dependencies use prior phase's last task (e.g., Phase 2 tasks depend on `1.4`)
- **Task state**: Set to `IN_PROGRESS` when claiming; `DONE` when complete
- **Flutter**: Phases 4-6 can proceed in parallel with Phase 3
