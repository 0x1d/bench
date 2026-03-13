# Schema Registry Implementation Plan

## Executive Summary

This plan describes how to evolve Bench's REST + OpenAPI integration into a **Schema Registry** that supports arbitrary schema types (OpenAPI, AsyncAPI, JSON Schema, etc.). The registry will centralize schema storage, validation, and discovery so schemas can be integrated into flows, future step types, and other features.

---

## 1. Current State

### 1.1 REST Integration (Today)

| Layer | Implementation |
|-------|----------------|
| **Config** | `resources.rest[]` with `id`, `label`, `baseUrl`, `openapiSpec`, `auth` |
| **API** | `GET /api/rest`, `GET /api/rest/{id}/spec`, `POST /api/rest/{id}/proxy` |
| **Storage** | OpenAPI spec path relative to config dir; file read on demand |
| **UI** | REST page (Swagger-like client), HTTP step in flow editor (operation picker from spec) |
| **Flow HCL** | HTTP step uses `restId` → resolves to `baseUrl` + auth; generates Flowpipe `step "http"` |

### 1.2 Schema Usage Today

- **REST page**: Fetches spec via `GET /api/rest/{id}/spec`, parses with `parseOpenAPIOperationsGrouped()` in `ui/src/lib/openapi.ts`, renders operation list and request forms.
- **Flow HTTP step**: Uses `restId` + `operationKey` (path+method) to prefill method/path/body; `getRequestBodySchema()` drives form generation.
- **Spec format**: OpenAPI 2.x (Swagger) and 3.x; JSON or YAML.

### 1.3 Limitations

1. **OpenAPI-only**: No support for AsyncAPI, JSON Schema, or other formats.
2. **Tight coupling**: REST resource = one OpenAPI spec; no standalone schema registration.
3. **No schema reuse**: Schemas cannot be referenced by multiple resources or future step types.
4. **No type abstraction**: UI and API assume OpenAPI structure; adding AsyncAPI would require parallel code paths.

---

## 2. Goals

1. **Unified registry**: Single place to register, store, and retrieve schemas of any supported type.
2. **Schema-first**: Schemas can exist independently or be attached to resources (REST, future async/messaging).
3. **Extensible**: New schema types (AsyncAPI, JSON Schema, Protobuf, etc.) can be added without major refactors.
4. **Flow integration**: Flow steps can reference schemas for validation, autocomplete, and UI generation.
5. **Backward compatible**: Existing REST config and flows continue to work; migration is incremental.

---

## 3. Schema Types to Support

| Type | Format | Use Case | Priority |
|------|--------|----------|----------|
| **OpenAPI** | 2.x, 3.x (JSON/YAML) | REST APIs (current) | P0 |
| **AsyncAPI** | 2.x, 3.x (JSON/YAML) | Kafka, MQTT, WebSockets, event-driven | P1 |
| **JSON Schema** | Draft-07, 2020-12 | Generic validation, config schemas | P2 |
| **Protobuf** | `.proto` | gRPC, binary serialization | P3 |

### 3.1 AsyncAPI (P1)

- Describes channels, operations (publish/subscribe), and message payloads.
- Uses JSON Schema for payloads; can reference OpenAPI for bindings.
- Enables future **Message/Kafka/MQTT step** in flows (e.g., publish to topic, subscribe).

### 3.2 JSON Schema (P2)

- Standalone schemas for validation (e.g., transform step output, config validation).
- Can be referenced by OpenAPI/AsyncAPI for reusable types.

---

## 4. Architecture

### 4.1 Schema Registry Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     Schema Registry (API)                        │
├─────────────────────────────────────────────────────────────────┤
│  SchemaEntry:                                                    │
│    - id: string (unique)                                         │
│    - label: string                                               │
│    - type: "openapi" | "asyncapi" | "json-schema" | ...           │
│    - source: { path: string } | { url: string } | { inline: ... } │
│    - metadata: { version?, description? }                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Resource Bindings (optional)                                    │
│  - REST resource → schemaId (replaces openapiSpec)               │
│  - Future: Kafka resource → schemaId (AsyncAPI)                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Config Structure (Proposed)

```yaml
resources:
  schemas:
    - id: petstore-api
      label: Petstore API
      type: openapi
      source:
        path: ./workspace/rest/petstore.json
    - id: order-events
      label: Order Events (Kafka)
      type: asyncapi
      source:
        path: ./workspace/schemas/order-events.yaml

  rest:
    - id: petstore
      label: Petstore API
      baseUrl: https://petstore.swagger.io/v2
      schemaId: petstore-api   # replaces openapiSpec
      auth:
        type: none
```

