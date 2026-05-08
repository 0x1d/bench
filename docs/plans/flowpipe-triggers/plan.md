---
state: DRAFT
created: 2026-05-08
updated: 2026-05-08
---

# Flowpipe Triggers Implementation Plan

## Executive Summary

This plan describes how to integrate **Flowpipe triggers** into Bench, enabling users to define and manage triggers that automatically start pipelines in Flowpipe when external events occur. Triggers are a core Flowpipe feature that allows pipelines to run in response to webhooks, schedules, alerts, or notifications. This integration will allow users to configure triggers declaratively in Bench's config.yaml and manage them via a dedicated UI page, similar to how REST resources and schemas are currently handled.

---

## Current State

### 1.1 Flowpipe Integration (Today)

| Layer | Implementation |
|-------|----------------|
| **Config** | `flows.workspaces[]` with Flowpipe server URLs; no trigger configuration |
| **API** | Flow execution via `POST /api/flows/{id}/run` proxying to Flowpipe `/api/v0/pipeline/{id}/command` |
| **Storage** | Flow definitions in `.fp` files (HCL); no trigger files managed by Bench |
| **UI** | Flow editor for creating/saving flows; no trigger creation or management |
| **Flow HCL** | `pipeline` blocks define workflows; triggers defined separately in `.fp` files outside Bench management |

### 1.2 How Flowpipe Triggers Work (External Experience)

Flowpipe triggers are defined as top-level blocks in `.fp` files alongside pipelines:

```hcl
trigger "webhook" "my_webhook" {
  description = "Webhook trigger for my pipeline"
  pipeline    = pipeline.my_pipeline
}

trigger "schedule" "daily_report" {
  description = "Run daily at 9 AM"
  pipeline    = pipeline.daily_report
  cron        = "0 9 * * *"
}

trigger "alert" "high_latency" {
  description = "Alert on high latency"
  pipeline    = pipeline.notify_latency
  source      = notifier.slack
  condition   = "event.payload.latency > 1000"
}
```

**Key points:**
- Triggers are defined in the same mod as pipelines
- Each trigger references a pipeline
- Trigger types: `webhook`, `schedule`, `alert`, `notification`, `http`
- Triggers can have optional configuration (cron, condition, source, etc.)
- When a trigger fires, it starts the referenced pipeline with optional arguments

### 1.3 Limitations (What Bench Cannot Do Today)

1. **No trigger configuration**: Users must manually edit `.fp` files to add triggers
2. **No trigger discovery**: No API endpoint to list triggers in a flow
3. **No trigger UI**: No way to create/edit triggers from Bench UI
4. **No trigger state**: Cannot see trigger status, last run time, or recent executions
5. **No webhook URL management**: Cannot view or test trigger webhook URLs

---

## Goals

1. **Declarative trigger config**: Define triggers in `config.yaml` under a new `flowpipe_triggers[]` or `triggers[]` section
2. **Trigger files management**: Auto-generate `.fptriggers` or trigger blocks in flow files when triggers are configured
3. **Trigger API**: Expose endpoints to list, get, and manage triggers
4. **Trigger UI**: Create a new page or expand the flow editor to manage triggers
5. **Trigger execution**: Allow manual trigger "tests" via the API (e.g., simulate webhook calls)
6. **Backward compatible**: Existing flows without triggers continue to work; triggers are optional

---

## Architecture

### 3.1 Trigger Configuration Model

Triggers will be configured under a new section in `config.yaml`:

```yaml
flowpipe_triggers:
  - id: daily-report-webhook
    label: Daily Report Webhook
    workspace: default
    pipeline: daily_report
    type: webhook
    config:
      description: "Trigger daily report pipeline"
```

