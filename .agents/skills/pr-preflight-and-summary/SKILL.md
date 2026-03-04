---
name: pr-preflight-and-summary
description: Prepare Bench pull requests with consistent validation and concise summaries. Use when finalizing a branch, creating a PR, or presenting test coverage for review.
---
# PR Preflight and Summary

Run this before opening a PR.

## Preflight Checks

- Inspect changed files and ensure scope is coherent.
- Run full quality gate:
  - `cd api && go vet ./... && go test ./... && go build ./cmd/server`
  - `cd ui && pnpm lint && pnpm build`
- Confirm docs updated for externally visible behavior changes.
- Remove accidental debug code/logs.

## PR Summary Template

- `Summary`
  - what changed
  - why it changed
  - key tradeoffs or migrations
- `Test plan`
  - exact commands run
  - manual checks performed
  - known limitations/risk areas

## Final Sanity

- Ensure no secrets or env files are staged.
- Ensure commit messages follow Conventional Commits.
