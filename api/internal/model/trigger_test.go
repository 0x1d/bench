package model

import (
	"encoding/json"
	"testing"
)

func TestTriggerConfig_MarshalJSON_omitsNestedHTTP(t *testing.T) {
	cfg := TriggerConfig{
		Pipeline: "pipeline.test",
		HTTP: &HTTPConfig{
			Pipeline:      "pipeline.test",
			ExecutionMode: "synchronous",
			Args:          map[string]string{"greeting": "self.request_body"},
		},
	}

	data, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, ok := m["http"]; ok {
		t.Fatal("expected nested http key to be omitted")
	}
	if m["pipeline"] != "pipeline.test" {
		t.Fatalf("expected flat pipeline, got %#v", m["pipeline"])
	}
	if m["executionMode"] != "synchronous" {
		t.Fatalf("expected flat executionMode, got %#v", m["executionMode"])
	}
}
