# Database Integration (PostgreSQL)

The bench Database page provides a full-featured PostgreSQL browser, schema editor, and SQL query runner. It works with local PostgreSQL or hosted services such as [Supabase](https://supabase.com).

## Overview

When `DATABASE_URL` is set in the API environment, the Database page enables:

- **Table browser** — List tables with row counts, browse data with pagination and search
- **Schema editor** — Create tables, alter columns, add foreign keys, drop tables
- **Row editor** — Insert, update, and delete rows with foreign key lookups
- **Query editor** — Execute arbitrary SQL and view results

All operations are scoped to the `public` schema.

## API Reference

All database endpoints require the `X-API-Token` header. Base path: `/api/database`.

### Tables

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/database/tables` | List all tables in the public schema with approximate row counts |
| POST | `/api/database/tables` | Create a new table |
| GET | `/api/database/tables/{name}` | Get paginated table data |
| PATCH | `/api/database/tables/{name}` | Alter table schema |
| DELETE | `/api/database/tables/{name}` | Drop a table |

### Table Data

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/database/tables/{name}` | Paginated rows with optional search |
| POST | `/api/database/tables/{name}/rows` | Insert a row |
| PATCH | `/api/database/tables/{name}/rows` | Update rows matching a where clause |
| DELETE | `/api/database/tables/{name}/rows` | Delete rows matching a where clause |

### Schema & Lookup

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/database/schema/{name}` | Get column schema (types, keys, foreign keys) |
| GET | `/api/database/tables/{name}/lookup` | Rows for foreign key dropdown (with optional search) |

### Query Endpoint

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/database/query` | Execute arbitrary SQL |

The query endpoint runs any SQL statement and returns either:

- **SELECT-like queries**: `{ "columns": string[], "rows": any[][] }`
- **DML/DDL** (INSERT, UPDATE, DELETE, CREATE, etc.): `{ "rowsAffected": number }`

**Request body:**

```json
{
  "sql": "SELECT id, name FROM users LIMIT 10"
}
```

**Response (SELECT):**

```json
{
  "columns": ["id", "name"],
  "rows": [[1, "Alice"], [2, "Bob"]]
}
```

**Response (DML/DDL):**

```json
{
  "rowsAffected": 3
}
```

**Behavior:**

- Supports single statements only (no semicolon-separated batches)
- SELECT returns column names and row data; DML/DDL returns rows affected
- Errors return 500 with the PostgreSQL error message

## Endpoint Details

### List Tables

**GET** `/api/database/tables`

**Response:** `{ "tables": [{ "name": string, "rows": number }] }`

### Create Table

**POST** `/api/database/tables`

**Request body:**

```json
{
  "name": "users",
  "columns": [
    {
      "name": "id",
      "dataType": "integer",
      "autoIncrement": true,
      "primaryKey": true
    },
    {
      "name": "name",
      "dataType": "text",
      "required": true
    },
    {
      "name": "role_id",
      "dataType": "integer",
      "references": { "table": "roles", "column": "id" }
    }
  ]
}
```

Supported `dataType` values: `text`, `varchar`, `integer`, `bigint`, `boolean`, `timestamp`, `timestamptz`, `date`, `numeric`, `uuid`, `jsonb`.

### Get Table Data

**GET** `/api/database/tables/{name}`

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | 20 | Max rows (1–1000) |
| `offset` | int | 0 | Pagination offset |
| `search` | string | — | Case-insensitive search across all columns |

### Insert Row

**POST** `/api/database/tables/{name}/rows`

**Request body:** `{ "row": { "col1": value1, "col2": value2 } }`

### Update Row

**PATCH** `/api/database/tables/{name}/rows`

**Request body:** `{ "where": { "id": 1 }, "set": { "name": "New Name" } }`

### Delete Row

**DELETE** `/api/database/tables/{name}/rows`

**Request body:** `{ "where": { "id": 1 } }`

### Table Lookup (FK dropdown)

**GET** `/api/database/tables/{name}/lookup`

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `column` | string | `id` | Column to order by |
| `search` | string | — | Filter rows (ILIKE) |
| `limit` | int | 50 | Max rows (1–100) |

## Foreign Keys

- **Single reference**: One-to-one or many-to-one. Column type matches referenced column (e.g. `integer`, `uuid`).
- **Multiple reference**: One-to-many. Column type is array (e.g. `integer[]`, `uuid[]`) for API/UI compatibility, and Bench also creates an internal join table (`__bench_m2m_<table>_<column>`) with real PostgreSQL foreign key constraints and a composite primary key (`owner_value`, `ref_value`) to enforce referential integrity.

## Setup

Set `DATABASE_URL` in the API environment:

```
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

For local development with Docker:

```bash
docker compose up
```

Then in `.env`:

```
DATABASE_URL=postgresql://bench:bench@localhost:5432/bench
```

If `DATABASE_URL` is not set, the Database page shows a setup message and all database endpoints return 503.
