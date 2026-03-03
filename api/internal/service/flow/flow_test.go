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
