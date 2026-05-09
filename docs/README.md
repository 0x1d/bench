# Documentation

- **[database.md](database.md)** — Database integration (PostgreSQL): API reference, query endpoint, table operations, foreign keys, setup
- **[configuration.md](configuration.md)** — Configuration and status workflow: `config.yaml` editing, `/api/config*`, `/api/status`, runtime reload behavior, troubleshooting
- **[filesystem.md](filesystem.md)** — File system resource manager: API reference, roots, list, download, upload, create folder, rename, delete
- **[flows.md](flows.md)** — Flows (Flowpipe integration): visual editor, modules, step types, execution, API reference
- **[infrastructure.md](infrastructure.md)** — Infrastructure (Terraform): diagram/editor workflow, command runbook, API reference, troubleshooting
- **[rest.md](rest.md)** — REST resource: Swagger-like test client, OpenAPI spec, proxy
- **[schema-registry.md](schema-registry.md)** — Schema registry: `resources.schemas`, REST `schemaId`, Configuration page (`#configuration`), Schemas UI (`#schemas`), `/api/schemas` API
- **[security.md](security.md)** — Security: API authentication, database credentials, filesystem path traversal prevention, token handling, deployment checklist
- **[plans/](plans/)** — Implementation plans with task tracking
  - [schema-registry](plans/schema-registry/) — Schema registry: OpenAPI, AsyncAPI, JSON Schema; flow integration; phased rollout
