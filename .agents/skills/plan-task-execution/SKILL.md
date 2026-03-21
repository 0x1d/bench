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
| `docs/plans/{plan}/plan.md` | Full design document (frontmatter: state, created, updated) |
| `docs/plans/{plan}/TASKS.md` | Task index with checkboxes and spec links |
| `docs/plans/{plan}/specs/` | Task specs — execution plans per task |
| `docs/plans/{plan}/specs/{id}.md` | Spec for one task (frontmatter + steps, files, acceptance) |

## Frontmatter (Plans & Tasks)

**Plan** (plan.md, TASKS.md, README.md): `state` (DRAFT | READY | IN_PROGRESS | DONE), `created`, `updated`

**Task spec**: `id`, `phase`, `title`, `state` (TODO | IN_PROGRESS | DONE | DEFERRED), `dependsOn` (array of task IDs), `created`, `updated`

## Workflow

1. **Pick a task** from `TASKS.md`:
   - Choose one with `[ ]` (not done) and `state: TODO` or `state: IN_PROGRESS` (skip DEFERRED)
   - Check `dependsOn` in the spec frontmatter — all listed tasks must be done first
   - Only pick tasks whose dependencies are satisfied

2. **Read the spec** before coding:
   - Open the linked spec file (e.g. `specs/1.1-config.md`)
   - Follow: Context → Steps → Files → Acceptance criteria (and any other checklist sections)

3. **Execute**:
   - Implement according to the spec steps
   - Touch only the files listed in the spec
   - Run the validation commands from the spec

4. **Verify** (acceptance criteria and action items):
   - If the spec (or task) lists **Acceptance criteria**, **action items**, or any markdown checklist (`- [ ] …`), treat each line as a concrete obligation: **do the work or verification it describes**, then mark it done.
   - **Crossing off** means editing the markdown **from `- [ ]` to `- [x]`** (or `[ ]` → `[x]` in the same list style the file uses) for that item in the spec file (and in `TASKS.md` / other plan docs if the same item appears there).
   - Do not mark `[x]` until the item is actually satisfied (tests run, behavior verified, etc.).
   - Run pre-commit quality gate (`go vet`, `go test`, `pnpm lint`, `pnpm build`) when the spec calls for it.

5. **Update state**:
   - Change `[ ]` to `[x]` for the completed **task** in `TASKS.md`
   - In the spec file: set `state: DONE` and `updated: YYYY-MM-DD` in frontmatter
   - If a phase is complete, set phase status to `DONE`
   - Update `updated` and `state` in plan.md, TASKS.md, README.md frontmatter (set `state: IN_PROGRESS` when starting implementation; `DONE` when done)

6. **Commit and push**:
   - Commit the task implementation and updated plan/task files
   - Push to the feature branch: `git push`
   - Do this after every task

## Coordination

When multiple agents may work on the same plan, use the **agent-coordination** skill: claim tasks by setting `state: IN_PROGRESS` and pushing before implementing.

## Rules

- **Do not skip the spec** — the spec is the execution plan; read it first.
- **Checklists in specs** — Acceptance criteria and action items written as `- [ ]` must be **verified and crossed off** (`- [x]`) as part of the same task, in the same files where they appear.
- **One task per commit** — commit after completing each task.
- **Commit and push after every task** — `git add`, `git commit`, `git push` to the feature branch after each task is done.
- **Feature branch** — work on the same feature branch as the plan (e.g. `feat/schema-registry`). Branch name = feature, not "plan".
- **Respect dependsOn** — check spec frontmatter `dependsOn`; do not start until all listed tasks are done.
- **Do not change spec requirements on the fly** — if steps or acceptance criteria are wrong or outdated, fix the spec in a **separate** change, then execute. **Exception:** updating checkbox state `[ ]`→`[x]` for completed items is required, not optional.
- **Run validation** — every spec includes validation commands; run them before marking done.

## Example: Schema Registry Phase 1

1. Ensure on feature branch `feat/schema-registry` (or create it).
2. Open `docs/plans/schema-registry/TASKS.md`
3. Pick task 1.1 (Config)
4. Read `docs/plans/schema-registry/specs/1.1-config.md`
5. Implement: add SchemaEntry, schemas array, helpers, validation, example
6. Run `cd api && go vet ./... && go test ./...`
7. Mark `[x]` for 1.1 in TASKS.md; update spec `state: DONE`
8. Commit and push: `git add -A && git commit -m "feat(api): add schema registry config (task 1.1)" && git push`

## Adding New Plans

Use the **plan-creation** skill to create new plans. It covers: when to create a plan, folder structure, plan.md sections, phase/task breakdown, spec format, and registration.
