# Schema registry

The schema registry stores OpenAPI, AsyncAPI, and JSON Schema documents in `config.yaml` under `resources.schemas`. The API lists metadata and serves raw file content; the UI lets you manage and browse schemas on the Schemas page (`#schemas`), with the same resource entries also available in the full Configuration editor.

## Overview

- **Register files** — Each entry points to a path relative to the config directory (same resolution as REST `openapiSpec` paths).
- **REST integration** — A REST resource can use `schemaId` to load its OpenAPI spec from the registry instead of (or in preference to) `openapiSpec`.
- **Browsing** — The Schemas page fetches content and shows a lightweight preview by type (operations, channels, JSON properties).

## Configuration

```yaml
resources:
  schemas:
    - id: petstore-api
      label: Petstore API
      type: openapi
      source:
        path: ./workspace/rest/petstore.json
```

| Field | Description |
|-------|-------------|
| **id** | Unique identifier (required). |
| **label** | Display name (optional). |
| **type** | One of `openapi`, `asyncapi`, `json-schema`. |
| **source.path** | Path to the schema file, relative to the directory containing `config.yaml` (required when the entry is present). |

Duplicate `id` values or invalid `type` values fail config validation.

### REST: reference a registered OpenAPI schema

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
```

- **`schemaId`** — Must reference an existing schema with **`type: openapi`**. If both `schemaId` and `openapiSpec` are set, **`schemaId` takes precedence** for loading the spec used by the REST page and `GET /api/rest/{id}/spec`.

## UI

| Location | Behavior |
|----------|----------|
| **Schemas** (`#schemas`) | Primary workflow to list, add, edit, remove, search, and preview registry entries; saving writes `resources.schemas` to `config.yaml`. |
| **Configuration** (`#configuration`) | Full config editor also exposes schema resource entries for add/edit/remove workflows. |
| **REST** form | **OpenAPI schema (registry)** dropdown lists `openapi` schemas; optional **OpenAPI spec path** when no registry schema is selected. |

## API reference

All endpoints require the `X-API-Token` header. Base path: `/api/schemas`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/schemas` | List schemas: `{ "schemas": [ { "id", "label", "type", "source": { "path" } } ] }` |
| GET | `/api/schemas/{id}` | Single schema metadata (JSON). |
| GET | `/api/schemas/{id}/content` | Raw file bytes. `Content-Type` is `application/json` or `application/x-yaml` based on content (same heuristic as REST spec). |

| Status | Meaning |
|--------|---------|
| 404 | Unknown `id`. |
| 400 | Path traversal rejected for `source.path`. |
| 405 | Non-GET methods are not allowed on these routes. |

## Security

Schema files are read only from paths under the config directory; `..` segments that would escape that root are rejected. See [security.md](security.md).

## Related documentation

- [rest.md](rest.md) — REST list/spec/proxy endpoints and `schemaId` behavior.
- [plans/schema-registry/](plans/schema-registry/) — Implementation plan and task history.
