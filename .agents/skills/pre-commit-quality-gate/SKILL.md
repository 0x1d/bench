---
name: pre-commit-quality-gate
description: Run and enforce the full Bench pre-commit quality gate for API and UI. Use when preparing commits, validating local changes, or when the user asks to verify checks before committing.
---
# Pre-Commit Quality Gate

Use this workflow before creating any commit.

## Required Checks

Run from repo root:

```bash
# API
cd api && go vet ./... && go test ./... && go build ./cmd/server

# UI
cd ui && pnpm lint && pnpm build
```

## Rules

- Do not commit if any command fails.
- Report failures with the exact command and concise fix guidance.
- Re-run only the failing step after a fix, then re-run the full gate.
- Keep checks aligned with CI (`.github/workflows`).

## Output Format

- `status`: pass/fail
- `api`: vet/test/build results
- `ui`: lint/build results
- `next`: commit ready or remaining blockers