**Migration**: `openapiSpec` remains supported; if both `schemaId` and `openapiSpec` exist, `schemaId` wins. Deprecate `openapiSpec` in a later release.

### 4.3 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/schemas` | List all registered schemas |
| GET | `/api/schemas/{id}` | Get schema metadata + content |
| GET | `/api/schemas/{id}/content` | Raw schema content (for parsing in UI) |
| GET | `/api/schemas/{id}/operations` | Normalized operations (OpenAPI: paths; AsyncAPI: channels) — optional convenience |

**Backward compatibility**: `GET /api/rest/{id}/spec` continues to work by resolving `schemaId` → schema content, or falling back to `openapiSpec` path.

### 4.4 Schema Type Detection

- **Explicit**: Config specifies `type: openapi` | `asyncapi` | `json-schema`.
- **Auto-detect** (optional): Infer from content (`openapi`, `asyncapi`, `$schema` for JSON Schema).
- **Validation**: On load, validate that content matches declared type; return error if mismatch.

---

## 5. Implementation Phases

### Phase 1: Schema Registry Core (API)

**Scope**: Add schema registry without changing REST behavior.

1. **Config**
   - Add `resources.schemas[]` with `id`, `label`, `type`, `source.path`.
   - Keep `resources.rest[].openapiSpec` as-is.

2. **API**
   - New `internal/config` helpers: `SchemaEntries()`, `SchemaByID()`.
   - New `internal/model/schema.go`: `SchemaEntry`, `SchemaResource`.
   - New `internal/service/schema/service.go`: `List()`, `Get()`, `Content()`.
   - New handlers: `HandleSchemaList`, `HandleSchemaGet`, `HandleSchemaContent`.
   - Routes: `GET /api/schemas`, `GET /api/schemas/{id}`, `GET /api/schemas/{id}/content`.

3. **Security**
   - Reuse path traversal checks from REST spec loading.
   - Schema paths resolved relative to config dir; reject `..` and absolute paths outside.

**Deliverable**: API can list and serve schema content; no UI changes yet.

---

### Phase 2: REST Migration to Schema Registry

**Scope**: REST resources can use `schemaId`; `GET /api/rest/{id}/spec` resolves via registry.

1. **Config**
   - Add `schemaId` to `RestEntry`; validate that referenced schema exists and is `type: openapi`.
   - If `schemaId` set, use registry; else fall back to `openapiSpec` path.

2. **REST Service**
   - `Spec(id)`: If entry has `schemaId`, call schema service; else read file from `openapiSpec`.

3. **UI**
   - No changes required for REST page or flow HTTP step (they still call `/api/rest/{id}/spec`).

**Deliverable**: Config can use `schemaId`; existing `openapiSpec` still works.

---

### Phase 3: Schema Registry UI & Standalone Schemas

**Scope**: Expose schema registry in UI; allow standalone schemas (not tied to REST).

1. **UI**
   - New "Schemas" section in Resources config (or sidebar) to list/add/edit schema entries.
   - Schema detail view: show type, source, validation status.
   - Optional: Schema browser page (like REST page but for any schema type).

2. **Resources Config Page**
   - Add `schemas` array to config editor; CRUD for schema entries.
   - REST resource form: add `schemaId` dropdown (filtered to `openapi` type); keep `openapiSpec` as fallback.

**Deliverable**: Users can manage schemas in config; REST can reference them.

---

### Phase 4: Schema Type Abstraction (Parsers)

**Scope**: Abstract schema parsing so UI can handle multiple types.

1. **UI lib**
   - `ui/src/lib/schema-registry.ts`:
     - `detectSchemaType(content: string): 'openapi' | 'asyncapi' | 'json-schema' | 'unknown'`
     - `parseSchema(content: string, type: string): SchemaParsed` — union type with `openapi` | `asyncapi` | `json-schema` variants.
   - Keep `openapi.ts` for OpenAPI-specific helpers; add `asyncapi.ts` for AsyncAPI parsing.

2. **API**
   - Optional: `GET /api/schemas/{id}/parsed` returns normalized structure (operations, channels, etc.) so UI doesn't need to parse raw content.
   - Or: UI fetches content and parses client-side (current pattern).

**Deliverable**: Parsing layer supports OpenAPI + AsyncAPI; JSON Schema later.

---

### Phase 5: AsyncAPI & Future Step Types

**Scope**: AsyncAPI support; new flow step types (e.g., Kafka publish).

1. **Config**
   - Add `resources.messaging[]` or similar for Kafka/MQTT brokers (future).
   - Messaging resource references `schemaId` (AsyncAPI).

