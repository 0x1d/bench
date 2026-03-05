---
name: rest-resource-integration
description: Implement and validate Bench REST resource integrations end-to-end. Use when changing REST config handling, OpenAPI spec loading, proxy behavior, authentication, or REST UI features.
---
# REST Resource Integration

Applies to REST resource behavior across API, config, docs, and UI.

## Required Checks

- Validate `config.yaml` REST schema expectations (`id`, `label`, `baseUrl`, `openapiSpec`, `auth`).
- Ensure auth remains server-side only (no secret leakage to browser).
- Confirm proxy request shape and response handling are stable.
- Verify SSRF/path traversal protections still apply.
- Update docs in `docs/rest.md` for behavior or contract changes.

## API Endpoints to Re-verify

- `GET /api/rest`
- `GET /api/rest/{id}/spec`
- `POST /api/rest/{id}/proxy`

## Validation

- `cd api && go test ./...`
- `cd ui && pnpm lint && pnpm build`
- Manual smoke check from REST page for one configured resource.
