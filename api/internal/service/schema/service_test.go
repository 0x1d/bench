package schema

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/0x1d/bench/api/internal/config"
)

func configFixturePath(t *testing.T, name string) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(1)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	dir := filepath.Join(filepath.Dir(file), "..", "..", "config", "testdata")
	abs, err := filepath.Abs(filepath.Join(dir, name))
	if err != nil {
		t.Fatalf("abs: %v", err)
	}
	return abs
}

func TestList_WithSchemas(t *testing.T) {
	t.Setenv("BENCH_CONFIG", configFixturePath(t, "schema-registry-config.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	svc := NewService()
	list := svc.List()
	if len(list) != 2 {
		t.Fatalf("expected 2 schemas, got %d", len(list))
	}
	ids := map[string]bool{}
	for _, s := range list {
		ids[s.ID] = true
	}
	if !ids["test-api"] || !ids["bad-traversal"] {
		t.Fatalf("unexpected ids: %+v", list)
	}
}

func TestList_EmptySchemas(t *testing.T) {
	t.Setenv("BENCH_CONFIG", configFixturePath(t, "schema-registry-empty-schemas.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	svc := NewService()
	list := svc.List()
	if len(list) != 0 {
		t.Fatalf("expected empty list, got %d", len(list))
	}
}

func TestGet_Valid(t *testing.T) {
	t.Setenv("BENCH_CONFIG", configFixturePath(t, "schema-registry-config.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	svc := NewService()
	res, err := svc.Get("test-api")
	if err != nil {
		t.Fatal(err)
	}
	if res.ID != "test-api" || res.Type != "openapi" {
		t.Fatalf("unexpected resource: %+v", res)
	}
}

func TestGet_NotFound(t *testing.T) {
	t.Setenv("BENCH_CONFIG", configFixturePath(t, "schema-registry-config.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	svc := NewService()
	_, err := svc.Get("nope")
	if err != ErrSchemaNotFound {
		t.Fatalf("expected ErrSchemaNotFound, got %v", err)
	}
}

func TestContent_Valid(t *testing.T) {
	t.Setenv("BENCH_CONFIG", configFixturePath(t, "schema-registry-config.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	svc := NewService()
	b, err := svc.Content("test-api")
	if err != nil {
		t.Fatal(err)
	}
	if len(b) == 0 {
		t.Fatal("expected non-empty content")
	}
}

func TestContent_NotFound(t *testing.T) {
	t.Setenv("BENCH_CONFIG", configFixturePath(t, "schema-registry-config.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	svc := NewService()
	_, err := svc.Content("missing")
	if err != ErrSchemaNotFound {
		t.Fatalf("expected ErrSchemaNotFound, got %v", err)
	}
}

func TestContent_PathTraversal(t *testing.T) {
	t.Setenv("BENCH_CONFIG", configFixturePath(t, "schema-registry-config.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	svc := NewService()
	_, err := svc.Content("bad-traversal")
	if err != ErrPathTraversal {
		t.Fatalf("expected ErrPathTraversal, got %v", err)
	}
}

func TestConfigDir_Available(t *testing.T) {
	t.Setenv("BENCH_CONFIG", configFixturePath(t, "schema-registry-config.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	if config.ConfigDir() == "" {
		t.Fatal("expected non-empty ConfigDir")
	}
}

func TestContent_JSONSchema(t *testing.T) {
	t.Setenv("BENCH_CONFIG", configFixturePath(t, "json-schema-registry.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	svc := NewService()
	b, err := svc.Content("js-fixture")
	if err != nil {
		t.Fatal(err)
	}
	if len(b) == 0 {
		t.Fatal("expected json-schema file bytes")
	}
}
