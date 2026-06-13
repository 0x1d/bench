---
created: 2026-06-13
updated: 2026-06-13
branch: feat/http-trigger-correct
---

# HTTP Trigger — End-to-End Verification Report

Live verification run against local dev stack (`./dev.sh`) on 2026-06-13.

## Environment

| Item | Value |
|------|-------|
| API | `http://localhost:8081` |
| UI | `http://localhost:5173` |
| Flowpipe | `http://localhost:7103` (Docker) |
| Docker | 29.5.2 |
| Flowpipe version | v1.2.1 |
| Existing triggers | `w3bh00k`, `gaga` (module `local`) |

Startup: `./dev.sh` — postgres, flowpipe, agent containers + local API/UI. Flowpipe loaded `mod.bench` and enabled both HTTP hooks on boot.

---

## Pass/Fail Matrix

| Area | Scenario | Result |
|------|----------|--------|
| **Startup** | `./dev.sh`, `/api/health`, UI proxy, Flowpipe reachable | **PASS** |
| **API list** | `GET /api/flows/triggers` | **PASS** — flat config only (no duplicate nested `http`) |
| **API webhook URL** | `GET …/webhook` for `w3bh00k`, `gaga` | **PASS** |
| **API test** | `gaga` with custom payload | **PASS** — `status: finished` |
| **API test** | `w3bh00k` with `{}` body | **PASS** (after arg fix) |
| **API test** | Empty POST body (no JSON) | **PASS** — accepts EOF, uses default payload |
| **Direct curl** | POST hook URL `gaga` | **PASS** — HTTP 200, `finished` |
| **Direct curl** | POST hook URL `w3bh00k` | **PASS** (after arg fix) |
| **Terminal processes** | Bench + Flowpipe process lists | **PASS** — new entries after each fire |
| **Terminal execution** | `GET /api/flows/executions/{id}` | **PASS** — step status, args, output |
| **Terminal logs** | `docker compose logs flowpipe` | **PASS** — trigger fired, steps logged |
| **UI global triggers** | List, http badges, webhook URLs inline | **PASS** |
| **UI global triggers** | Copy webhook URL | **PASS** |
| **UI global triggers** | Test `gaga` (Play) | **PASS** — toast with status + execution ID |
| **UI global triggers** | Edit `gaga` round-trip | **PASS** — pipeline, args, sync mode |
| **UI global triggers** | Create `e2e-async-sleep` (async) | **PASS** — HCL in `tests/mod.fp` |
| **UI global triggers** | Create `e2e-sync-http` (sync + args) | **PASS** (via API; UI async create verified) |
| **UI global triggers** | Delete e2e triggers | **PASS** — removed from list + `mod.fp` |
| **UI global triggers** | Panel Cancel/Close | **PASS** (after layout fix) |
| **UI flow editor** | Triggers panel on `sometest` | **PASS** — `w3bh00k`, `gaga`, URLs, actions |
| **UI flow editor** | Test from panel | **PASS** — gaga test invoked (buttons disabled during run) |
| **UI flow editor** | Create `e2e-flow-panel` | **PASS** (after panel overlay fix) |
| **UI executions** | List after trigger fires | **PASS** — `test_sleep`, `test_http`, `stepvariables`, `sometest` rows |
| **UI executions** | Step log drill-down | **PASS** — `test_sleep`: `wait 2.01s`, `done 8ms` |
| **Async mode** | `e2e-async-sleep` test | **PASS** — `status: pending` + execution ID |
| **Sync mode** | `e2e-sync-http` test | **PASS** — `status: finished` |
| **Args mapping** | `gaga` `name1 = self.request_body` | **PASS** — body mapped to `param.name1` |
| **Negative 401** | No `X-API-Token` | **PASS** |
| **Negative 409** | Duplicate create `gaga` | **PASS** |
| **Negative 404** | Missing trigger webhook | **PASS** |
| **Negative 400** | Webhook URL on non-HTTP type | **SKIP** — no schedule trigger in workspace |
| **Bad JSON curl** | Non-JSON body to `gaga` hook | **PASS** (runs) — Flowpipe accepts body, uses defaults |
| **Execution mode round-trip** | async → sync via API, re-read | **PASS** |

---

## Issues Found (and Resolutions)

