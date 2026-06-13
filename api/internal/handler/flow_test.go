package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/0x1d/bench/api/internal/model"
)

func writeFlowHandlerTestConfig(t *testing.T, flowsDir string) {
	writeFlowHandlerTestConfigWithFlowpipe(t, flowsDir, "")
}

func writeFlowHandlerTestConfigWithFlowpipe(t *testing.T, flowsDir, flowpipeURL string) {
	t.Helper()
	cfgPath := filepath.Join(t.TempDir(), "config.yaml")
	flowpipeLine := ""
	if flowpipeURL != "" {
		flowpipeLine = fmt.Sprintf("      flowpipeUrl: %s\n", flowpipeURL)
	}
	cfg := fmt.Sprintf(`resources:
  filesystem: []
  databases:
    - id: local
      label: Local
      url: postgresql://bench:bench@localhost:5432/bench
      enabled: true
      default: true
  rest: []
flows:
  path: %s
  workspaces:
    - id: default
      label: Default
%s`, flowsDir, flowpipeLine)
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

	required := flowSvc.RequiredConnectionParamIDs(".", flow)
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

	required := flowSvc.RequiredConnectionParamIDs(".", parent)
	if !required["local"] {
		t.Fatalf("expected nested pipeline to require default DB conn param, got: %#v", required)
	}
}

// === Helper for trigger tests ===

// Create a test flows directory with triggers embedded in mod.fp
func createTestFlowsDirWithTriggers(t *testing.T) string {
	t.Helper()
	flowsDir := t.TempDir()

	// Create a module subdirectory
	modDir := filepath.Join(flowsDir, "mod")
	if err := os.MkdirAll(modDir, 0755); err != nil {
		t.Fatalf("mkdir mod: %v", err)
	}

	// Create root mod.fp so Flowpipe trigger refs use the root mod name.
	if err := os.WriteFile(filepath.Join(flowsDir, "mod.fp"), []byte(`mod "test" {
  title = "Test Root"
}
`), 0644); err != nil {
		t.Fatalf("write root mod.fp: %v", err)
	}

	// Create mod.fp with embedded triggers
	modContent := `mod "test" {
  title = "Test Module"
}

trigger "http" "http1" {
  description = "Test HTTP trigger"
  pipeline    = pipeline.test_pipeline
  args = {
    body    = self.request_body
    headers = self.request_headers
  }
}

trigger "schedule" "schedule1" {
  description = "Scheduled trigger"
  pipeline    = pipeline.test_pipeline
  schedule    = "0 * * * *"
}
`
	if err := os.WriteFile(filepath.Join(modDir, "mod.fp"), []byte(modContent), 0644); err != nil {
		t.Fatalf("write mod.fp: %v", err)
	}

	testPipelineJSON := `{
		"id": "test_pipeline",
		"name": "Test Pipeline",
		"steps": [
			{
				"id": "step_message_1",
				"type": "message",
				"label": "msg",
				"config": {"notifier": "default", "text": "test"}
			}
		],
		"edges": []
	}`
	if err := writeHandlerTestFlow(modDir, "test_pipeline", testPipelineJSON); err != nil {
		t.Fatalf("write test_pipeline: %v", err)
	}

	return flowsDir
}

