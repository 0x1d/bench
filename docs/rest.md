# REST Resource

The bench REST page provides a Swagger-like test client for configured REST API endpoints. REST resources are defined in `config.yaml` and can include optional authentication. All requests are proxied through the bench API to keep credentials server-side and avoid CORS.

OpenAPI specs can be loaded from a file path (`openapiSpec`) or from the [schema registry](schema-registry.md) (`schemaId`, OpenAPI type only). When both are set, **`schemaId` takes precedence**.

## Overview

When at least one `resources.rest` entry is configured in `config.yaml`, the REST page enables:

- **Resource selector** — Choose which REST API to test
- **Test client** — Swagger UI for browsing and testing endpoints defined in the OpenAPI spec

## Configuration

In `config.yaml`:

```yaml
resources:
  schemas:
    - id: petstore-api
      label: Petstore API
      type: openapi
      source:
        path: ./workspace/rest/petstore.json
  rest:
    - id: petstore
      label: Petstore API
      baseUrl: https://petstore.swagger.io/v2
      schemaId: petstore-api
      auth:
        type: none
    - id: legacy-spec
      label: Legacy API
      baseUrl: https://api.example.com
      openapiSpec: specs/legacy.json
      auth:
        type: none
    - id: internal-api
      label: Internal API
      baseUrl: https://api.internal.example.com
      openapiSpec: specs/internal-api.json
      auth:
        type: bearer
        token: ${BENCH_REST_INTERNAL_TOKEN}
```

- **id** — Unique identifier used in API requests
- **label** — Display name in the UI
- **baseUrl** — Base URL of the REST API (e.g. `https://api.example.com`)
- **schemaId** — Optional. References a registered schema with `type: openapi` under `resources.schemas`. When set, the OpenAPI spec for this REST resource is loaded from the registry (see [schema-registry.md](schema-registry.md)).
- **openapiSpec** — Path to the OpenAPI spec file, relative to the config directory. Used when `schemaId` is empty or omitted.

### Authentication

| Type | Config fields | Env var for secret |
|------|---------------|---------------------|
| `none` | — | — |
| `basic` | `username`, `password` | `${BENCH_REST_*_USER}`, `${BENCH_REST_*_PASS}` |
| `bearer` | `token` | `${BENCH_REST_*_TOKEN}` |
| `apiKey` | `name`, `in` (header/query), `value` | `${BENCH_REST_*_API_KEY}` |

All credential values use env interpolation (same as `resources.databases.url`). Keep secrets in environment variables.

## OpenAPI spec storage

- **Registry** (`schemaId`): Spec bytes come from the schema registry entry; validation requires an existing `openapi` schema. See [schema-registry.md](schema-registry.md).
- **File** (`openapiSpec`): Relative to the config file directory (same resolution as filesystem roots).
- **Formats**: JSON or YAML
- **Optional**: If neither `schemaId` nor `openapiSpec` is set, the test client shows a minimal "no spec" message

## API Reference

All endpoints require the `X-API-Token` header. Base path: `/api/rest`.

### List REST Resources

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/rest` | List configured REST resources |

**Response:** `{ "resources": [{ "id", "label", "baseUrl", "schemaId"?, "openapiSpec"? }] }`

### Get OpenAPI Spec

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/rest/{id}/spec` | Fetch OpenAPI spec for resource (from registry if `schemaId` set, else from `openapiSpec` path) |

**Response:** Raw OpenAPI document (JSON or YAML).

### Proxy Request

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/rest/{id}/proxy` | Proxy request to target REST API |

**Request body:**

```json
{
  "method": "GET",
  "path": "/users",
  "headers": {},
  "body": null
}
```

- **method** — HTTP method (GET, POST, etc.)
- **path** — Path relative to baseUrl (e.g. `/users` or `/users?page=1`)
- **headers** — Optional request headers (auth is added server-side)
- **body** — Optional request body (string or null)

**Response:** The proxied response (status, headers, body) from the target API.

## Security

- **Credentials**: Never exposed to the client. Auth headers are added server-side before proxying.
- **SSRF prevention**: Blocked requests to localhost, private IPs, and link-local addresses.
- **Path validation**: OpenAPI spec path (file or registry-backed) and proxy path must not contain `..` or escape the config directory root.
- **URL scheme**: Only `http` and `https` are allowed.

See [security.md](security.md) for more on REST resource security.