### Issue 1: `w3bh00k` trigger fails — missing `input1` arg mapping — **RESOLVED**

- **Root cause**: Trigger args only mapped `conn_local`; `sometest` requires `input1`.
- **Fix**: Added `input1 = self.request_body` to `workspace/flows/local/mod.fp` and `config.yaml`.
- **Validation**: Create/update now rejects missing required pipeline params.

### Issue 2: `gaga` arg name mismatch (`input1` vs `name1`) — **RESOLVED**

- **Root cause**: `stepvariables` uses `param.name1`, not `input1`.
- **Fix**: Renamed arg to `name1 = self.request_body` in `mod.fp` and `config.yaml`.
- **Validation**: Create/update now rejects unknown arg keys.

### Issue 3: Trigger test endpoint requires JSON body — **RESOLVED**

- **Root cause**: `json.NewDecoder(r.Body).Decode` rejected `io.EOF` on empty POST.
- **Fix**: `HandleTriggerTest` and `HandleRootTriggerTest` treat `io.EOF` as empty payload; service layer supplies default test payload.

### Issue 4: Duplicate nested `http` config in API responses — **RESOLVED**

- **Root cause**: `TriggerConfig.MarshalJSON` flattened keys but kept nested `http` object from alias marshal.
- **Fix**: Omit nested type keys (`http`, `schedule`, `alert`, `notification`) after flattening.

### Issue 5: UI side panel close/cancel click interception — **RESOLVED**

- **Root cause**: Main content `w-full` overlapped the resizable panel on wide viewports; mobile overlay lacked pointer-event isolation.
- **Fix**: Removed `w-full` from main column; disable pointer events on main content when mobile panel is open.

### Issue 6: No validation prevented broken HTTP trigger args — **RESOLVED**

- **Fix**: `ValidateTriggerEntry` on create/update; UI shows pipeline params and blocks save client-side.

### Bench `/test` endpoint dropped execution IDs — **RESOLVED**

- **Fix**: `TriggerTestResponse` now includes `executionId` and `pipelineExecutionId` from Flowpipe body and `Flowpipe-*` response headers. UI test toasts surface execution ID.

---

## Additional Verification (2026-06-13) — New Simple Flows

Created dedicated test flows in module `tests`:

| Flow | File | Params |
|------|------|--------|
| `e2e_simple` | `workspace/flows/tests/e2e_simple.fp` | None — single message step |
| `e2e_params` | `workspace/flows/tests/e2e_params.fp` | `greeting` (string, default `Hello`) |

For each flow, an HTTP trigger was created, the Flowpipe hook URL was called with curl, and execution was verified via process list + Flowpipe logs. Triggers were deleted after each scenario.

| Scenario | Trigger | Mode | Webhook result | Execution |
|----------|---------|------|----------------|-----------|
| Simple, no params | `e2e-simple-sync` | synchronous | HTTP 200, `status: finished`, message text in response | `exec_d8mjksltpsjc738dav40` finished |
| Simple, no params | `e2e-simple-async` | asynchronous | HTTP 200, returns `execution_id` only (no pipeline output inline) | `exec_d8mjkvdtpsjc738davig` finished |
| With params (`greeting=self.request_body`) | `e2e-params-sync` | synchronous | HTTP 200, `text: "E2E params: \"E2EUser\""` | `exec_d8mjl25tpsjc738db010` finished |
| With params (`greeting=self.request_body`) | `e2e-params-async` | asynchronous | HTTP 200, async ack; pipeline completed in background | `exec_d8mjl4ttpsjc738db0fg` finished |

**All four scenarios PASS.**

Notes:
- Sync triggers return full pipeline output in the HTTP response body.
- Async triggers return promptly with `execution_id`; pipeline completes in background (visible in `#flows/executions` and Flowpipe logs).
- Param mapping via `self.request_body` works; JSON-quoted string body (`"E2EUser"`) is passed through literally (message shows escaped quotes). Use a plain-text body or JSON object parsing in the pipeline for cleaner display.

---

## Flowpipe HTTP Trigger — Webhook Response & Feature Parity

