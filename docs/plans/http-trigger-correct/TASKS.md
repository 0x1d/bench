---
state: READY
created: 2026-05-14
updated: 2026-05-14
---

# Correct Flowpipe HTTP Trigger — Task Tracker

**Status legend**: `[ ]` Not started · `[x]` Done · Phase: `TODO` | `IN_PROGRESS` | `DONE`

**Task specs**: Each task has an execution plan in [specs/](specs/). Task metadata (state, dependsOn) is in spec frontmatter.

---

## Phase 1: Consolidate webhook into correct HTTP trigger

**Phase status**: TODO
**Deliverable**: Single `http` trigger type matching Flowpipe's `trigger "http"` spec; `webhook` type removed

### Model + Config

- [ ] **1.1** Remove webhook type, correct HTTP model — [specs/1.1-model.md](specs/1.1-model.md)
- [ ] **1.2** Correct HCL generation and parsing for HTTP trigger — [specs/1.2-hcl.md](specs/1.2-hcl.md)
- [ ] **1.3** Update API handlers and webhook URL endpoint — [specs/1.3-handler.md](specs/1.3-handler.md)
- [ ] **1.4** Update UI types, form, and list components — [specs/1.4-ui.md](specs/1.4-ui.md)
- [ ] **1.5** Update tests and validate end-to-end — [specs/1.5-tests.md](specs/1.5-tests.md)

---

## Progress Summary

| Phase | Tasks | Done | Status |
|-------|-------|------|--------|
| 1 | 5 | 0 | TODO |
