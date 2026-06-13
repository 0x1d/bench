package flow

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/0x1d/bench/api/internal/model"
)

func TestValidateHTTPTrigger_MissingRequiredParam(t *testing.T) {
	dir := setupTestDir(t)
	writeFlowsConfig(t, dir)

	s := NewService()

	// Flow with required param and no default
	flowJSON := `{
		"id": "needs_input",
		"name": "Needs Input",
		"steps": [
			{
				"id": "step_input_1",
				"type": "input",
				"label": "Input",
				"config": {
					"params": [{"name": "input1", "type": "string"}]
				}
			},
			{
				"id": "step_message_1",
				"type": "message",
				"label": "msg",
				"config": {"notifier": "default", "text": "hi"},
				"dependsOn": ["step_input_1"]
			}
		],
		"edges": []
	}`
	if err := writeTestFlow(t, dir, "needs_input", flowJSON); err != nil {
		t.Fatal(err)
	}

	trigger := &model.TriggerEntry{
		ID:     "broken",
		Module: ".",
		Type:   model.TriggerTypeHTTP,
		Config: model.TriggerConfig{
			Pipeline: "pipeline.needs_input",
			HTTP: &model.HTTPConfig{
				Pipeline:      "pipeline.needs_input",
				ExecutionMode: "synchronous",
				Args:          map[string]string{"conn_local": "local"},
			},
		},
	}

	err := s.ValidateTriggerEntry(trigger)
	if err == nil {
		t.Fatal("expected validation error for missing input1")
	}
	if !strings.Contains(err.Error(), "missing required pipeline args") || !strings.Contains(err.Error(), "input1") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateHTTPTrigger_UnknownArgKey(t *testing.T) {
	dir := setupTestDir(t)
	writeFlowsConfig(t, dir)

	s := NewService()

	flowJSON := `{
		"id": "with_default",
		"name": "With Default",
		"steps": [
			{
				"id": "step_input_1",
				"type": "input",
				"label": "Input",
				"config": {
					"params": [{"name": "greeting", "type": "string", "default": "Hello"}]
				}
			},
			{
				"id": "step_message_1",
				"type": "message",
				"label": "msg",
				"config": {"notifier": "default", "text": "hi"},
				"dependsOn": ["step_input_1"]
			}
		],
		"edges": []
	}`
	if err := writeTestFlow(t, dir, "with_default", flowJSON); err != nil {
		t.Fatal(err)
	}

	trigger := &model.TriggerEntry{
		ID:     "wrong_key",
		Module: ".",
		Type:   model.TriggerTypeHTTP,
		Config: model.TriggerConfig{
			Pipeline: "pipeline.with_default",
			HTTP: &model.HTTPConfig{
				Pipeline: "pipeline.with_default",
				Args:     map[string]string{"input1": "self.request_body"},
			},
		},
	}

	err := s.ValidateTriggerEntry(trigger)
	if err == nil {
		t.Fatal("expected validation error for unknown arg key")
	}
	if !strings.Contains(err.Error(), "unknown trigger arg keys") || !strings.Contains(err.Error(), "input1") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateHTTPTrigger_ValidArgs(t *testing.T) {
	dir := setupTestDir(t)
	writeFlowsConfig(t, dir)

	s := NewService()

	flowJSON := `{
		"id": "valid_flow",
		"name": "Valid",
		"steps": [
			{
				"id": "step_input_1",
				"type": "input",
				"label": "Input",
				"config": {
					"params": [{"name": "greeting", "type": "string"}]
				}
			},
			{
				"id": "step_message_1",
				"type": "message",
				"label": "msg",
				"config": {"notifier": "default", "text": "hi"},
				"dependsOn": ["step_input_1"]
			}
		],
		"edges": []
	}`
	if err := writeTestFlow(t, dir, "valid_flow", flowJSON); err != nil {
		t.Fatal(err)
	}

	trigger := &model.TriggerEntry{
		ID:     "ok",
		Module: ".",
		Type:   model.TriggerTypeHTTP,
		Config: model.TriggerConfig{
			Pipeline: "pipeline.valid_flow",
			HTTP: &model.HTTPConfig{
				Pipeline: "pipeline.valid_flow",
				Args:     map[string]string{"greeting": "self.request_body"},
			},
		},
	}

	if err := s.ValidateTriggerEntry(trigger); err != nil {
		t.Fatalf("expected valid trigger, got: %v", err)
	}
}

func writeFlowsConfig(t *testing.T, dir string) {
	t.Helper()
	origConfig := os.Getenv("BENCH_CONFIG")
	os.Setenv("BENCH_CONFIG", filepath.Join(dir, "config.yaml"))
	t.Cleanup(func() { os.Setenv("BENCH_CONFIG", origConfig) })

	configContent := "flows:\n  path: " + dir + "\n"
	configPath := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("write config: %v", err)
	}
}

func writeTestFlow(t *testing.T, dir, id, jsonContent string) error {
	t.Helper()
	fpContent := `pipeline "` + id + `" {
  title = "Test"
  step "message" "msg" {
    notifier = notifier.default
    text     = "test"
  }
}
`
	if err := os.WriteFile(filepath.Join(dir, id+".fp"), []byte(fpContent), 0644); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, id+".json"), []byte(jsonContent), 0644)
}
