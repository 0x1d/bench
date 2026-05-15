# Task Specs

## Frontmatter Fields

| Field | Description |
|-------|-------------|
| `id` | Task ID, e.g. `"1.1"` |
| `phase` | Phase number |
| `title` | Task title |
| `state` | `TODO`, `IN_PROGRESS`, `DONE`, `DEFERRED` |
| `dependsOn` | Array of task IDs that must be done first |
| `created` | Creation date (YYYY-MM-DD) |
| `updated` | Last update date (YYYY-MM-DD) |

## Spec Body Format

Each spec has: Context, Steps, Files, Acceptance Criteria, Validation.

## Specs Index

| ID | Spec | Phase |
|----|------|-------|
| 1.1 | [1.1-model.md](./1.1-model.md) | 1 |
| 1.2 | [1.2-hcl.md](./1.2-hcl.md) | 1 |
| 1.3 | [1.3-handler.md](./1.3-handler.md) | 1 |
| 1.4 | [1.4-ui.md](./1.4-ui.md) | 1 |
| 1.5 | [1.5-tests.md](./1.5-tests.md) | 1 |
