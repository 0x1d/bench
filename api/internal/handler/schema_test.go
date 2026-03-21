package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/0x1d/bench/api/internal/model"
)

func schemaTestConfigPath(t *testing.T, name string) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	dir := filepath.Join(filepath.Dir(file), "..", "config", "testdata")
	abs, err := filepath.Abs(filepath.Join(dir, name))
	if err != nil {
		t.Fatalf("abs: %v", err)
	}
	return abs
}

func TestHandleSchemaList(t *testing.T) {
	t.Setenv("BENCH_CONFIG", schemaTestConfigPath(t, "schema-registry-config.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	req := httptest.NewRequest(http.MethodGet, "/api/schemas", nil)
	rec := httptest.NewRecorder()
	HandleSchemaList(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var resp struct {
		Schemas []model.SchemaResource `json:"schemas"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Schemas) != 2 {
		t.Fatalf("expected 2 schemas, got %d", len(resp.Schemas))
	}
}

func TestHandleSchemaList_MethodNotAllowed(t *testing.T) {
	t.Setenv("BENCH_CONFIG", schemaTestConfigPath(t, "schema-registry-empty-schemas.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	req := httptest.NewRequest(http.MethodPost, "/api/schemas", nil)
	rec := httptest.NewRecorder()
	HandleSchemaList(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

func TestHandleSchemaGet_404(t *testing.T) {
	t.Setenv("BENCH_CONFIG", schemaTestConfigPath(t, "schema-registry-config.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	req := httptest.NewRequest(http.MethodGet, "/api/schemas/unknown", nil)
	req.SetPathValue("id", "unknown")
	rec := httptest.NewRecorder()
	HandleSchemaGet(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestHandleSchemaGet_200(t *testing.T) {
	t.Setenv("BENCH_CONFIG", schemaTestConfigPath(t, "schema-registry-config.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	req := httptest.NewRequest(http.MethodGet, "/api/schemas/test-api", nil)
	req.SetPathValue("id", "test-api")
	rec := httptest.NewRecorder()
	HandleSchemaGet(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var res model.SchemaResource
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatal(err)
	}
	if res.ID != "test-api" {
		t.Fatalf("unexpected id %q", res.ID)
	}
}

func TestHandleSchemaContent_200(t *testing.T) {
	t.Setenv("BENCH_CONFIG", schemaTestConfigPath(t, "schema-registry-config.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	req := httptest.NewRequest(http.MethodGet, "/api/schemas/test-api/content", nil)
	req.SetPathValue("id", "test-api")
	rec := httptest.NewRecorder()
	HandleSchemaContent(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Fatalf("expected application/json Content-Type, got %q", ct)
	}
}

func TestHandleSchemaContent_MethodNotAllowed(t *testing.T) {
	t.Setenv("BENCH_CONFIG", schemaTestConfigPath(t, "schema-registry-config.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	req := httptest.NewRequest(http.MethodPost, "/api/schemas/x/content", nil)
	req.SetPathValue("id", "x")
	rec := httptest.NewRecorder()
	HandleSchemaContent(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

func TestHandleSchemaGet_EmptyID(t *testing.T) {
	t.Setenv("BENCH_CONFIG", schemaTestConfigPath(t, "schema-registry-config.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	req := httptest.NewRequest(http.MethodGet, "/api/schemas/", nil)
	req.SetPathValue("id", "   ")
	rec := httptest.NewRecorder()
	HandleSchemaGet(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestHandleSchemaContent_EmptyID(t *testing.T) {
	t.Setenv("BENCH_CONFIG", schemaTestConfigPath(t, "schema-registry-config.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	req := httptest.NewRequest(http.MethodGet, "/api/schemas//content", nil)
	req.SetPathValue("id", "")
	rec := httptest.NewRecorder()
	HandleSchemaContent(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestHandleSchemaList_EmptySchemas(t *testing.T) {
	t.Setenv("BENCH_CONFIG", schemaTestConfigPath(t, "schema-registry-empty-schemas.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	req := httptest.NewRequest(http.MethodGet, "/api/schemas", nil)
	rec := httptest.NewRecorder()
	HandleSchemaList(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var resp struct {
		Schemas []model.SchemaResource `json:"schemas"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if resp.Schemas == nil {
		t.Fatal("expected non-nil schemas slice in JSON")
	}
	if len(resp.Schemas) != 0 {
		t.Fatalf("expected 0 schemas, got %d", len(resp.Schemas))
	}
}

func TestHandleSchemaGet_MethodNotAllowed(t *testing.T) {
	t.Setenv("BENCH_CONFIG", schemaTestConfigPath(t, "schema-registry-config.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	req := httptest.NewRequest(http.MethodPost, "/api/schemas/x", nil)
	req.SetPathValue("id", "x")
	rec := httptest.NewRecorder()
	HandleSchemaGet(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

func TestHandleSchemaContent_MissingFile(t *testing.T) {
	t.Setenv("BENCH_CONFIG", schemaTestConfigPath(t, "schema-missing-file.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	req := httptest.NewRequest(http.MethodGet, "/api/schemas/missing-file/content", nil)
	req.SetPathValue("id", "missing-file")
	rec := httptest.NewRecorder()
	HandleSchemaContent(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 when file missing on disk, got %d", rec.Code)
	}
}

func TestRegisterRoutes_SchemaList(t *testing.T) {
	t.Setenv("BENCH_CONFIG", schemaTestConfigPath(t, "schema-registry-empty-schemas.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	mux := http.NewServeMux()
	RegisterRoutes(mux)
	req := httptest.NewRequest(http.MethodGet, "/api/schemas", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 from mux, got %d", rec.Code)
	}
}
