# Task specs — Resource config UX consolidation

## Frontmatter

Each spec includes:

| Field | Values / notes |
|-------|----------------|
| `id` | Task id, e.g. `1.1` |
| `phase` | Phase number |
| `title` | Short title |
| `state` | `TODO` \| `IN_PROGRESS` \| `DONE` \| `DEFERRED` |
| `dependsOn` | Array of task ids, e.g. `["1.1"]` or `[]` |
| `created` | `YYYY-MM-DD` |
| `updated` | `YYYY-MM-DD` |

## Body sections

- **Context** — Why this task exists; link to [plan.md](../plan.md).
- **Steps** — Numbered, actionable.
- **Files** — Table of paths to create or modify.
- **Acceptance criteria** — Checkboxes.
- **Validation** — Commands that must pass.

## Spec index

| ID | Spec | Phase |
|----|------|-------|
| 1.1 | [1.1-rename-page-modules.md](1.1-rename-page-modules.md) | 1 |
| 1.2 | [1.2-config-parse-serialize.md](1.2-config-parse-serialize.md) | 1 |
| 1.3 | [1.3-use-resource-config-hook.md](1.3-use-resource-config-hook.md) | 1 |
| 2.1 | [2.1-extract-editor-components.md](2.1-extract-editor-components.md) | 2 |
| 3.1 | [3.1-integrate-filesystem-database.md](3.1-integrate-filesystem-database.md) | 3 |
| 3.2 | [3.2-integrate-rest-schema.md](3.2-integrate-rest-schema.md) | 3 |
| 3.3 | [3.3-integrate-flows-infrastructure.md](3.3-integrate-flows-infrastructure.md) | 3 |
| 4.1 | [4.1-configuration-overview-agent.md](4.1-configuration-overview-agent.md) | 4 |
| 5.1 | [5.1-copy-navigation-queries.md](5.1-copy-navigation-queries.md) | 5 |
| 5.2 | [5.2-verification-and-docs.md](5.2-verification-and-docs.md) | 5 |
