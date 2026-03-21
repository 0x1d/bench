package rest

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func restTestConfig(t *testing.T, name string) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
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

func TestSpec_ViaSchemaRegistry(t *testing.T) {
	t.Setenv("BENCH_CONFIG", restTestConfig(t, "rest-spec-via-schema.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	svc := NewService()
	b, err := svc.Spec("r1")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(b, []byte("FromRegistry")) {
		t.Fatalf("expected registry spec content, got %s", string(b))
	}
}

func TestSpec_ViaOpenAPIFile(t *testing.T) {
	t.Setenv("BENCH_CONFIG", restTestConfig(t, "rest-spec-via-file.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	svc := NewService()
	b, err := svc.Spec("r1")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(b, []byte("FromFile")) {
		t.Fatalf("expected file spec content, got %s", string(b))
	}
}

func TestSpec_SchemaIDPrecedence(t *testing.T) {
	t.Setenv("BENCH_CONFIG", restTestConfig(t, "rest-spec-both.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	svc := NewService()
	b, err := svc.Spec("r1")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(b, []byte("FromRegistry")) {
		t.Fatalf("expected schema registry to win, got %s", string(b))
	}
}

func TestList_IncludesSchemaID(t *testing.T) {
	t.Setenv("BENCH_CONFIG", restTestConfig(t, "rest-spec-both.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	svc := NewService()
	list := svc.List()
	if len(list) != 1 {
		t.Fatalf("expected 1 resource, got %d", len(list))
	}
	if list[0].SchemaID != "reg-schema" {
		t.Fatalf("expected schemaId reg-schema, got %q", list[0].SchemaID)
	}
}

func TestSpec_NoOpenAPISource(t *testing.T) {
	t.Setenv("BENCH_CONFIG", restTestConfig(t, "rest-no-spec.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	svc := NewService()
	_, err := svc.Spec("r1")
	if err == nil {
		t.Fatal("expected error when schemaId and openapiSpec are both empty")
	}
	if !errors.Is(err, ErrSpecNotFound) {
		t.Fatalf("expected ErrSpecNotFound, got %v", err)
	}
}
