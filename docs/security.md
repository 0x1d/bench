# Security

This document describes the security concepts and controls in place across the bench application.

## Overview

| Component | Primary protection | Notes |
|-----------|--------------------|-------|
| API | API token | All endpoints require `X-API-Token` |
| Database | Connection string | Server-only, never exposed |
| UI | Proxy | Token injected server-side, never in browser |
| Config | File system | Paths from config, not user input |

## API Authentication

### API Token

All API requests (except `OPTIONS` preflight) must include the header:

```
X-API-Token: <API_TOKEN>
```

- `API_TOKEN` is required at startup; the server does not run without it.
- Requests without a valid token receive `401 Unauthorized`.
- The token is a shared secret: anyone with it has full access to the API.

### Middleware

The API uses a middleware chain:

1. **CORS** — Adds `Access-Control-Allow-*` headers; handles OPTIONS preflight.
2. **Logger** — Logs requests.
3. **RequireAPIToken** — Validates `X-API-Token` before passing to handlers.

All routes are protected by this chain; there is no bypass for unauthenticated access.

## Database Security

### Credentials

- `DATABASE_URL` is read only from the environment on the API server.
- The connection string is never sent to the client or included in API responses.
- The status endpoint exposes only `database.configured` (boolean), not connection details.

### SQL Injection Prevention

- **Identifiers**: Table and column names are validated with `isValidIdentifier()` (alphanumeric + underscore, max 63 chars). Invalid identifiers are rejected.
- **Parameters**: User values are passed as query parameters (`$1`, `$2`, …) via pgx, not concatenated into SQL.
- **ILIKE search**: Search patterns escape `%` and `_` in `GetTableData` to avoid unintended wildcard matches.

### Query Endpoint

The `POST /api/database/query` endpoint executes arbitrary SQL. This is intentional for an admin tool. Anyone with a valid `API_TOKEN` can run any SQL the database user is permitted to run.

**Implications:**

- Treat `API_TOKEN` as highly sensitive; it grants full database access.
- Use a database role with minimal required privileges (e.g. read-only for reporting) if the query editor is not needed.
- Ensure the token is never exposed to the client or logged.

## UI and Token Handling

### Proxy Flow

The UI uses `fetch('/api/...')`, so requests go to the same origin as the page. A server-side proxy forwards them to the API and adds `X-API-Token` from its environment.

- **Development**: Vite proxy forwards `/api` to the API and injects `X-API-Token` from `API_TOKEN`.
- **Production**: The hosting platform (e.g. Vercel) rewrites `/api` to the backend and adds the token server-side.

The token is never sent to the browser or bundled into the frontend.

### Environment Variables

- `API_TOKEN` is not prefixed with `VITE_`, so it is not exposed to the client bundle.
- `DATABASE_URL` is API-only; the UI never receives it.

## REST Resources

- REST resources are defined in `config.yaml` under `resources.rest`.
- Credentials (basic auth, bearer token, API key) use env placeholders (e.g. `${BENCH_REST_MY_API_TOKEN}`) and are never sent to the client.
- Auth headers are added server-side before proxying requests to the target API.
- **SSRF prevention**: The `baseUrl` is validated before proxying. Requests to localhost, 127.x, 10.x, 172.16–31.x, 192.168.x, 169.254.x, and ::1 are blocked.
- URL scheme: only `http` and `https` are allowed.
- OpenAPI spec path: resolved relative to config dir; path traversal is rejected.

See [rest.md](rest.md) for the full API reference.

## Filesystem

- Resource roots are defined in `config.yaml` under `resources.filesystem`.
- Root paths are never exposed to the client; only `id` and `label` are returned.
- **Path traversal**: All paths are resolved relative to the configured root. `..` and any path escaping the root are rejected with `400 Bad Request`.
- **Filename validation**: Upload, create-folder, and rename operations reject names containing path separators (`/`, `\`).
- **Upload limits**: Max file size 500 MB; multipart form memory 512 MB.
- The status endpoint exposes root labels and paths for display; these are protected by the API token.

See [filesystem.md](filesystem.md) for the full API reference.

## Flows

- Flows are configured in `config.yaml` under `flows.path` and `flows.workspaces`.
- **Flowpipe URL**: Workspace `flowpipeUrl` is server-side; only id and label are exposed to the client.
- **Database connections**: `connections.fpc` is auto-generated from `resources.databases`; credentials use env interpolation and are never sent to the client.
- **Path validation**: Module paths reject `..` and path traversal.

See [flows.md](flows.md) for the full API reference.

## CORS

The API sets `Access-Control-Allow-Origin: *`. Any origin can make requests, but the token is still required. The token is the gate; CORS does not weaken authentication.

For production, consider restricting `Access-Control-Allow-Origin` to known frontend origins.

## Deployment Checklist

- [ ] Set `API_TOKEN` to a strong, random value (e.g. 32+ chars).
- [ ] Keep `API_TOKEN` and `DATABASE_URL` in server environment only; never in client config or logs.
- [ ] Use HTTPS in production.
- [ ] Ensure the UI proxy adds the token server-side; the token must never reach the browser.
- [ ] Use a database role with minimal privileges if full DDL is not needed.
