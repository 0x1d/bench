# Infrastructure (Terraform)

The Infrastructure page provides Terraform-focused editing and operations inside Bench. It combines:

- Terraform file browsing/editing
- Dependency graph visualization
- Server-side Terraform command execution (`init`, `plan`, `apply`, `destroy`)

This page documents the current API contract and operational behavior.

## Overview

Infrastructure support is enabled when `infrastructure.path` is configured in `config.yaml`.

When enabled:

- Bench resolves the infrastructure directory relative to the config file (or uses an absolute path).
- An additional filesystem root is exposed automatically as `infra`.
- The UI can edit `.tf`/`.hcl` files and run Terraform commands from the configured directory.

## Configuration

In `config.yaml`:

```yaml
infrastructure:
  path: ./workspace/infra
```

- `path` defaults to `./workspace/infra` (relative to config directory) when omitted in internal resolution.
- On the Configuration page, this is shown as "Infrastructure directory".

## UI Workflow

### 1) Configure and verify

The page first checks:

- Infrastructure is configured
- Terraform CLI exists in server `PATH`

If either check fails, the UI shows a setup card with remediation guidance.

### 2) Edit files

- File operations use root `infra` through the resources API.
- Saving via the Infrastructure editor uses `/api/infrastructure/save-file`.
- Save triggers a best-effort `terraform fmt` server-side.

### 3) Visualize dependencies

- Diagram mode uses `terraform graph` output when available.
- If graph data is unavailable/empty, UI falls back to parsing Terraform files for a structural diagram.
- Diagram preferences (layout direction and dependency direction) are stored in browser `localStorage`.

### 4) Run Terraform commands

Buttons in the toolbar call:

- `init`
- `plan`
- `apply`
- `destroy`

Output is streamed and shown in the Infrastructure side panel.

## API Reference

All endpoints require `X-API-Token`. Base path: `/api/infrastructure`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/infrastructure/status` | Returns infra config status and Terraform availability |
| GET | `/api/infrastructure/graph` | Runs `terraform graph` and returns DOT |
| POST | `/api/infrastructure/save-file` | Saves a file under infra path, then runs `terraform fmt` |
| POST | `/api/infrastructure/init` | Runs `terraform init` and streams output |
| POST | `/api/infrastructure/plan` | Runs `terraform plan` and streams output |
| POST | `/api/infrastructure/apply` | Runs `terraform apply -auto-approve` and streams output |
| POST | `/api/infrastructure/destroy` | Runs `terraform destroy -auto-approve` and streams output |

### GET `/api/infrastructure/status`

Response:

```json
{
  "configured": true,
  "path": "/abs/path/to/workspace/infra",
  "terraformAvailable": true
}
```

### GET `/api/infrastructure/graph`

Response:

```json
{
  "dot": "digraph {...}"
}
```

### POST `/api/infrastructure/save-file`

Request:

```json
{
  "path": "main.tf",
  "content": "terraform { required_version = \">= 1.5.0\" }"
}
```

Behavior notes:

- `path` must resolve inside the configured infrastructure directory.
- Parent folders are created automatically when needed.
- File is written before running `terraform fmt`.
- `terraform fmt` failures are ignored (save still succeeds).

### POST `/api/infrastructure/{command}`

For `init`, `plan`, `apply`, `destroy`:

- Content type: `text/plain; charset=utf-8`
- Response body: streamed command output (stdout+stderr merged)
- Environment includes `TF_IN_AUTOMATION=1`

## Troubleshooting

| Symptom | Likely cause | What to check |
|--------|---------------|---------------|
| "Infrastructure not configured" card | `infrastructure.path` missing | Add/update `infrastructure.path` in config |
| "Terraform CLI not found" card | Terraform binary unavailable to API process | Install Terraform and verify `terraform` is on server `PATH` |
| Save fails with `path traversal not allowed` | Path escapes infra root | Use a path relative to infra directory, no `..` segments |
| Diagram missing edges or empty | `terraform graph` not available/empty for current state | Run `init`/`plan`, then refresh diagram |
| Command looked successful but output includes errors | Terraform output is streamed; inspect panel output directly | Review full output in Infrastructure panel before proceeding |

## Security and operational constraints

- API token is required for all infrastructure endpoints.
- Save-file path traversal is rejected by path normalization and root-relative checks.
- Terraform commands execute server-side in the configured infra directory; treat API token access as privileged.

See also [security.md](security.md) and [filesystem.md](filesystem.md).