**OR** integrated into flows (more aligned with Flowpipe's model where triggers live in the same mod):

```yaml
flows:
  triggers:
    - id: daily-report-schedule
      label: Daily Report
      flow: daily_report
      type: schedule
      config:
        cron: "0 9 * * *"
        description: "Run every day at 9 AM"
```

**Chosen approach**: Separate `flowpipe_triggers[]` at root level for clarity and separation of concerns. This mirrors `resources.rest[]`, `resources.schemas[]`, etc.

### 3.2 File Layout

Flowpipe stores triggers in the same mod directory as pipelines. Two approaches:

**Approach A**: Generate `.fptriggers` files alongside triggers (Flowpipe 1.x style)
```
flows/
  mod.fp
  daily_report.fp
  daily_report.fptriggers  # NEW: Trigger definitions for this flow
```

**Approach B**: Embed triggers in the flow's `.fp` file
```
flows/
  mod.fp
  daily_report.fp  # Contains both pipeline and trigger blocks
```

**Chosen approach**: **Approach B** (embed in `.fp` files). This aligns with Flowpipe's preference for keeping pipeline and trigger definitions together. Bench will parse and maintain trigger blocks within existing `.fp` files.

### 3.3 Data Model

```go
// TriggerType defines the Flowpipe trigger types
const (
	TriggerTypeWebhook   TriggerType = "webhook"
	TriggerTypeSchedule  TriggerType = "schedule"
	TriggerTypeAlert     TriggerType = "alert"
	TriggerTypeHTTP      TriggerType = "http"
	TriggerTypeNotification TriggerType = "notification"
)

// TriggerConfig holds type-specific configuration
type TriggerConfig struct {
	Description string            `yaml:"description,omitempty"`
	Pipeline    string            `yaml:"pipeline"` // pipeline reference
	Webhook     *WebhookConfig    `yaml:"webhook,omitempty"`
	Schedule    *ScheduleConfig   `yaml:"schedule,omitempty"`
	Alert       *AlertConfig      `yaml:"alert,omitempty"`
	HTTP        *HTTPConfig       `yaml:"http,omitempty"`
	Notification *NotificationConfig `yaml:"notification,omitempty"`
}

// TriggerEntry represents a configured trigger in config.yaml
type TriggerEntry struct {
	ID      string       `yaml:"id"`
	Label   string       `yaml:"label"`
	Workspace string     `yaml:"workspace,omitempty"` // default "default"
	Flow    string       `yaml:"flow"`                // flow ID (pipeline name)
	Type    TriggerType  `yaml:"type"`
	Config  TriggerConfig `yaml:"config"`
}
```

### 3.4 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/flows/triggers` | List all triggers across flows |
| GET | `/api/flows/{flowId}/triggers` | List triggers for a specific flow |
| GET | `/api/flows/triggers/{triggerId}` | Get a specific trigger |
| POST | `/api/flows/triggers` | Create a new trigger |
| PUT | `/api/flows/triggers/{triggerId}` | Update a trigger |
| DELETE | `/api/flows/triggers/{triggerId}` | Delete a trigger |
| POST | `/api/flows/triggers/{triggerId}/test` | Test/simulate trigger execution |
| GET | `/api/flows/triggers/{triggerId}/webhook` | Get webhook URL for webhook-type triggers |

### 3.5 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Bench UI                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  Flows Page     │  │  Triggers Page  │  │  Flow Editor    │ │
│  │  (existing)     │  │  (NEW)          │  │  (expand)       │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Bench API                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  /api/flows/triggers*  /api/flows/{id}/triggers*         │  │
│  │  /api/flows/triggers/{id}*                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                         │                                       │
│                         ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Trigger Service                                         │  │
│  │  - ListTriggers()                                        │  │
│  │  - GetTrigger(flowId, triggerId)                         │  │
│  │  - CreateTrigger() - parse + validate + write to .fp     │  │
│  │  - UpdateTrigger()                                       │  │
│  │  - DeleteTrigger()                                       │  │
│  │  - TestTrigger() - simulate execution                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Flowpipe Mod Directory                       │
│  flows/                                                         │
│    mod.fp                                                       │
│    daily_report.fp  (pipeline block + trigger blocks)          │
│    workday_report.fp  (pipeline block + trigger blocks)        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

See [TASKS.md](./TASKS.md) for the task breakdown and status.

| Phase | Deliverable | Effort |
|-------|-------------|--------|
| 1 | Trigger config model and parsing | Small |
| 2 | Trigger service (CRUD, file I/O) | Medium |
| 3 | Trigger API handlers and routes | Small |
| 4 | UI: Triggers page (list, CRUD) | Medium |
| 5 | UI: Flow editor trigger tab | Medium |
| 6 | Webhook URL generation + testing | Medium |

**Sequence note**: Phases 1-3 are API-first (backend ready). Phase 4 can proceed in parallel with Phase 5 (both UI). Phase 6 enables webhook testing.

---

## Data Model Details

### 5.1 TriggerEntry (Config)

```yaml
flowpipe_triggers:
  - id: daily_report_schedule
    label: Daily Report
    flow: daily_report
    type: schedule
    config:
      description: "Run daily at 9 AM UTC"
      pipeline: pipeline.daily_report
      schedule:
        cron: "0 9 * * *"
        timezone: "UTC"
```

**Fields:**
- `id`: Unique identifier, slug-like (generated from label if empty)
- `label`: Human-readable name
- `workspace`: Flowpipe workspace to use (default "default")
- `flow`: Flow/pipeline ID to execute
- `type`: One of `webhook`, `schedule`, `alert`, `http`, `notification`
- `config`: Type-specific configuration (description, schedule, alert conditions, etc.)

### 5.2 TriggerState (API Response)

Flowpipe's `/api/v0/process` API includes trigger information. We'll expose:

```json
{
  "id": "daily_report_schedule",
  "label": "Daily Report",
  "flow": "daily_report",
  "type": "schedule",
  "workspace": "default",
  "enabled": true,
  "config": { ... },
  "lastRun": "2026-05-08T09:00:00Z",
  "nextRun": "2026-05-09T09:00:00Z",
  "status": "ready" | "error" | "paused"
}
```

---

## Trigger Types to Support

| Type | Configuration | Use Case | Priority |
|------|---------------|----------|----------|
| **webhook** | `description`, `pipeline` | Trigger via HTTP POST | P0 |
| **schedule** | `cron`, `timezone` | Periodic execution | P0 |
| **alert** | `source`, `condition`, `pipeline` | Alert-based trigger | P1 |
| **http** | `url`, `method`, `body` | HTTP callback trigger | P1 |
| **notification** | `source`, `channel`, `conditions` | Notification trigger | P2 |

**Deferred** (not in initial scope):
- **Slack/Teams integrations**: Pre-built notification triggers
- **Git triggers**: Repository push/PR events

---

## Security Considerations

- **Path traversal**: Same as flow file handling — validate filenames, reject `..`
- **Authentication**: No new auth layers needed; existing API token required
- **Webhook URLs**: Should Flowpipe handle webhook auth? Bond/Bench adds headers; Flowpipe validates
- **Pipeline references**: Validate `flow` references existing pipelines
- **Workspace scoping**: Triggers are workspace-scoped; ensure users cannot trigger pipelines in other workspaces

---

## Testing Strategy

- **Test config**: Use `api/internal/config/testdata/flowpipe-triggers-config.yaml`
- **Unit tests**: Trigger service CRUD, file I/O, validation
- **Integration tests**: API endpoints for triggers CRUD
- **Validation tests**: Invalid trigger configs fail appropriately
- **Regression tests**: Existing flows without triggers still work
- **UI tests**: Trigger list, create, edit flows

---

## Migration Path for Users

1. **No change**: Existing flows without triggers continue to work
2. **Optional migration**: Users add `flowpipe_triggers[]` section to config.yaml
3. **File sync**: On config load, Bench writes trigger blocks to corresponding `.fp` files
4. **Manual edits**: If users edit `.fp` files directly, sync on next config reload

---

## Future Enhancements

- **Trigger batching**: Group triggers under a single mod
- **Trigger templates**: Pre-built trigger configurations
- **Trigger monitoring**: Dashboard showing trigger status, success rates
- **Webhook signature verification**: Support for GitHub, GitLab, etc. signatures
- **Trigger dependencies**: Trigger A triggers Trigger B after completion
- **Rate limiting**: Per-trigger rate limits
- **Retry policies**: Trigger-specific retry configuration

---

## Files Structure (Proposed)

```
api/
  internal/
    config/
      config.go           # Add TriggerEntry, Triggers(), TriggerByID()
    model/
      trigger.go          # NEW: TriggerEntry, TriggerConfig, TriggerState
    service/
      flow/
        service.go        # Add Trigger* methods
    handler/
      flow.go             # Add HandleTriggers*, HandleTrigger*, HandleTestTrigger*
    service/
      flowpipe/
        trigger/          # NEW: Trigger service (optional dedicated module)
ui/
  src/
    lib/
      triggers.ts         # NEW: Trigger type definitions, API helpers
    pages/
      FlowsTriggers.tsx   # NEW: Triggers management page
    components/
      flow/
        TriggerEditor.tsx # NEW: Trigger editor panel (expand flow panel)
        TriggerList.tsx   # NEW: Trigger list component
```

---

## Acceptance Criteria Summary

### Phase 1-3 (API)
- [ ] Config accepts `flowpipe_triggers[]` with all types
- [ ]新征程 service can list, get, create, update, delete triggers
- [ ] Triggers are written to `.fp` files as trigger blocks
- [ ] API endpoints work: GET/POST/PUT/DELETE `/api/flows/triggers*`
- [ ] Validation rejects invalid trigger configs

### Phase 4-5 (UI)
- [ ] Triggers page displays list of all triggers
- [ ] Create trigger form (with type selector, flow list, config fields)
- [ ] Edit trigger modal/form
- [ ] Delete trigger confirmation
- [ ] Flow editor has "Triggers" tab for each flow
- [ ] Webhook URL display for webhook-type triggers

### Phase 6 (Webhook Testing)
- [ ] Test webhook endpoint generates proper payload
- [ ] Webhook URL includes workspace and trigger ID
- [ ] Trigger can be simulated via API
- [ ] Execution results visible in UI

### Integration
- [ ] Existing flows without triggers still work
- [ ] Flow execution via `POST /api/flows/{id}/run` still works
- [ ] No breaking changes to existing endpoints

---

## References

- [Flowpipe Triggers Documentation](https://flowpipe.io/docs/flowpipe-hcl/trigger)
- Flowpipe trigger types: `webhook`, `schedule`, `alert`, `http`, `notification`
- Trigger configuration: `pipeline`, `cron`, `source`, `condition`, `url`
- Trigger state via `/api/v0/process` includes trigger metadata
- [Flowpipe Webhooks](https://flowpipe.io/docs/flowpipe-hcl/trigger/webhook)
- [Flowpipe Schedule Trigger](https://flowpipe.io/docs/flowpipe-hcl/trigger/schedule)
