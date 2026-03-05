---
name: api-ui-change-impact-check
description: Check impact of API changes on UI consumers and docs. Use when API handlers, payloads, endpoints, or service contracts change, or when reviewing cross-service regressions.
---
# API/UI Change Impact Check

Run this whenever API behavior or payloads change.

## Checklist

- Identify changed API routes, request/response shapes, and auth expectations.
- Find UI callers in `ui/src/services/api.ts` and dependent components/pages.
- Verify type updates in UI for any payload shape changes.
- Confirm error handling still matches API behavior.
- Update docs when behavior changes (`docs/*.md`).

## Validation

- API: `cd api && go test ./...`
- UI: `cd ui && pnpm lint && pnpm build`
- Ensure no stale assumptions remain in UI labels/messages.

## Report

- List affected endpoints.
- List updated UI files.
- Note docs updated or explicitly state no docs required.
