---
name: agent-coordination
description: Coordinate with other agents on plan tasks. Use when multiple agents may work on the same plan; prevents duplicate work via state-based locking.
---
# Agent Coordination

Use this skill when multiple agents may work on the same implementation plan. Prevents duplicate work using **first-push-wins** state-based locking.

## Principle

Task spec `state` is the lock. `IN_PROGRESS` = claimed. Only one agent works on a task at a time.

## Workflow

### 1. Fetch before picking

```bash
git fetch origin
git pull origin feat/{feature-name}
```

Ensure you have the latest task states before choosing a task.

### 2. Pick a task

- Only consider tasks with `state: TODO` in the spec frontmatter.
- Skip `state: IN_PROGRESS` — another agent may be working on it.
- Skip `state: DEFERRED` — out of scope.
- Check `dependsOn` — all listed tasks must be `state: DONE`.

### 3. Claim immediately

Before implementing, claim the task:

1. Set `state: IN_PROGRESS` in the spec frontmatter.
2. Update `updated` to today (YYYY-MM-DD).
3. Commit and push:

```bash
git add docs/plans/{plan}/specs/{id}.md
git commit -m "chore(plan): claim task {id}"
git push
```

If push fails (e.g. rejected, conflict), assume another agent claimed it. Fetch again and pick a different task.

### 4. Implement

After a successful claim push, implement the task per the spec. Then set `state: DONE`, update TASKS.md, commit and push as usual.

### 5. If you must abandon

If you claimed a task but cannot complete it, set `state: TODO` and push so others can pick it up.

## Rules

- **Never start implementing without claiming** — set `IN_PROGRESS` and push first.
- **Never work on `IN_PROGRESS`** — skip it; pick another task.
- **Fetch before every pick** — states change as other agents work.
- **Push claim immediately** — do not batch claim with implementation.
- **On push failure** — do not retry the same task; pick another.

## Summary

| Step | Action |
|------|--------|
| 1 | `git pull` |
| 2 | Pick task with `state: TODO` |
| 3 | Set `state: IN_PROGRESS`, commit, push |
| 4 | If push fails → pick different task |
| 5 | Implement, set `state: DONE`, commit, push |
