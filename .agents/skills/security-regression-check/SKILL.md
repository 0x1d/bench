---
name: security-regression-check
description: Run a focused security regression review for Bench API and proxy features. Use when touching auth, filesystem paths, REST proxying, database access, or request validation.
---
# Security Regression Check

Use with `docs/security.md` as baseline.

## Checklist

- API token enforcement still required for protected endpoints (`X-API-Token`).
- No new path traversal vectors (`..`, unsafe joins, unvalidated user paths).
- REST proxy still blocks localhost/private/link-local targets.
- Only allowed URL schemes (`http`, `https`) are accepted where required.
- Secrets remain server-side (tokens/passwords not sent to browser logs/UI).
- Error messages do not leak sensitive internals.

## Verification

- Add/update tests when security logic changes.
- Run API checks: `cd api && go test ./... && go vet ./...`
- Run UI checks if relevant: `cd ui && pnpm lint && pnpm build`

## Output

- `findings`: high/medium/low
- `regressions`: yes/no
- `required_fixes`: concrete file-level actions
