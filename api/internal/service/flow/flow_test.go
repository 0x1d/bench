package flow

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/0x1d/bench/api/internal/config"
	"github.com/0x1d/bench/api/internal/model"
)

func TestGenerateHCL(t *testing.T) {
	wd, _ := os.Getwd()
	configPath := filepath.Join(wd, "..", "..", "..", "..", "config.yaml")
	if _, err := os.Stat(configPath); err != nil {
		configPath = filepath.Join(wd, "..", "..", "..", "config.yaml")
	}
	os.Setenv("BENCH_CONFIG", configPath)
	defer os.Unsetenv("BENCH_CONFIG")

	flowPath := filepath.Join(wd, "..", "..", "..", "..", "flows", "flow_4bf3afa57a315532.json")
	if _, err := os.Stat(flowPath); err != nil {
		flowPath = filepath.Join(wd, "..", "..", "..", "flows", "flow_4bf3afa57a315532.json")
	}
	data, err := os.ReadFile(flowPath)
	if err != nil {
		t.Skipf("flow json not found: %v", err)
	}
	var flow model.Flow
	if err := json.Unmarshal(data, &flow); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	_ = config.FlowsPath()
	s := NewService()
	hcl, err := s.generateHCL(&flow)
	if err != nil {
		t.Fatalf("generateHCL: %v", err)
	}
	if len(flow.Steps) > 0 && !strings.Contains(hcl, "step") {
		t.Errorf("HCL should contain steps, got:\n%s", hcl)
	}
	t.Logf("HCL:\n%s", hcl)
}

func TestGenerateHCL_OutputStep(t *testing.T) {
	wd, _ := os.Getwd()
	configPath := filepath.Join(wd, "..", "..", "..", "..", "config.yaml")
	if _, err := os.Stat(configPath); err != nil {
		configPath = filepath.Join(wd, "..", "..", "..", "config.yaml")
	}
	os.Setenv("BENCH_CONFIG", configPath)
	defer os.Unsetenv("BENCH_CONFIG")

	flow := &model.Flow{
		ID:   "test_output",
		Name: "Test Output",
		Steps: []model.FlowStep{
			{ID: "step1", Label: "step1", Type: "transform", Config: map[string]any{"value": "input.message"}},
			{ID: "out1", Label: "result", Type: "output", Config: map[string]any{"outputs": []any{map[string]any{"name": "result", "value": "step.transform.step1.result"}}}},
		},
	}
	s := NewService()
	hcl, err := s.generateHCL(flow)
	if err != nil {
		t.Fatalf("generateHCL with output step: %v", err)
	}
	if !strings.Contains(hcl, `output "result"`) {
		t.Errorf("HCL should contain output block, got:\n%s", hcl)
	}
	t.Logf("HCL:\n%s", hcl)
}

func TestGenerateHCL_OutputStepFromJSON(t *testing.T) {
	// Simulates exact JSON the UI sends when saving a flow with an Output step.
	wd, _ := os.Getwd()
	jsonPath := filepath.Join(wd, "..", "..", "..", "..", "flows", "test_http_caller.json")
	if _, err := os.Stat(jsonPath); err != nil {
		jsonPath = filepath.Join(wd, "..", "..", "..", "flows", "test_http_caller.json")
	}
	data, err := os.ReadFile(jsonPath)
	if err != nil {
		t.Skipf("test_http_caller.json not found: %v", err)
	}
	var flow model.Flow
	if err := json.Unmarshal(data, &flow); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	wd2, _ := os.Getwd()
	configPath := filepath.Join(wd2, "..", "..", "..", "..", "config.yaml")
	if _, err := os.Stat(configPath); err != nil {
		configPath = filepath.Join(wd2, "..", "..", "..", "config.yaml")
	}
	os.Setenv("BENCH_CONFIG", configPath)
	defer os.Unsetenv("BENCH_CONFIG")
	s := NewService()
	hcl, err := s.generateHCL(&flow)
	if err != nil {
		t.Fatalf("generateHCL with output step from JSON: %v", err)
	}
	if !strings.Contains(hcl, `output "result"`) {
		t.Errorf("HCL should contain output block, got:\n%s", hcl)
	}
	t.Logf("HCL:\n%s", hcl)
}

func TestGenerateHCL_NoOutputStep(t *testing.T) {
	// Flows without Output steps must NOT get any output block in the .fp file.
	wd, _ := os.Getwd()
	configPath := filepath.Join(wd, "..", "..", "..", "..", "config.yaml")
	if _, err := os.Stat(configPath); err != nil {
		configPath = filepath.Join(wd, "..", "..", "..", "config.yaml")
	}
	os.Setenv("BENCH_CONFIG", configPath)
	defer os.Unsetenv("BENCH_CONFIG")

	flow := &model.Flow{
		ID:   "no_output",
		Name: "No Output",
		Steps: []model.FlowStep{
			{ID: "m1", Label: "msg", Type: "message", Config: map[string]any{"notifier": "default", "text": "Hello"}},
		},
	}
	s := NewService()
	hcl, err := s.generateHCL(flow)
	if err != nil {
		t.Fatalf("generateHCL: %v", err)
	}
	if strings.Contains(hcl, `output "result"`) || strings.Contains(hcl, "output ") {
		t.Errorf("HCL must NOT contain output block when flow has no Output step, got:\n%s", hcl)
	}
	t.Logf("HCL (no output):\n%s", hcl)
}

func TestSyncFromJSON(t *testing.T) {
	wd, _ := os.Getwd()
	configPath := filepath.Join(wd, "..", "..", "..", "..", "config.yaml")
	if _, err := os.Stat(configPath); err != nil {
		configPath = filepath.Join(wd, "..", "..", "..", "config.yaml")
	}
	os.Setenv("BENCH_CONFIG", configPath)
	defer os.Unsetenv("BENCH_CONFIG")

	if config.FlowsPath() == "" {
		t.Skip("flows path not configured")
	}
	s := NewService()
	if err := s.SyncFromJSON(); err != nil {
		t.Fatalf("SyncFromJSON: %v", err)
	}
}
