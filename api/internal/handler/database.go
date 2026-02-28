package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/0x1d/bench/api/internal/db"
	"github.com/0x1d/bench/api/internal/model"
	"github.com/0x1d/bench/api/internal/service/database"
)

// HandleDatabaseTablesList returns all tables in the public schema.
func HandleDatabaseTablesList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !db.Configured() {
		http.Error(w, "database not configured", http.StatusServiceUnavailable)
		return
	}

	tables, err := database.ListTables(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(model.TablesResponse{Tables: tables})
}

// HandleDatabaseTableLookup returns rows for FK lookup with optional search.
func HandleDatabaseTableLookup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !db.Configured() {
		http.Error(w, "database not configured", http.StatusServiceUnavailable)
		return
	}

	tableName := r.PathValue("name")
	if tableName == "" {
		http.Error(w, "table name required", http.StatusBadRequest)
		return
	}

	valueColumn := r.URL.Query().Get("column")
	if valueColumn == "" {
		valueColumn = "id"
	}
	search := r.URL.Query().Get("search")
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	data, err := database.GetTableLookup(r.Context(), tableName, valueColumn, search, limit)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(data)
}

// HandleDatabaseTableData returns paginated table data.
func HandleDatabaseTableData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !db.Configured() {
		http.Error(w, "database not configured", http.StatusServiceUnavailable)
		return
	}

	tableName := r.PathValue("name")
	if tableName == "" {
		http.Error(w, "table name required", http.StatusBadRequest)
		return
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 1000 {
			limit = n
		}
	}
	offset := 0
	if o := r.URL.Query().Get("offset"); o != "" {
		if n, err := strconv.Atoi(o); err == nil && n >= 0 {
			offset = n
		}
	}
	search := strings.TrimSpace(r.URL.Query().Get("search"))

	data, err := database.GetTableData(r.Context(), tableName, limit, offset, search)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(data)
}

// HandleDatabaseTablesCreate creates a new table.
func HandleDatabaseTablesCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !db.Configured() {
		http.Error(w, "database not configured", http.StatusServiceUnavailable)
		return
	}

	var req model.CreateTableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := database.CreateTable(r.Context(), &req); err != nil {
		if strings.Contains(err.Error(), "invalid") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

// HandleDatabaseQuery executes arbitrary SQL.
func HandleDatabaseQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !db.Configured() {
		http.Error(w, "database not configured", http.StatusServiceUnavailable)
		return
	}

	var req model.QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	columns, rows, rowsAffected, err := database.ExecuteQuery(r.Context(), req.SQL)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if len(columns) > 0 {
		_ = json.NewEncoder(w).Encode(model.QueryResponse{Columns: columns, Rows: rows})
		return
	}
	_ = json.NewEncoder(w).Encode(model.QueryRowsAffectedResponse{RowsAffected: rowsAffected})
}

// HandleDatabaseTableSchema returns column schema for a table.
func HandleDatabaseTableSchema(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !db.Configured() {
		http.Error(w, "database not configured", http.StatusServiceUnavailable)
		return
	}

	tableName := r.PathValue("name")
	if tableName == "" {
		http.Error(w, "table name required", http.StatusBadRequest)
		return
	}

	schema, err := database.GetTableSchema(r.Context(), tableName)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(schema)
}

// HandleDatabaseTableDrop drops a table.
func HandleDatabaseTableDrop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !db.Configured() {
		http.Error(w, "database not configured", http.StatusServiceUnavailable)
		return
	}

	tableName := r.PathValue("name")
	if tableName == "" {
		http.Error(w, "table name required", http.StatusBadRequest)
		return
	}

	if err := database.DropTable(r.Context(), tableName); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleDatabaseTableAlter alters a table's schema.
func HandleDatabaseTableAlter(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !db.Configured() {
		http.Error(w, "database not configured", http.StatusServiceUnavailable)
		return
	}

	tableName := r.PathValue("name")
	if tableName == "" {
		http.Error(w, "table name required", http.StatusBadRequest)
		return
	}

	var req model.AlterTableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := database.AlterTable(r.Context(), tableName, &req); err != nil {
		if strings.Contains(err.Error(), "invalid") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// HandleDatabaseTableUpdateRow updates a row.
func HandleDatabaseTableUpdateRow(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !db.Configured() {
		http.Error(w, "database not configured", http.StatusServiceUnavailable)
		return
	}

	tableName := r.PathValue("name")
	if tableName == "" {
		http.Error(w, "table name required", http.StatusBadRequest)
		return
	}

	var req model.UpdateRowRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Where == nil {
		req.Where = make(map[string]any)
	}
	if req.Set == nil {
		req.Set = make(map[string]any)
	}

	if err := database.UpdateRow(r.Context(), tableName, req.Where, req.Set); err != nil {
		if strings.Contains(err.Error(), "invalid") || strings.Contains(err.Error(), "unknown column") || strings.Contains(err.Error(), "no rows matched") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// HandleDatabaseTableDeleteRow deletes a row.
func HandleDatabaseTableDeleteRow(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !db.Configured() {
		http.Error(w, "database not configured", http.StatusServiceUnavailable)
		return
	}

	tableName := r.PathValue("name")
	if tableName == "" {
		http.Error(w, "table name required", http.StatusBadRequest)
		return
	}

	var req model.DeleteRowRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Where == nil {
		req.Where = make(map[string]any)
	}

	if err := database.DeleteRow(r.Context(), tableName, req.Where); err != nil {
		if strings.Contains(err.Error(), "invalid") || strings.Contains(err.Error(), "unknown column") || strings.Contains(err.Error(), "no rows matched") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleDatabaseTableInsert inserts a row into a table.
func HandleDatabaseTableInsert(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !db.Configured() {
		http.Error(w, "database not configured", http.StatusServiceUnavailable)
		return
	}

	tableName := r.PathValue("name")
	if tableName == "" {
		http.Error(w, "table name required", http.StatusBadRequest)
		return
	}

	var req model.InsertRowRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Row == nil {
		req.Row = make(map[string]any)
	}

	if err := database.InsertRow(r.Context(), tableName, req.Row); err != nil {
		if strings.Contains(err.Error(), "invalid") || strings.Contains(err.Error(), "unknown column") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}
