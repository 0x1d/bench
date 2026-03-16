package handler

import (
	"testing"

	"github.com/0x1d/bench/api/internal/model"
)

func TestCollectRequiredConnectionParamIDs_UsesDefaultForQueryWithoutDatabaseID(t *testing.T) {
	f := &model.Flow{
		ID:   "flow1",
		Name: "Flow 1",
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

	got := collectRequiredConnectionParamIDs(".", f, "local", map[string]bool{})
	if !got["local"] {
		t.Fatalf("expected default database id to be required, got: %#v", got)
	}
}

func TestCollectRequiredConnectionParamIDs_PrefersExplicitDatabaseID(t *testing.T) {
	f := &model.Flow{
		ID:   "flow2",
		Name: "Flow 2",
		Steps: []model.FlowStep{
			{
				ID:    "q1",
				Type:  "query",
				Label: "query",
				Config: map[string]any{
					"databaseId": "analytics",
					"sql":        "select 1",
				},
			},
		},
	}

	got := collectRequiredConnectionParamIDs(".", f, "local", map[string]bool{})
	if !got["analytics"] {
		t.Fatalf("expected explicit database id to be required, got: %#v", got)
	}
	if got["local"] {
		t.Fatalf("expected default database id to be ignored when explicit id exists, got: %#v", got)
	}
}
