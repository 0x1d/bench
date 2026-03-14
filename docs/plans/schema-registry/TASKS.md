---
state: READY
created: 2025-03-13
updated: 2025-03-14
---

# Schema Registry — Task Tracker

**Status legend**: `[ ]` Not started · `[x]` Done · Phase: `TODO` | `IN_PROGRESS` | `DONE`

**Task specs**: Each task has an execution plan in [specs/](specs/). Read the spec before starting. Task metadata (state, dependsOn) is in spec frontmatter.

---

## Phase 1: Schema Registry Core (API)

**Phase status**: TODO  
**Deliverable**: API can list and serve schema content; no UI changes yet.

### Config

- [ ] **1.1** Add schema config (SchemaEntry, schemas array, helpers, validation, example) — [specs/1.1-config.md](specs/1.1-config.md)

### Model

- [ ] **1.2** Create schema model (SchemaEntry, SchemaResource) — [specs/1.2-model.md](specs/1.2-model.md)

### Service

- [ ] **1.3** Create schema service (List, Get, Content) — [specs/1.3-service.md](specs/1.3-service.md)

### Handler & Routes

- [ ] **1.4** Create schema handlers and register routes — [specs/1.4-handler.md](specs/1.4-handler.md)

### Tests

- [ ] **1.5** Unit and integration tests — [specs/1.5-tests.md](specs/1.5-tests.md)

---

## Phase 2: REST Migration to Schema Registry

**Phase status**: TODO  
**Deliverable**: Config can use `schemaId`; existing `openapiSpec` still works.

### Config

- [ ] **2.1** Add SchemaID to RestEntry, validation — [specs/2.1-config.md](specs/2.1-config.md)

### REST Service

- [ ] **2.2** Update Spec() to use schema registry, add SchemaID to RestResource — [specs/2.2-rest-service.md](specs/2.2-rest-service.md)

### Tests

- [ ] **2.3** REST spec resolution tests — [specs/2.3-tests.md](specs/2.3-tests.md)

---

## Phase 3: Schema Registry UI & Standalone Schemas

**Phase status**: TODO  
**Deliverable**: Users can manage schemas in config; REST can reference them.

### Resources Config Page

- [ ] **3.1** Add schemas section (list, add, edit, remove) — [specs/3.1-resources-config.md](specs/3.1-resources-config.md)

### REST Resource Form

- [ ] **3.2** Add schemaId dropdown to REST form — [specs/3.2-rest-form.md](specs/3.2-rest-form.md)

### Optional

- [ ] **3.3** Schema browser page — [specs/3.3-schema-browser.md](specs/3.3-schema-browser.md)

---

## Phase 4: Schema Type Abstraction (Parsers)

**Phase status**: TODO  
**Deliverable**: Parsing layer supports OpenAPI + AsyncAPI; JSON Schema later.

### UI Lib

- [ ] **4.1** Create schema-registry.ts (detectSchemaType, parseSchema) — [specs/4.1-schema-registry-lib.md](specs/4.1-schema-registry-lib.md)
- [ ] **4.2** Create asyncapi.ts — [specs/4.2-asyncapi-lib.md](specs/4.2-asyncapi-lib.md)

---

## Phase 5: JSON Schema & Validation

**Phase status**: TODO  
**Deliverable**: JSON Schema schemas registered and usable for validation.

### Config & API

- [ ] **6.1** JSON Schema support and optional validation — [specs/6.1-json-schema.md](specs/6.1-json-schema.md)

---

## Deferred (Future)

Kafka/messaging step and AsyncAPI flow integration — not in current scope. Specs kept for reference:

- [specs/5.1-messaging-config.md](specs/5.1-messaging-config.md)
- [specs/5.2-kafka-step.md](specs/5.2-kafka-step.md)
- [specs/5.3-asyncapi-ui.md](specs/5.3-asyncapi-ui.md)

---

## Progress Summary

| Phase | Tasks | Done | Status |
|-------|-------|------|--------|
| 1 | 5 | 0 | TODO |
| 2 | 3 | 0 | TODO |
| 3 | 3 | 0 | TODO |
| 4 | 2 | 0 | TODO |
| 5 | 1 | 0 | TODO |

Metadata in frontmatter (`updated`).
