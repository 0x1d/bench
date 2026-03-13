---
name: plan-task-execution
description: Execute tasks from implementation plans. Use when working on schema registry, or any plan in docs/plans/ that has task specs.
---
# Plan Task Execution

Use this skill when implementing features from Bench implementation plans (e.g. schema registry). Plans use markdown-based project management: tasks, specs, and status tracking.

## Structure

| Location | Purpose |
|----------|---------|
| `docs/plans/` | Root for all implementation plans |
| `docs/plans/{plan}/README.md` | Overview, current status, quick links |
| `docs/plans/{plan}/plan.md` | Full design document |
| `docs/plans/{plan}/TASKS.md` | Task index with checkboxes and spec links |
| `docs/plans/{plan}/specs/` | Task specs — execution plans per task |
| `docs/plans/{plan}/specs/{id}.md` | Spec for one task (steps, files, acceptance) |

## Workflow

1. **Pick a task** from `TASKS.md`:
   - Choose one with `[ ]` (not done)
   - Respect prerequisites (earlier tasks in same phase, or prior phases)

2. **Read the spec** before coding:
   - Open the linked spec file (e.g. `specs/1.1-config.md`)
   - Follow: Context → Steps → Files → Acceptance criteria

3. **Execute**:
   - Implement according to the spec steps
   - Touch only the files listed in the spec
   - Run the validation commands from the spec

4. **Verify**:
   - Satisfy all acceptance criteria
   - Run pre-commit quality gate (`go vet`, `go test`, `pnpm lint`, `pnpm build`)

5. **Update status**:
   - Change `[ ]` to `[x]` for the completed task in `TASKS.md`
   - If a phase is complete, set phase status to `DONE`
   - Update "Last updated" in `TASKS.md` if present

## Rules

- **Do not skip the spec** — the spec is the execution plan; read it first.
- **One task per commit** — commit after completing a task (or logical subtask).
- **Respect prerequisites** — do not start a task until its prerequisites are done.
- **Do not modify the spec** while executing — if the spec is wrong, fix the spec in a separate change, then execute.
- **Run validation** — every spec includes validation commands; run them before marking done.

## Example: Schema Registry Phase 1

1. Open `docs/plans/schema-registry/TASKS.md`
2. Pick task 1.1 (Config)
3. Read `docs/plans/schema-registry/specs/1.1-config.md`
4. Implement: add SchemaEntry, schemas array, helpers, validation, example
5. Run `cd api && go vet ./... && go test ./...`
6. Mark `[x]` for 1.1 in TASKS.md
7. Commit with message like `feat(api): add schema registry config (task 1.1)`

## Adding New Plans

Use the **plan-creation** skill to create new plans. It covers: when to create a plan, folder structure, plan.md sections, phase/task breakdown, spec format, and registration.