2. **Flow**
   - New step type: `message` (already exists for notifier) or `kafka` / `publish` for event publishing.
   - Step config: `schemaId`, `channel`/`topic`, `payload` (form from AsyncAPI message schema).

3. **UI**
   - AsyncAPI parser: extract channels, operations, message schemas.
   - Flow step panel: when step uses AsyncAPI schema, show channel/topic picker and payload form.

**Deliverable**: AsyncAPI schemas usable in flows for event-driven steps.

---

### Phase 6: JSON Schema & Validation

**Scope**: Standalone JSON Schema support for validation and future features.

1. **Config**
   - Support `type: json-schema` in schema registry.

2. **Use cases**
   - Transform step: validate output against schema.
   - Config validation: validate `config.yaml` against a schema.
   - Future: AI-generated flows validated against schema.

**Deliverable**: JSON Schema schemas registered and usable for validation.

---

## 6. Data Model Details

### 6.1 SchemaEntry (Config)

```yaml
id: string          # unique, slug-like
label: string       # display name
type: openapi | asyncapi | json-schema
source:
  path: string      # relative to config dir (required for now)
  # Future: url, inline
```

### 6.2 SchemaResource (API Response)

```json
{
  "id": "petstore-api",
  "label": "Petstore API",
  "type": "openapi",
  "source": { "path": "./workspace/rest/petstore.json" },
  "metadata": { "version": "3.0", "description": "..." }
}
```

### 6.3 RestEntry (Updated)

```yaml
# Existing
id, label, baseUrl, auth

# New (optional)
schemaId: string    # references resources.schemas[].id

# Deprecated (keep for backward compat)
openapiSpec: string # path; used if schemaId not set
```

---

## 7. File Structure (Proposed)

```
api/
  internal/
    config/         # add SchemaEntries(), SchemaByID()
    model/
      schema.go     # NEW: SchemaEntry, SchemaResource
      rest.go       # add SchemaID to RestResource
    service/
      schema/       # NEW
        service.go
    handler/
      schema.go     # NEW
```

```
ui/
  src/
    lib/
      openapi.ts    # keep; OpenAPI-specific
      asyncapi.ts   # NEW: AsyncAPI parsing
      schema-registry.ts  # NEW: type detection, generic parsing
```

---

## 8. Security Considerations

- **Path traversal**: Same rules as REST spec — resolve relative to config dir, reject `..`.
- **URL sources** (future): Validate URL scheme (https only for remote); optional allowlist.
- **Inline schemas** (future): Size limit to prevent DoS.
- **Auth**: Schema content is not sensitive by default; no new auth requirements. If schemas contain secrets (e.g., example tokens), consider redaction.

---

## 9. Testing Strategy

- **Unit**: Schema service `Content()`, `List()` with mock config.
- **Integration**: API tests for `/api/schemas`, `/api/schemas/{id}/content`.
- **Regression**: REST spec resolution via `schemaId` and `openapiSpec`.
- **UI**: Flow HTTP step with `schemaId`-backed REST resource; REST page unchanged.

---

## 10. Migration Path for Users

1. **No change**: Existing config with `openapiSpec` continues to work.
2. **Optional migration**: User adds `resources.schemas` entry, sets `schemaId` on REST resource, removes `openapiSpec`.
3. **Tooling**: Optional script or docs to migrate `openapiSpec` → `schemaId` + schema entry.

---

## 11. Future Enhancements

- **Schema versioning**: Multiple versions per schema ID.
- **Remote URLs**: `source.url` for fetching specs from URLs (with caching).
- **Inline schemas**: `source.inline` for small schemas in config.
- **gRPC/Protobuf**: Schema type for `.proto` files; future gRPC step.
- **Schema validation API**: `POST /api/schemas/validate` — validate payload against schema.
- **OpenAPI codegen**: Generate clients from registered OpenAPI schemas.

---

## 12. Summary

| Phase | Deliverable | Effort |
|-------|-------------|--------|
| 1 | Schema registry API (list, get, content) | Small |
| 2 | REST uses schemaId; backward compat | Small |
| 3 | Schema config UI, standalone schemas | Medium |
| 4 | Schema type abstraction (OpenAPI + AsyncAPI parsers) | Medium |
| 5 | AsyncAPI flow integration, messaging step | Large |
| 6 | JSON Schema support | Medium |

**Recommended order**: Phases 1–3 deliver immediate value (cleaner config, schema reuse). Phases 4–6 enable AsyncAPI and JSON Schema for future features.
