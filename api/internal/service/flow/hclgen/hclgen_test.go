package hclgen

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/0x1d/bench/api/internal/model"
)

func TestGenerate_ValidHCL(t *testing.T) {
	tests := []struct {
		name    string
		flow    *model.Flow
		wantErr bool
	}{
		{
			name: "minimal",
			flow: &model.Flow{
				ID:   "minimal",
				Name: "Minimal",
				Steps: []model.FlowStep{
					{ID: "s1", Type: "sleep", Label: "wait", Config: map[string]any{"duration": "1s"}},
				},
			},
		},
		{
			name: "transform_with_expression",
			flow: &model.Flow{
				ID:   "transform_test",
				Name: "Transform Test",
				Steps: []model.FlowStep{
					{ID: "t1", Type: "transform", Label: "x", Config: map[string]any{"value": "step.http.foo.result"}},
				},
			},
		},
		{
			name: "output_step",
			flow: &model.Flow{
				ID:   "output_test",
				Name: "Output Test",
				Steps: []model.FlowStep{
					{ID: "t1", Type: "transform", Label: "x", Config: map[string]any{"value": "null"}},
					{ID: "o1", Type: "output", Label: "out", Config: map[string]any{"outputs": []any{map[string]any{"name": "result", "value": "step.transform.x.result"}}}},
				},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Generate(tt.flow, "")
			if (err != nil) != tt.wantErr {
				t.Errorf("Generate() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if err != nil {
				return
			}
			if err := ValidateHCL(got, tt.flow.ID+".fp"); err != nil {
				t.Errorf("generated invalid HCL: %v\n%s", err, string(got))
			}
			if !strings.Contains(string(got), "pipeline ") {
				t.Errorf("HCL should contain pipeline block, got:\n%s", got)
			}
		})
	}
}

func TestGenerate_GoldenFixtures(t *testing.T) {
	// Load JSON fixtures from workspace/flows/tests or flows/tests if present
	wd, _ := os.Getwd()
	paths := []string{
		filepath.Join(wd, "..", "..", "..", "..", "..", "workspace", "flows", "tests"),
		filepath.Join(wd, "..", "..", "..", "..", "..", "flows", "tests"),
		filepath.Join(wd, "..", "..", "..", "..", "workspace", "flows", "tests"),
		filepath.Join(wd, "..", "..", "..", "..", "flows", "tests"),
	}
	var fixtures []string
	for _, base := range paths {
		entries, err := os.ReadDir(base)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".json") {
				fixtures = append(fixtures, filepath.Join(base, e.Name()))
			}
		}
		break
	}
	if len(fixtures) == 0 {
		t.Skip("no JSON fixtures found in flows/tests")
	}
	for _, p := range fixtures {
		name := filepath.Base(p)
		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile(p)
			if err != nil {
				t.Fatalf("read fixture: %v", err)
			}
			var flow model.Flow
			if err := json.Unmarshal(data, &flow); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			got, err := Generate(&flow, "local")
			if err != nil {
				t.Fatalf("Generate: %v", err)
			}
			if err := ValidateHCL(got, name); err != nil {
				t.Errorf("generated invalid HCL: %v\n%s", err, string(got))
			}
		})
	}
}
