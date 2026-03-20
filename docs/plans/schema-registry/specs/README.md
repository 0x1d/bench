# Schema Registry — Task Specs

Each spec is an execution plan for an agent. Read the spec before starting the task; follow the steps in order.

## Spec Format

Every spec has **frontmatter** (YAML between `---`) and body sections.

### Frontmatter

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Task ID (e.g. `"1.1"`) |
| `phase` | number | Phase number |
| `title` | string | Short title (do not include phase; use `phase` field) |
| `state` | string | `TODO` \| `IN_PROGRESS` \| `DONE` \| `DEFERRED` |
| `dependsOn` | string[] | Task IDs that must be done first |
| `optional` | boolean | (optional) Task is optional |
| `created` | string | ISO date (YYYY-MM-DD) |
| `updated` | string | ISO date (YYYY-MM-DD) |

### Body Sections

- **Context** — Background and design decisions
- **Steps** — Numbered actions to perform
- **Files** — Paths to create or modify
- **Acceptance criteria** — How to verify completion
- **Validation** — Commands to run (vet, test, build)

## Spec Index

| ID | Spec | Phase |
|----|------|-------|
| 1.1 | [1.1-config.md](1.1-config.md) | 1 — Config |
| 1.2 | [1.2-model.md](1.2-model.md) | 1 — Model |
| 1.3 | [1.3-service.md](1.3-service.md) | 1 — Service |
| 1.4 | [1.4-handler.md](1.4-handler.md) | 1 — Handler & Routes |
| 1.5 | [1.5-tests.md](1.5-tests.md) | 1 — Tests |
| 2.1 | [2.1-config.md](2.1-config.md) | 2 — Config |
| 2.2 | [2.2-rest-service.md](2.2-rest-service.md) | 2 — REST Service |
| 2.3 | [2.3-tests.md](2.3-tests.md) | 2 — Tests |
| 3.1 | [3.1-resources-config.md](3.1-resources-config.md) | 3 — Resources Config UI |
| 3.2 | [3.2-rest-form.md](3.2-rest-form.md) | 3 — REST Form |
| 3.3 | [3.3-schema-browser.md](3.3-schema-browser.md) | 3 — Schema Browser |
| 4.1 | [4.1-schema-registry-lib.md](4.1-schema-registry-lib.md) | 4 — Schema Registry Lib |
| 4.2 | [4.2-asyncapi-lib.md](4.2-asyncapi-lib.md) | 4 — AsyncAPI Lib |
| 6.1 | [6.1-json-schema.md](6.1-json-schema.md) | 5 — JSON Schema |

**Deferred** (specs for reference): [5.1](5.1-messaging-config.md) · [5.2](5.2-kafka-step.md) · [5.3](5.3-asyncapi-ui.md)
