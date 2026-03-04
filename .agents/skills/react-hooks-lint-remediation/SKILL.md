---
name: react-hooks-lint-remediation
description: Resolve Bench UI React hooks lint errors with behavior-safe patterns. Use when ESLint reports exhaustive-deps, refs during render, set-state-in-effect, or memoization preservation issues.
---
# React Hooks Lint Remediation

Use this workflow for `eslint-plugin-react-hooks` issues in `ui/`.

## Fix Patterns

- `react-hooks/refs`: move ref reads/writes out of render (event handlers/effects only).
- `react-hooks/set-state-in-effect`: remove sync setState effects; derive state, key remount, or initialize directly.
- `react-hooks/exhaustive-deps`: include real dependencies or refactor to stable callbacks.
- `react-hooks/preserve-manual-memoization`: align dependency arrays with actual closure usage.

## Type Safety

- Replace `any` with `unknown` + guards.
- Prefer narrow interfaces for API and component state.

## Validation

- Run: `cd ui && pnpm lint`
- Then: `cd ui && pnpm build`
- Confirm no behavior regression in impacted screens.
