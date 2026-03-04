---
name: dev-smoke-test-workflow
description: Run local Bench smoke tests using the standard dev startup path. Use when validating end-to-end behavior after code changes across API and UI.
---
# Dev Smoke Test Workflow

Use for quick end-to-end confidence before commit/PR.

## Startup

From repo root:

```bash
./dev.sh [config.yaml]
```

This starts Docker dependencies (if configured), API, and UI.

## Smoke Checklist

- UI loads and can reach API through `/api` proxy.
- Auth-protected API calls succeed with configured token.
- Flows page loads and tree entries render.
- Flow editor opens, saves, and run action starts execution.
- Resource pages (filesystem/database/rest) load without runtime errors.

## Shutdown

- Keep process foregrounded; stop with `Ctrl+C`.
- Do not use detached local dev for this workflow.

## Follow-up

- If smoke fails, isolate whether API, proxy, or UI is the first failing boundary.
