package model

// TableInfo represents a table in the database.
type TableInfo struct {
	Name string `json:"name"`
	Rows int    `json:"rows,omitempty"`
}

// TableSchemaResponse is the response for table schema (columns).
type TableSchemaResponse struct {
	Columns []ColumnInfo `json:"columns"`
}

// ColumnInfo describes a column for schema display.
type ColumnInfo struct {
	Name          string         `json:"name"`
	DataType      string         `json:"dataType"`
	Required      bool           `json:"required"`
	AutoIncrement bool           `json:"autoIncrement"`
	PrimaryKey    bool           `json:"primaryKey"`
	References    *ForeignKeyRef `json:"references,omitempty"`
}

// ForeignKeyRef describes a foreign key reference.
type ForeignKeyRef struct {
	Table    string `json:"table"`
	Column   string `json:"column"`
	Multiple bool   `json:"multiple,omitempty"` // one-to-many: column stores array of IDs
}

// InsertRowRequest is the request body for inserting a row.
type InsertRowRequest struct {
	Row map[string]any `json:"row"`
}

// TablesResponse is the response for listing tables.
type TablesResponse struct {
	Tables []TableInfo `json:"tables"`
}

// TableDataResponse is the response for table data with pagination.
type TableDataResponse struct {
	Columns []string   `json:"columns"`
	Rows    [][]any    `json:"rows"`
	Total   int        `json:"total"`
}

// CreateTableRequest is the request body for creating a table.
type CreateTableRequest struct {
	Name    string           `json:"name"`
	Columns []ColumnDef      `json:"columns"`
}

// ColumnDef defines a column for table creation.
type ColumnDef struct {
	Name          string         `json:"name"`
	DataType      string         `json:"dataType"`
	Required      bool           `json:"required"`
	AutoIncrement bool           `json:"autoIncrement"`
	PrimaryKey    bool           `json:"primaryKey"`
	References    *ForeignKeyRef `json:"references,omitempty"`
}

// QueryRequest is the request body for executing SQL.
type QueryRequest struct {
	SQL string `json:"sql"`
}

// QueryResponse is the response for SELECT queries.
type QueryResponse struct {
	Columns []string `json:"columns"`
	Rows    [][]any  `json:"rows"`
}

// QueryRowsAffectedResponse is the response for DML/DDL (non-SELECT).
type QueryRowsAffectedResponse struct {
	RowsAffected int `json:"rowsAffected"`
}

// AlterTableRequest is the request body for altering a table.
type AlterTableRequest struct {
	Columns []ColumnDef `json:"columns"`
}

// UpdateRowRequest is the request body for updating a row.
type UpdateRowRequest struct {
	Where map[string]any `json:"where"`
	Set   map[string]any `json:"set"`
}

// DeleteRowRequest is the request body for deleting a row.
type DeleteRowRequest struct {
	Where map[string]any `json:"where"`
}
