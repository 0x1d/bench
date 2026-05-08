package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func mustUnmarshal(t *testing.T, yamlStr string) Config {
	t.Helper()
	var cfg Config
	if err := yaml.Unmarshal([]byte(yamlStr), &cfg); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return cfg
}

func TestValidateConfig_Schemas_DuplicateID(t *testing.T) {
	cfg := mustUnmarshal(t, `
resources:
  schemas:
    - id: dup
      label: A
      type: openapi
      source:
        path: ./a.json
    - id: dup
      label: B
      type: openapi
      source:
        path: ./b.json
`)
	err := validateConfig(cfg)
	if err == nil || !strings.Contains(err.Error(), "duplicate id") {
		t.Fatalf("expected duplicate id error, got %v", err)
	}
}

func TestValidateConfig_Schemas_InvalidType(t *testing.T) {
	cfg := mustUnmarshal(t, `
resources:
  schemas:
    - id: s1
      label: S
      type: not-a-type
      source:
        path: ./a.json
`)
	err := validateConfig(cfg)
	if err == nil || !strings.Contains(err.Error(), "type must be one of") {
		t.Fatalf("expected invalid type error, got %v", err)
	}
}

func TestValidateConfig_Schemas_EmptySourcePath(t *testing.T) {
	cfg := mustUnmarshal(t, `
resources:
  schemas:
    - id: s1
      label: S
      type: openapi
      source:
        path: ""
`)
	err := validateConfig(cfg)
	if err == nil || !strings.Contains(err.Error(), "source.path is required") {
		t.Fatalf("expected source.path error, got %v", err)
	}
}

func TestValidateConfig_Schemas_EmptyID(t *testing.T) {
	cfg := mustUnmarshal(t, `
resources:
  schemas:
    - id: ""
      label: S
      type: openapi
      source:
        path: ./a.json
`)
	err := validateConfig(cfg)
	if err == nil || !strings.Contains(err.Error(), "id is required") {
		t.Fatalf("expected id required error, got %v", err)
	}
}

func TestValidateConfig_Rest_SchemaID_MissingSchema(t *testing.T) {
	cfg := mustUnmarshal(t, `
resources:
  rest:
    - id: r1
      label: R
      baseUrl: https://example.com
      schemaId: does-not-exist
`)
	err := validateConfig(cfg)
	if err == nil || !strings.Contains(err.Error(), "non-existent or non-openapi schema") {
		t.Fatalf("expected schemaId reference error, got %v", err)
	}
}

func TestValidateConfig_Rest_SchemaID_NonOpenAPI(t *testing.T) {
	cfg := mustUnmarshal(t, `
resources:
  schemas:
    - id: async1
      label: Async
      type: asyncapi
      source:
        path: ./async.yaml
  rest:
    - id: r1
      label: R
      baseUrl: https://example.com
      schemaId: async1
`)
	err := validateConfig(cfg)
	if err == nil || !strings.Contains(err.Error(), "non-existent or non-openapi schema") {
		t.Fatalf("expected non-openapi schema error, got %v", err)
	}
}

func TestValidateConfig_Rest_SchemaID_ValidOpenAPI(t *testing.T) {
	cfg := mustUnmarshal(t, `
resources:
  schemas:
    - id: api1
      label: API
      type: openapi
      source:
        path: ./petstore.json
  rest:
    - id: r1
      label: R
      baseUrl: https://example.com
      schemaId: api1
`)
	if err := validateConfig(cfg); err != nil {
		t.Fatal(err)
	}
}

func TestSchemaEntries_ReadConfigError(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("BENCH_CONFIG", filepath.Join(dir, "nonexistent.yaml"))
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })
	if s := SchemaEntries(); s != nil && len(s) != 0 {
		t.Fatalf("expected nil or empty when config missing, got %v", s)
	}
}

