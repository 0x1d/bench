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

func TestGenerate_PipelineStepAutoPassesNestedConnectionParams(t *testing.T) {
	tmpDir := t.TempDir()
	flowsDir := filepath.Join(tmpDir, "flows")
	if err := os.MkdirAll(flowsDir, 0755); err != nil {
		t.Fatalf("mkdir flows dir: %v", err)
	}

	child := model.Flow{
		ID:   "child",
		Name: "Child",
		Steps: []model.FlowStep{
			{
				ID:    "q1",
				Type:  "query",
				Label: "Query",
				Config: map[string]any{
					"databaseId": "local",
					"sql":        "select 1",
				},
			},
		},
	}
	childData, err := json.MarshalIndent(child, "", "  ")
	if err != nil {
		t.Fatalf("marshal child flow: %v", err)
	}
	if err := os.WriteFile(filepath.Join(flowsDir, "child.json"), childData, 0644); err != nil {
		t.Fatalf("write child flow fixture: %v", err)
	}

	cfgPath := filepath.Join(tmpDir, "config.yaml")
	cfg := "resources:\n  filesystem: []\n  databases: []\n  rest: []\nflows:\n  path: " + flowsDir + "\n"
	if err := os.WriteFile(cfgPath, []byte(cfg), 0644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	t.Setenv("BENCH_CONFIG", cfgPath)

	parent := &model.Flow{
		ID:   "parent",
		Name: "Parent",
		Steps: []model.FlowStep{
			{
				ID:    "p1",
				Type:  "pipeline",
				Label: "Call child",
				Config: map[string]any{
					"pipelineRef": "child",
					"args":        map[string]any{},
				},
			},
		},
	}

	got, err := Generate(parent, "local")
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	gotS := string(got)
	if err := ValidateHCL(got, "parent.fp"); err != nil {
		t.Fatalf("generated invalid HCL: %v\n%s", err, gotS)
	}
	if !strings.Contains(gotS, `param "conn_local"`) {
		t.Fatalf("expected parent flow to include conn_local param, got:\n%s", gotS)
	}
	if !strings.Contains(gotS, `"conn_local" = param.conn_local`) {
		t.Fatalf("expected pipeline step args to include conn_local pass-through, got:\n%s", gotS)
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

func TestGenerate_HTTPBasicAuth_ProducesValidHCL(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.yaml")
	configYAML := `resources:
  filesystem: []
  databases: []
  rest:
    - id: upstream
      label: Upstream API
      baseUrl: https://api.example.com
      auth:
        type: basic
        username: alice
        password: s3cr3t
flows:
  path: flows
`
	if err := os.WriteFile(configPath, []byte(configYAML), 0644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	t.Setenv("BENCH_CONFIG", configPath)

	flow := &model.Flow{
		ID:   "basic_auth_flow",
		Name: "Basic Auth Flow",
		Steps: []model.FlowStep{
			{
				ID:    "http1",
				Type:  "http",
				Label: "call api",
				Config: map[string]any{
					"restId": "upstream",
					"method": "GET",
					"path":   "/health",
				},
			},
		},
	}

	got, err := Generate(flow, "")
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if err := ValidateHCL(got, "basic_auth_flow.fp"); err != nil {
		t.Fatalf("generated invalid HCL for basic auth: %v\n%s", err, string(got))
	}
	if !strings.Contains(string(got), "Basic YWxpY2U6czNjcjN0") {
		t.Fatalf("expected encoded basic auth header in output, got:\n%s", string(got))
	}
}

func TestGenerate_PreservesStringInterpolationTemplates(t *testing.T) {
	flow := &model.Flow{
		ID:   "template_preserve",
		Name: "Template Preserve",
		Steps: []model.FlowStep{
			{
				ID:    "input1",
				Type:  "input",
				Label: "inputs",
				Config: map[string]any{
					"params": []any{
						map[string]any{"name": "name", "type": "string"},
						map[string]any{"name": "id", "type": "string"},
					},
				},
			},
			{
				ID:    "m1",
				Type:  "message",
				Label: "msg",
				Config: map[string]any{
					"text": "hello ${each.value}",
					"commonAttributes": map[string]any{
						"for_each": "[param.name]",
						"throw": map[string]any{
							"enabled": true,
							"message": "failed for ${each.value}",
						},
					},
				},
			},
			{
				ID:    "q1",
				Type:  "query",
				Label: "query",
				Config: map[string]any{
					"databaseId": "local",
					"sql":        "select '${param.name}' as name",
					"args":       []any{"${param.id}"},
				},
			},
			{
				ID:    "h1",
				Type:  "http",
				Label: "http",
				Config: map[string]any{
					"path": "/items/${param.id}",
					"body": `{"id":"${param.id}"}`,
				},
			},
			{
				ID:    "c1",
				Type:  "container",
				Label: "container",
				Config: map[string]any{
					"cmd": []any{"echo ${param.name}"},
					"env": map[string]any{
						"GREETING": "hi ${param.name}",
					},
				},
			},
		},
	}

	got, err := Generate(flow, "local")
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	gotS := string(got)
	if err := ValidateHCL(got, "template_preserve.fp"); err != nil {
		t.Fatalf("generated invalid HCL: %v\n%s", err, gotS)
	}

	// Ensure template interpolations are preserved and not escaped as literals.
	wantInterpolations := []string{
		"${each.value}",
		"${param.name}",
		"${param.id}",
	}
	for _, want := range wantInterpolations {
		if !strings.Contains(gotS, want) {
			t.Fatalf("expected generated HCL to contain %q, got:\n%s", want, gotS)
		}
		if strings.Contains(gotS, "$$"+want[1:]) {
			t.Fatalf("expected generated HCL not to contain escaped interpolation %q, got:\n%s", "$$"+want[1:], gotS)
		}
	}

	if strings.Contains(gotS, `type = "string"`) {
		t.Fatalf("expected param type spec to be unquoted, got:\n%s", gotS)
	}
	if !strings.Contains(gotS, `type = string`) {
		t.Fatalf("expected param type spec to be emitted as type expression, got:\n%s", gotS)
	}
}
