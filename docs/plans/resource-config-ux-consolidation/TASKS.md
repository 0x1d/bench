---
state: IN_PROGRESS
created: 2025-03-21
updated: 2025-03-21
---

# Resource config UX consolidation — Task tracker

**Status legend**: `[ ]` Not started · `[x]` Done · Phase: `TODO` | `IN_PROGRESS` | `DONE`

**Task specs**: Each task has an execution plan in [specs/](specs/). Task metadata (state, dependsOn) is in spec frontmatter.

---

## Phase 1: Foundation — rename and config module

**Phase status**: IN_PROGRESS  
**Deliverable**: Clear filenames, shared parse/serialize/hook for safe YAML updates.

- [x] **1.1** Rename page modules — [specs/1.1-rename-page-modules.md](specs/1.1-rename-page-modules.md)
- [x] **1.2** Extract config parse and serialize — [specs/1.2-config-parse-serialize.md](specs/1.2-config-parse-serialize.md)
- [ ] **1.3** useResourceConfig hook — [specs/1.3-use-resource-config-hook.md](specs/1.3-use-resource-config-hook.md)

---

## Phase 2: Extract editor components

**Phase status**: TODO  
**Deliverable**: Reusable settings UI for each resource type (and agent form for reuse).

- [ ] **2.1** Extract resource editor components — [specs/2.1-extract-editor-components.md](specs/2.1-extract-editor-components.md)

---

## Phase 3: Integrate feature pages

**Phase status**: TODO  
**Deliverable**: Browse/Settings (or extended) tabs on each feature page with saves wired to RMW hook.

- [ ] **3.1** Integrate Filesystem and Database pages — [specs/3.1-integrate-filesystem-database.md](specs/3.1-integrate-filesystem-database.md)
- [ ] **3.2** Integrate REST and Schema browser pages — [specs/3.2-integrate-rest-schema.md](specs/3.2-integrate-rest-schema.md)
- [ ] **3.3** Integrate Flows and Infrastructure pages — [specs/3.3-integrate-flows-infrastructure.md](specs/3.3-integrate-flows-infrastructure.md)

---

## Phase 4: Configuration page

**Phase status**: TODO  
**Deliverable**: `ConfigurationPage` with Overview + Agent only.

- [ ] **4.1** Configuration Overview and Agent tabs — [specs/4.1-configuration-overview-agent.md](specs/4.1-configuration-overview-agent.md)

---

## Phase 5: Polish and verification

**Phase status**: TODO  
**Deliverable**: Updated copy, optional `NotConfiguredCard` enhancements, full quality gate.

- [ ] **5.1** Copy, navigation, and query invalidation — [specs/5.1-copy-navigation-queries.md](specs/5.1-copy-navigation-queries.md)
- [ ] **5.2** Verification and documentation — [specs/5.2-verification-and-docs.md](specs/5.2-verification-and-docs.md)

---

## Progress summary

| Phase | Tasks | Done | Status |
|-------|-------|------|--------|
| 1 | 3 | 2 | IN_PROGRESS |
| 2 | 1 | 0 | TODO |
| 3 | 3 | 0 | TODO |
| 4 | 1 | 0 | TODO |
| 5 | 2 | 0 | TODO |

**Next up**: Phase 1 — Task 1.3 (`useResourceConfig` hook).