func TestSchemaEntries_SchemaByID(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	yamlContent := `
resources:
  filesystem:
    - id: x
      label: x
      path: /tmp
  schemas:
    - id: pet
      label: Pet
      type: openapi
      source:
        path: ./pet.json
`
	if err := os.WriteFile(cfgPath, []byte(yamlContent), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("BENCH_CONFIG", cfgPath)
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })

	entries := SchemaEntries()
	if len(entries) != 1 || entries[0].ID != "pet" {
		t.Fatalf("unexpected entries: %+v", entries)
	}
	if entries[0].Label != "Pet" {
		t.Fatalf("expected label defaulted or set, got %q", entries[0].Label)
	}
	e := SchemaByID("pet")
	if e == nil || e.ID != "pet" {
		t.Fatalf("SchemaByID: %+v", e)
	}
	if SchemaByID("missing") != nil {
		t.Fatal("expected nil for unknown id")
	}
}

func TestSchemaEntries_LabelDefaultsToID(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	yamlContent := `
resources:
  filesystem:
    - id: x
      label: x
      path: /tmp
  schemas:
    - id: nolabel
      label: ""
      type: openapi
      source:
        path: ./pet.json
`
	if err := os.WriteFile(cfgPath, []byte(yamlContent), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("BENCH_CONFIG", cfgPath)
	t.Cleanup(func() { _ = os.Unsetenv("BENCH_CONFIG") })
	entries := SchemaEntries()
	if len(entries) != 1 || entries[0].Label != "nolabel" {
		t.Fatalf("expected label default to id, got %+v", entries)
	}
}

// Trigger validation tests
func TestValidateConfig_Triggers_DuplicateID(t *testing.T) {
	cfg := mustUnmarshal(t, `
flowpipe_triggers:
  triggers:
    - id: dup
      flow: pipeline1
      type: webhook
      config:
        description: A
    - id: dup
      flow: pipeline2
      type: webhook
      config:
        description: B
`)
	err := validateConfig(cfg)
	if err == nil || !strings.Contains(err.Error(), "duplicate id") {
		t.Fatalf("expected duplicate id error, got %v", err)
	}
}

func TestValidateConfig_Triggers_InvalidType(t *testing.T) {
	cfg := mustUnmarshal(t, `
flowpipe_triggers:
  triggers:
    - id: t1
      flow: pipeline1
      type: invalid-type
      config:
        description: Test
`)
	err := validateConfig(cfg)
	if err == nil || !strings.Contains(err.Error(), "type must be one of") {
		t.Fatalf("expected invalid type error, got %v", err)
	}
}

func TestValidateConfig_Triggers_EmptyType(t *testing.T) {
	cfg := mustUnmarshal(t, `
flowpipe_triggers:
  triggers:
    - id: t1
      flow: pipeline1
      type: ""
      config:
        description: Test
`)
	err := validateConfig(cfg)
	if err == nil || !strings.Contains(err.Error(), "type is required") {
		t.Fatalf("expected type required error, got %v", err)
	}
}

func TestValidateConfig_Triggers_EmptyFlow(t *testing.T) {
	cfg := mustUnmarshal(t, `
flowpipe_triggers:
  triggers:
    - id: t1
      flow: ""
      type: webhook
      config:
        description: Test
`)
	err := validateConfig(cfg)
	if err == nil || !strings.Contains(err.Error(), "flow is required") {
		t.Fatalf("expected flow required error, got %v", err)
	}
}

func TestValidateConfig_Triggers_EmptyID(t *testing.T) {
	cfg := mustUnmarshal(t, `
flowpipe_triggers:
  triggers:
    - id: ""
      flow: pipeline1
      type: webhook
      config:
        description: Test
`)
	err := validateConfig(cfg)
	if err == nil || !strings.Contains(err.Error(), "id is required") {
		t.Fatalf("expected id required error, got %v", err)
	}
}

func TestValidateConfig_Triggers_Complete(t *testing.T) {
	cfg := mustUnmarshal(t, `
flowpipe_triggers:
  triggers:
    - id: webhook-trigger
      flow: daily_report
      type: webhook
      config:
        description: "Webhook trigger"
        pipeline: pipeline.daily_report
    - id: schedule-trigger
      flow: hourly_check
      type: schedule
      config:
        description: "Schedule trigger"
        pipeline: pipeline.hourly_check
        schedule:
          cron: "0 * * * *"
`)
	if err := validateConfig(cfg); err != nil {
		t.Fatalf("expected valid config, got %v", err)
	}
}