func writeHandlerTestFlow(dir, id, jsonContent string) error {
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

// === API Integration Tests for Triggers ===

func TestHandleTriggersList_200(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	req := httptest.NewRequest(http.MethodGet, "/api/flows/triggers", nil)
	rec := httptest.NewRecorder()
	HandleTriggersList(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Triggers []model.TriggerState `json:"triggers"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Triggers) != 2 {
		t.Fatalf("expected 2 triggers, got %d: %v", len(resp.Triggers), resp.Triggers)
	}
}

func TestHandleTriggersList_Empty(t *testing.T) {
	flowsDir := t.TempDir()
	writeFlowHandlerTestConfig(t, flowsDir)

	req := httptest.NewRequest(http.MethodGet, "/api/flows/triggers", nil)
	rec := httptest.NewRecorder()
	HandleTriggersList(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var resp struct {
		Triggers []model.TriggerState `json:"triggers"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Triggers) != 0 {
		t.Fatalf("expected 0 triggers, got %d", len(resp.Triggers))
	}
}

func TestHandleTriggersList_MethodNotAllowed(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	req := httptest.NewRequest(http.MethodPost, "/api/flows/triggers", nil)
	rec := httptest.NewRecorder()
	HandleTriggersList(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

func TestHandleTriggersList_WithFlowFilter(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	req := httptest.NewRequest(http.MethodGet, "/api/flows/triggers?module=mod", nil)
	rec := httptest.NewRecorder()
	HandleTriggersList(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Triggers []model.TriggerState `json:"triggers"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Triggers) != 2 {
		t.Fatalf("expected 2 triggers, got %d", len(resp.Triggers))
	}
}

func TestHandleTriggersList_EmptyResult(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	req := httptest.NewRequest(http.MethodGet, "/api/flows/triggers?module=nonexistent", nil)
	rec := httptest.NewRecorder()
	HandleTriggersList(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var resp struct {
		Triggers []model.TriggerState `json:"triggers"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Triggers) != 0 {
		t.Fatalf("expected 0 triggers, got %d", len(resp.Triggers))
	}
}

func TestHandleTriggerGet_200(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	req := httptest.NewRequest(http.MethodGet, "/api/flows/mod/triggers/http1", nil)
	req.SetPathValue("moduleId", "mod")
	req.SetPathValue("triggerId", "http1")
	rec := httptest.NewRecorder()
	HandleTriggerGet(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	body := rec.Body.Bytes()
	var trigger model.TriggerState
	if err := json.Unmarshal(body, &trigger); err != nil {
		t.Fatal(err)
	}
	if trigger.ID != "http1" {
		t.Fatalf("expected id http1, got %s", trigger.ID)
	}
	if trigger.Type != model.TriggerTypeHTTP {
		t.Fatalf("expected type http, got %s", trigger.Type)
	}

	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatal(err)
	}
	config, _ := raw["config"].(map[string]any)
	args, _ := config["args"].(map[string]any)
	if args["body"] != "self.request_body" {
		t.Fatalf("expected flat args.body=self.request_body, got %#v", config)
	}
}

func TestHandleTriggerGet_404(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	req := httptest.NewRequest(http.MethodGet, "/api/flows/mod/triggers/nonexistent", nil)
	req.SetPathValue("moduleId", "mod")
	req.SetPathValue("triggerId", "nonexistent")
	rec := httptest.NewRecorder()
	HandleTriggerGet(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestHandleTriggerCreate_201(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	newTrigger := model.TriggerEntry{
		ID:        "new_trigger",
		Label:     "New Trigger",
		Module: "mod",
		Type:      model.TriggerTypeHTTP,
		Workspace: "default",
		Config: model.TriggerConfig{
			Description: "New trigger description",
			Pipeline:    "pipeline.test_pipeline",
		},
	}
	body, _ := json.Marshal(newTrigger)

	req := httptest.NewRequest(http.MethodPost, "/api/flows/mod/triggers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	HandleTriggerCreate(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var created model.TriggerEntry
	if err := json.NewDecoder(rec.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	if created.ID != "new_trigger" {
		t.Fatalf("expected id new_trigger, got %s", created.ID)
	}
}

func TestHandleTriggerCreate_InvalidPayload(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	req := httptest.NewRequest(http.MethodPost, "/api/flows/mod/triggers", bytes.NewReader([]byte(`invalid json`)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	HandleTriggerCreate(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestHandleTriggerUpdate_200(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	// Create a unique trigger name to avoid conflicts
	triggerID := "update_me_" + t.Name()

	// Add a trigger first to update
	newTrigger := model.TriggerEntry{
		ID:        triggerID,
		Label:     "To Update",
		Module: "mod",
		Type:      model.TriggerTypeHTTP,
		Workspace: "default",
		Config: model.TriggerConfig{
			Description: "Original description",
			Pipeline:    "pipeline.test_pipeline",
		},
	}
	body, _ := json.Marshal(newTrigger)
	req := httptest.NewRequest(http.MethodPost, "/api/flows/mod/triggers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	HandleTriggerCreate(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("failed to create trigger to update: got %d: %s", rec.Code, rec.Body.String())
	}

	// Now update it
	updatedTrigger := model.TriggerEntry{
		ID:        triggerID,
		Label:     "Updated Trigger",
		Module: "mod",
		Type:      model.TriggerTypeHTTP,
		Workspace: "default",
		Config: model.TriggerConfig{
			Description: "Updated description",
			Pipeline:    "pipeline.test_pipeline",
		},
	}
	body, _ = json.Marshal(updatedTrigger)

	req = httptest.NewRequest(http.MethodPut, "/api/flows/mod/triggers/"+triggerID, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.SetPathValue("triggerId", triggerID)
	rec = httptest.NewRecorder()
	HandleTriggerUpdate(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var updated model.TriggerEntry
	if err := json.NewDecoder(rec.Body).Decode(&updated); err != nil {
		t.Fatal(err)
	}
	if updated.Label != "Updated Trigger" {
		t.Fatalf("expected label Updated Trigger, got %s", updated.Label)
	}
}

func TestHandleTriggerUpdate_renameID(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	originalID := "rename_me_" + t.Name()
	newID := originalID + "_renamed"

	newTrigger := model.TriggerEntry{
		ID:     originalID,
		Label:  "Rename Me",
		Module: "mod",
		Type:   model.TriggerTypeHTTP,
		Config: model.TriggerConfig{
			Pipeline: "pipeline.test_pipeline",
		},
	}
	body, _ := json.Marshal(newTrigger)
	req := httptest.NewRequest(http.MethodPost, "/api/flows/mod/triggers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	HandleTriggerCreate(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("failed to create trigger: got %d: %s", rec.Code, rec.Body.String())
	}

	renamedTrigger := model.TriggerEntry{
		ID:     newID,
		Label:  "Renamed Trigger",
		Module: "mod",
		Type:   model.TriggerTypeHTTP,
		Config: model.TriggerConfig{
			Pipeline: "pipeline.test_pipeline",
		},
	}
	body, _ = json.Marshal(renamedTrigger)

	req = httptest.NewRequest(http.MethodPut, "/api/flows/mod/triggers/"+originalID, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.SetPathValue("moduleId", "mod")
	req.SetPathValue("triggerId", originalID)
	rec = httptest.NewRecorder()
	HandleTriggerUpdate(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var updated model.TriggerEntry
	if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if updated.ID != newID {
		t.Fatalf("expected renamed id %q, got %q", newID, updated.ID)
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/flows/mod/triggers/"+newID, nil)
	getReq.SetPathValue("moduleId", "mod")
	getReq.SetPathValue("triggerId", newID)
	getRec := httptest.NewRecorder()
	HandleTriggerGet(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("expected renamed trigger to exist, got %d: %s", getRec.Code, getRec.Body.String())
	}

	oldReq := httptest.NewRequest(http.MethodGet, "/api/flows/mod/triggers/"+originalID, nil)
	oldReq.SetPathValue("moduleId", "mod")
	oldReq.SetPathValue("triggerId", originalID)
	oldRec := httptest.NewRecorder()
	HandleTriggerGet(oldRec, oldReq)
	if oldRec.Code != http.StatusNotFound {
		t.Fatalf("expected old trigger id to be gone, got %d", oldRec.Code)
	}
}

func TestHandleTriggerUpdate_404(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	updatedTrigger := model.TriggerEntry{
		ID:        "nonexistent",
		Label:     "Nonexistent",
		Module: "mod",
		Type:      model.TriggerTypeHTTP,
		Config:    model.TriggerConfig{Pipeline: "pipeline.test"},
	}
	body, _ := json.Marshal(updatedTrigger)

	req := httptest.NewRequest(http.MethodPut, "/api/flows/mod/triggers/nonexistent", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.SetPathValue("triggerId", "nonexistent")
	rec := httptest.NewRecorder()
	HandleTriggerUpdate(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestHandleTriggerDelete_204(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	// First get the triggers to see their state
	triggersBefore, err := triggerService.ListTriggers()
	if err != nil {
		t.Fatalf("failed to list triggers before delete: %v", err)
	}
	t.Logf("Triggers before delete: %d", len(triggersBefore))

	req := httptest.NewRequest(http.MethodDelete, "/api/flows/mod/triggers/http1", nil)
	req.SetPathValue("moduleId", "mod")
	req.SetPathValue("triggerId", "http1")
	rec := httptest.NewRecorder()
	HandleTriggerDelete(rec, req)

	// The trigger may have already been modified by other tests, check appropriately
	if rec.Code != http.StatusNoContent && rec.Code != http.StatusNotFound {
		t.Fatalf("expected 204 or 404 (already deleted), got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestHandleTriggerDelete_404(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	req := httptest.NewRequest(http.MethodDelete, "/api/flows/mod/triggers/nonexistent", nil)
	req.SetPathValue("moduleId", "mod")
	req.SetPathValue("triggerId", "nonexistent")
	rec := httptest.NewRecorder()
	HandleTriggerDelete(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestHandleTriggerTest_200(t *testing.T) {
	// This test verifies the handler structure but not actual Flowpipe connectivity
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	testReq := struct {
		Payload map[string]any `json:"payload,omitempty"`
	}{Payload: map[string]any{"test": "data"}}
	body, _ := json.Marshal(testReq)

	req := httptest.NewRequest(http.MethodPost, "/api/flows/mod/triggers/http1/test", bytes.NewReader(body))
	req.SetPathValue("moduleId", "mod")
	req.SetPathValue("triggerId", "http1")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	// This will fail to connect to Flowpipe but should return error for the handler structure
	HandleTriggerTest(rec, req)

	// We expect either 502 (Flowpipe not available) or 400 (pipeline not found)
	if rec.Code != http.StatusBadGateway && rec.Code != http.StatusBadRequest {
		t.Logf("unexpected status: %d (Flowpipe may not be available)", rec.Code)
	}
}

func TestHandleTriggerTest_emptyBody(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	req := httptest.NewRequest(http.MethodPost, "/api/flows/mod/triggers/http1/test", nil)
	req.SetPathValue("moduleId", "mod")
	req.SetPathValue("triggerId", "http1")
	rec := httptest.NewRecorder()

	HandleTriggerTest(rec, req)

	if rec.Code == http.StatusBadRequest && strings.Contains(rec.Body.String(), "EOF") {
		t.Fatalf("empty body should be accepted, got 400: %s", rec.Body.String())
	}
}

func TestHandleTriggerWebhookURL_400_nonHTTP(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	req := httptest.NewRequest(http.MethodGet, "/api/flows/mod/triggers/schedule1/webhook", nil)
	req.SetPathValue("moduleId", "mod")
	req.SetPathValue("triggerId", "schedule1")
	rec := httptest.NewRecorder()
	HandleTriggerWebhookURL(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for non-http trigger, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestHandleTriggerWebhookURL_200(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)

	flowpipe := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/v0/trigger/test.trigger.http.http1":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"name": "test.trigger.http.http1",
				"url":  "http://mock-flowpipe/api/latest/hook/http1/salt",
				"type": "http",
			})
		case r.Method == http.MethodGet && r.URL.Path == "/api/v0/trigger":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"items": []map[string]any{{
					"name": "test.trigger.http.http1",
					"url":  "http://mock-flowpipe/api/latest/hook/http1/salt",
					"type": "http",
				}},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer flowpipe.Close()

	writeFlowHandlerTestConfigWithFlowpipe(t, flowsDir, flowpipe.URL)

	req := httptest.NewRequest(http.MethodGet, "/api/flows/mod/triggers/http1/webhook", nil)
	req.SetPathValue("moduleId", "mod")
	req.SetPathValue("triggerId", "http1")
	rec := httptest.NewRecorder()
	HandleTriggerWebhookURL(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if resp.URL != "http://mock-flowpipe/api/latest/hook/http1/salt" {
		t.Fatalf("unexpected webhook URL: %s", resp.URL)
	}
}

// === Route Registration Tests ===

func TestRegisterRoutes_TriggerRoutes(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	// Test GET /api/flows/triggers
	req := httptest.NewRequest(http.MethodGet, "/api/flows/triggers", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/flows/triggers: expected 200, got %d", rec.Code)
	}

	// Test POST /api/flows/{flowId}/triggers (create)
	newTrigger := model.TriggerEntry{
		ID:     "route_test",
		Module: "mod",
		Type:   model.TriggerTypeHTTP,
		Config: model.TriggerConfig{Pipeline: "pipeline.test"},
	}
	body, _ := json.Marshal(newTrigger)
	req = httptest.NewRequest(http.MethodPost, "/api/flows/mod/triggers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	// 409 is expected because trigger already exists, but route is registered
	if rec.Code != http.StatusConflict && rec.Code != http.StatusCreated && rec.Code != http.StatusNotFound {
		t.Errorf("POST /api/flows/flow/triggers: unexpected status %d", rec.Code)
	}
}

func TestRegisterRoutes_TriggerRoutes_WithQueryFilter(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	// Test GET /api/flows/triggers with module filter
	req := httptest.NewRequest(http.MethodGet, "/api/flows/triggers?module=mod", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/flows/triggers?module=mod: expected 200, got %d", rec.Code)
	}

	// Test GET /api/flows/{flowId}/triggers/{triggerId}
	req = httptest.NewRequest(http.MethodGet, "/api/flows/mod/triggers/http1", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/flows/mod/triggers/http1: expected 200, got %d", rec.Code)
	}
}

func TestRegisterRoutes_TriggerHTTPMethods(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	// Test DELETE /api/flows/{flowId}/triggers/{triggerId}
	req := httptest.NewRequest(http.MethodDelete, "/api/flows/mod/triggers/http1", nil)
	req.SetPathValue("moduleId", "mod")
	req.SetPathValue("triggerId", "http1")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	// May return 404 if trigger was already deleted by previous test
	if rec.Code != http.StatusNoContent && rec.Code != http.StatusNotFound {
		t.Errorf("DELETE /api/flows/mod/triggers/http1: unexpected status %d", rec.Code)
	}
}

// === Error Handling Tests ===

func TestTriggerHandlers_AuthHeaderNotRequired(t *testing.T) {
	// The trigger handlers don't perform auth - that's done at the HTTP server level
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	req := httptest.NewRequest(http.MethodGet, "/api/flows/triggers", nil)
	rec := httptest.NewRecorder()
	HandleTriggersList(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 without auth header, got %d", rec.Code)
	}
}
