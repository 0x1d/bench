package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/0x1d/bench/api/internal/model"
	"github.com/0x1d/bench/api/internal/service/schema"
)

var schemaSvc = schema.NewService()

// HandleSchemaList returns all registered schemas.
func HandleSchemaList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	schemas := schemaSvc.List()
	resp := struct {
		Schemas []model.SchemaResource `json:"schemas"`
	}{
		Schemas: schemas,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

// HandleSchemaGet returns metadata for a single schema by id.
func HandleSchemaGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		http.Error(w, "schema id required", http.StatusBadRequest)
		return
	}

	res, err := schemaSvc.Get(id)
	if err != nil {
		if err == schema.ErrSchemaNotFound {
			http.Error(w, "schema not found", http.StatusNotFound)
			return
		}
		http.Error(w, fmt.Sprintf("schema failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(res)
}

// HandleSchemaContent returns raw schema file bytes (JSON or YAML).
func HandleSchemaContent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		http.Error(w, "schema id required", http.StatusBadRequest)
		return
	}

	content, err := schemaSvc.Content(id)
	if err != nil {
		switch err {
		case schema.ErrSchemaNotFound:
			http.Error(w, "schema not found", http.StatusNotFound)
		case schema.ErrPathTraversal:
			http.Error(w, "invalid path", http.StatusBadRequest)
		default:
			http.Error(w, fmt.Sprintf("schema content failed: %v", err), http.StatusInternalServerError)
		}
		return
	}

	ct := "application/json"
	if len(content) > 0 {
		trimmed := strings.TrimSpace(string(content))
		if !strings.HasPrefix(trimmed, "{") && !strings.HasPrefix(trimmed, "[") {
			ct = "application/x-yaml"
		}
	}
	w.Header().Set("Content-Type", ct)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content)
}
