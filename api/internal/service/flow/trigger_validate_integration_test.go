package flow

import (
	"strings"
	"testing"

	"github.com/0x1d/bench/api/internal/model"
)

func TestValidateHTTPTrigger_W3bh00kConfig(t *testing.T) {
	dir := setupTestDir(t)
	writeFlowsConfig(t, dir)

	s := NewService()

	flowJSON := `{
		"id": "sometest",
		"name": "Sometest",
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
	if err := writeTestFlow(t, dir, "sometest", flowJSON); err != nil {
		t.Fatal(err)
	}

	trigger := &model.TriggerEntry{
		ID:     "w3bh00k",
		Module: ".",
		Type:   model.TriggerTypeHTTP,
		Config: model.TriggerConfig{
			Pipeline: "pipeline.sometest",
			HTTP: &model.HTTPConfig{
				Pipeline:      "pipeline.sometest",
				ExecutionMode: "synchronous",
				Args:          map[string]string{"conn_local": "local"},
			},
		},
	}
	err := s.ValidateTriggerEntry(trigger)
	if err == nil {
		t.Fatal("expected w3bh00k config to fail validation (missing input1)")
	}
	if !strings.Contains(err.Error(), "input1") {
		t.Fatalf("expected input1 in error, got: %v", err)
	}
}

func TestValidateHTTPTrigger_GagaUnknownArg(t *testing.T) {
	dir := setupTestDir(t)
	writeFlowsConfig(t, dir)

	s := NewService()

	flowJSON := `{
		"id": "stepvariables",
		"name": "Step Variables",
		"steps": [
			{
				"id": "step_input_1",
				"type": "input",
				"label": "Input",
				"config": {
					"params": [{"name": "name1", "type": "string", "default": "Hans"}]
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
	if err := writeTestFlow(t, dir, "stepvariables", flowJSON); err != nil {
		t.Fatal(err)
	}

	trigger := &model.TriggerEntry{
		ID:     "gaga",
		Module: ".",
		Type:   model.TriggerTypeHTTP,
		Config: model.TriggerConfig{
			Pipeline: "pipeline.stepvariables",
			HTTP: &model.HTTPConfig{
				Pipeline:      "pipeline.stepvariables",
				ExecutionMode: "synchronous",
				Args: map[string]string{
					"conn_local": "local",
					"input1":     "self.request_body",
				},
			},
		},
	}
	err := s.ValidateTriggerEntry(trigger)
	if err == nil {
		t.Fatal("expected gaga config to fail validation (unknown input1)")
	}
	if !strings.Contains(err.Error(), "input1") {
		t.Fatalf("expected input1 in error, got: %v", err)
	}
}