Reference: [Flowpipe `http` trigger — Webhook Response](https://flowpipe.io/docs/flowpipe-hcl/trigger/http#webhook-response)

### Async webhook: does it return execution IDs?

**Yes — when calling the Flowpipe hook URL directly** (the real inbound webhook path).

Verified 2026-06-13 against `e2e-check-async`:

**Response body (async):**
```json
{
  "flowpipe": {
    "execution_id": "exec_d8mjo95tpsjc738db0u0",
    "pipeline_execution_id": "pexec_d8mjo95tpsjc738db0ug"
  }
}
```

**Response headers (async):**
```
Flowpipe-Execution-Id: exec_d8mjo95tpsjc738db0u0
Flowpipe-Pipeline-Execution-Id: pexec_d8mjo95tpsjc738db0ug
```

**Sync** additionally includes `flowpipe.status`, pipeline `results`, and header `Flowpipe-Status: finished`.

This matches the Flowpipe docs: metadata identifying trigger and pipeline process execution IDs is returned; sync mode also embeds pipeline outputs in the JSON body.

### Bench `/test` endpoint — execution IDs now surfaced

`POST /api/flows/{module}/triggers/{id}/test` proxies to the Flowpipe hook and returns `TriggerTestResponse` with `executionId` and `pipelineExecutionId` extracted from the Flowpipe body and response headers.

| Path | Async returns `execution_id` + `pipeline_execution_id`? |
|------|--------------------------------------------------------|
| Direct curl → Flowpipe hook | **Yes** (body + headers) |
| Bench `…/test` | **Yes** — body fields + headers forwarded |
| Bench UI Test button | **Yes** — toast shows status and execution ID |

### Feature parity vs Flowpipe `http` trigger spec

| Flowpipe capability | Bench support | Notes |
|---------------------|---------------|-------|
| `pipeline` | **Yes** | UI + HCL |
| `args` (incl. `self.request_body`, `self.request_headers`) | **Yes** | UI args editor; HCL round-trip |
| `execution_mode` sync/async | **Yes** | UI select; default async per Flowpipe |
| Webhook URL `/api/latest/hook/{id}/{salt}` | **Yes** | `GET …/webhook` resolves via Flowpipe API |
| Webhook response IDs (headers + body) | **Yes** | Direct hook + Bench `/test` |
| Sync response pipeline outputs in body | **Yes** (direct hook) | Verified on `e2e_simple` sync |
| `description` | **Partial** | HCL gen/parse; not in UI form |
| `title` | **No** | Not in UI/HCL generator |
| `enabled` | **Partial** | Model has `enabled`; not written to HCL or UI for HTTP |
| `tags`, `documentation` | **No** | Not supported |
| `method "get"` / `method "post"` blocks | **No** | Hand-edited in `.fp` may survive; no UI/HCL round-trip |
| POST-only default (no method blocks) | **Yes** | Matches Flowpipe default |
| `self.request_body` / `self.request_headers` in trigger | **N/A** | Flowpipe runtime attrs; mapped via `args` |
| Webhook auth | **N/A** | Flowpipe uses unguessable URL salt (no auth) — same |
| Bench webhook proxy | **No** | Callers hit Flowpipe directly (by design) |

**Overall:** Core inbound webhook behavior has **feature parity with Flowpipe** on both the direct webhook path and the Bench `/test` proxy. Remaining gaps are **advanced HCL** (method blocks, title, enabled, tags).

---

## Scenarios Not Tested (Out of Scope)

Per [REVIEW.md](REVIEW.md):

- `method "post" { … }` blocks (not in UI/HCL generator)
- Bench webhook proxy (`POST /api/flows/webhooks/{id}/proxy`)
- Webhook secret / `X-Webhook-Secret` handling in Bench
- Non-HTTP trigger webhook URL 400 (no schedule trigger present)

---

## Summary

**HTTP trigger infrastructure is working end-to-end** for correctly configured triggers:

1. Bench CRUD + webhook URL resolution → Flowpipe hook URLs
2. Inbound POST to Flowpipe executes pipelines
3. Executions visible in terminal (process API, docker logs) and browser (executions list + step log)
4. Sync and async execution modes both functional
5. UI global triggers page and flow editor triggers panel both operational
6. Broken trigger configs blocked at save time (API + UI)
7. Legacy `w3bh00k` and `gaga` triggers corrected in workspace data
8. Bench `/test` surfaces execution IDs for async/sync test runs

All issues identified during E2E verification have been addressed in code and workspace configuration.
