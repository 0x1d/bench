---
state: DONE
created: 2026-05-14
updated: 2026-05-14
---

# Correct Flowpipe HTTP Trigger Implementation

## Executive Summary

Bench currently implements **two** trigger types — `webhook` and `http` — but Flowpipe only has **one**: `trigger "http"`, which acts as an inbound webhook receiver. The current `http` type is incorrectly modeled as an outbound HTTP callback (sending requests to external URLs), which does not exist in Flowpipe. This plan consolidates the two types into a single correct `http` trigger that matches the Flowpipe HCL specification, supporting `pipeline`, `args`, `execution_mode`, and optional `method` blocks.

## Current State

Today the codebase has five trigger type constants, two of which are the problem:

| Layer | `webhook` (current) | `http` (current) | Flowpipe reality |
|-------|---------------------|-------------------|------------------|
| **Model** | `WebhookConfig{Description, Pipeline}` | `HTTPConfig{URL, Method, Body, Pipeline}` | `trigger "http"` — receives inbound HTTP, passes `self.request_body`, `self.request_headers` via `args` |
| **HCL gen** | Outputs `trigger "webhook" "id" { pipeline = ... }` | Outputs `url`, `method`, `body` fields | Flowpipe has no `trigger "webhook"` block type |
| **HCL parse** | Parses `trigger "webhook"` blocks | Parses `url`, `method`, `body` from blocks | Only `trigger "http"` blocks exist in `.fp` files |
| **UI form** | Shows only `pipeline` field | Shows `url`, `method`, `body`, `pipeline` fields | Should show `pipeline`, `args`, `execution_mode` |
| **Webhook URL** | Generates `{flowpipe}/api/v0/webhook/{id}` | N/A | This is correct behavior — belongs on the `http` trigger |

The current `webhook` type is actually the correct Flowpipe `http` trigger behavior (it receives inbound HTTP requests and gets a webhook URL). The current `http` type is a fiction — Flowpipe doesn't have outbound HTTP callback triggers.

## Goals

1. Remove the `webhook` trigger type entirely
2. Correct the `http` trigger type to match Flowpipe's actual `trigger "http"` specification
3. Update HCL generation to produce correct Flowpipe HTTP trigger syntax
4. Update HCL parsing to correctly read Flowpipe HTTP trigger blocks
5. Update UI forms and types to reflect the correct HTTP trigger fields
6. Preserve the webhook URL generation endpoint (it belongs on `http` triggers now)
7. Migrate existing `webhook` triggers to `http` triggers seamlessly

## Architecture

### Flowpipe HTTP Trigger HCL Spec

```hcl
trigger "http" "my_webhook" {
  title       = "My Webhook Trigger"
  description = "Triggered by an HTTP POST request"
  pipeline    = pipeline.my_pipeline
  args = {
    body   = self.request_body
    headers = self.request_headers
  }
  execution_mode = "asynchronous"  // or "synchronous"

  # Optional method blocks
  method "post" {
    pipeline = pipeline.handle_post
    args = { payload = self.request_body }
  }
}
```

Key attributes accessible via `self`:
- `self.request_body` — request body as string
- `self.request_headers` — map of header names to values
- `self.url` — generated webhook URL

### Config Model (after)

The `HTTPConfig` struct becomes the webhook receiver configuration:

```go
type HTTPConfig struct {
    Description   string            `yaml:"description,omitempty" json:"description,omitempty"`
    Pipeline      string            `yaml:"pipeline" json:"pipeline"`
    Args          map[string]string `yaml:"args,omitempty" json:"args,omitempty"`       // e.g. {"body": "self.request_body"}
    ExecutionMode string            `yaml:"executionMode,omitempty" json:"executionMode,omitempty"`  // "asynchronous" or "synchronous"
}
```

Note: `method` blocks are an advanced Flowpipe feature. For the UI, we will support the top-level `pipeline` and `args` fields. Method blocks can be edited directly in the `.fp` file and will be preserved during parsing (the parser won't attempt to serialize them back to config, it just reads the top-level fields).

### Webhook URL Generation

The webhook URL endpoint stays but is renamed conceptually — it now returns the URL for `http` type triggers:

```
GET /api/flows/{moduleId}/triggers/{triggerId}/webhook
→ {flowpipeUrl}/api/v0/webhook/{triggerId}
```

### Data Migration

Existing triggers with `type: "webhook"` in config.yaml will be treated as `type: "http"` after the change. The HCL in `.fp` files that has `trigger "webhook"` blocks will need to be rewritten to `trigger "http"` blocks. The parser will be updated to handle this during the transition.

## Implementation Phases

| Phase | Description | Deliverable |
|-------|-------------|-------------|
| **1** | Remove `webhook` type, correct `http` model | Config + model types updated |
| **2** | HCL generation + parsing | Correct Flowpipe HTTP trigger HCL |
| **3** | API handler updates | Normalize, webhook URL endpoint |
| **4** | UI updates | Form, list, types corrected |
| **5** | Tests + validation | All tests pass |

See [TASKS.md](./TASKS.md) for detailed task breakdown.

## Security

- Webhook URLs contain unguessable paths (Flowpipe generates from trigger name + salt)
- No authentication on webhook endpoints — security is through URL obscurity
- Bench should not modify the Flowpipe security model

## Testing Strategy

- Unit tests for HCL generation with new HTTP trigger fields
- Unit tests for HCL parsing of HTTP trigger blocks with `args`
- Handler tests for webhook URL endpoint on `http` type triggers
- UI build + type-check

## Migration

Users with existing `webhook` triggers will need their `.fp` files updated from `trigger "webhook"` to `trigger "http"`. The config.yaml `type` field will be updated automatically by the migration path in Phase 1. A one-time migration script or manual edit is needed for `.fp` files.

## Future Enhancements

- Support for `method` blocks in the UI (GET/POST handlers)
- Support for `synchronous` execution mode with pipeline output display
- Webhook payload schema visualization
