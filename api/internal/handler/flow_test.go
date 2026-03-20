package handler

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/0x1d/bench/api/internal/model"
)

func writeFlowHandlerTestConfig(t *testing.T, flowsDir string) {
	t.Helper()
	cfgPath := filepath.Join(t.TempDir(), "config.yaml")
	cfg := fmt.Sprintf("resources:\n  filesystem: []\n  databases: []\n  rest: []\nflows:\n  path: %s\n", flowsDir)
	if err := os.WriteFile(cfgPath, []byte(cfg), 0644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	t.Setenv("BENCH_CONFIG", cfgPath)
}

func TestCollectRequiredConnectionParamIDs_IncludesDefaultDBForQuerySteps(t *testing.T) {
	writeFlowHandlerTestConfig(t, t.TempDir())

	flow := &model.Flow{
		ID:   "root",
		Name: "Root",
		Steps: []model.FlowStep{
			{
				ID:    "q1",
				Type:  "query",
				Label: "query",
				Config: map[string]any{
					"sql": "select 1",
				},
			},
		},
	}

	required := collectRequiredConnectionParamIDs(".", flow, "local", map[string]bool{})
	if !required["local"] {
		t.Fatalf("expected required conn param to include default DB id, got: %#v", required)
	}
}

func TestCollectRequiredConnectionParamIDs_NestedPipelineUsesDefaultDB(t *testing.T) {
	flowsDir := t.TempDir()
	writeFlowHandlerTestConfig(t, flowsDir)

	child := model.Flow{
		ID:   "child",
		Name: "Child",
		Steps: []model.FlowStep{
			{
				ID:    "q1",
				Type:  "query",
				Label: "query",
				Config: map[string]any{
					"sql": "select 1",
				},
			},
		},
	}
	childData, err := json.MarshalIndent(child, "", "  ")
	if err != nil {
		t.Fatalf("marshal child: %v", err)
	}
	if err := os.WriteFile(filepath.Join(flowsDir, "child.json"), childData, 0644); err != nil {
		t.Fatalf("write child flow: %v", err)
	}

	parent := &model.Flow{
		ID:   "parent",
		Name: "Parent",
		Steps: []model.FlowStep{
			{
				ID:    "p1",
				Type:  "pipeline",
				Label: "call child",
				Config: map[string]any{
					"pipelineRef": "child",
				},
			},
		},
	}

	required := collectRequiredConnectionParamIDs(".", parent, "local", map[string]bool{})
	if !required["local"] {
		t.Fatalf("expected nested pipeline to require default DB conn param, got: %#v", required)
	}
}
