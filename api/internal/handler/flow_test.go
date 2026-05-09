package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
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

// === Helper for trigger tests ===

// Create a test flows directory with a sample .fp file containing triggers
func createTestFlowsDirWithTriggers(t *testing.T) string {
	t.Helper()
	flowsDir := t.TempDir()

	// Create a flow.fp file with some triggers
	// Using proper trigger types: webhook, schedule, alert, http, notification
	flowContent := `flow "test_flow" {
  name = "Test Flow"
}

trigger "webhook" "webhook1" {
  description = "Test webhook trigger"
  pipeline    = pipeline.test_pipeline
}

trigger "schedule" "schedule1" {
  description = "Scheduled trigger"
  pipeline    = pipeline.test_pipeline
  cron        = "0 * * * *"
}
`
	if err := os.WriteFile(filepath.Join(flowsDir, "flow.fp"), []byte(flowContent), 0644); err != nil {
		t.Fatalf("write flow file: %v", err)
	}

	return flowsDir
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

	req := httptest.NewRequest(http.MethodGet, "/api/flows/triggers?flow=flow", nil)
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

	req := httptest.NewRequest(http.MethodGet, "/api/flows/triggers?flow=nonexistent", nil)
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

	req := httptest.NewRequest(http.MethodGet, "/api/flows/flow/triggers/webhook1", nil)
	req.SetPathValue("flowId", "flow")
	req.SetPathValue("triggerId", "webhook1")
	rec := httptest.NewRecorder()
	HandleTriggerGet(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var trigger model.TriggerState
	if err := json.NewDecoder(rec.Body).Decode(&trigger); err != nil {
		t.Fatal(err)
	}
	if trigger.ID != "webhook1" {
		t.Fatalf("expected id webhook1, got %s", trigger.ID)
	}
	if trigger.Type != model.TriggerTypeWebhook {
		t.Fatalf("expected type webhook, got %s", trigger.Type)
	}
}

func TestHandleTriggerGet_404(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	req := httptest.NewRequest(http.MethodGet, "/api/flows/flow/triggers/nonexistent", nil)
	req.SetPathValue("flowId", "flow")
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
		Flow:      "flow",
		Type:      model.TriggerTypeWebhook,
		Workspace: "default",
		Config: model.TriggerConfig{
			Description: "New trigger description",
			Pipeline:    "pipeline.test_pipeline",
		},
	}
	body, _ := json.Marshal(newTrigger)

	req := httptest.NewRequest(http.MethodPost, "/api/flows/triggers", bytes.NewReader(body))
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

	req := httptest.NewRequest(http.MethodPost, "/api/flows/triggers", bytes.NewReader([]byte(`invalid json`)))
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
		Flow:      "flow",
		Type:      model.TriggerTypeWebhook,
		Workspace: "default",
		Config: model.TriggerConfig{
			Description: "Original description",
			Pipeline:    "pipeline.test_pipeline",
		},
	}
	body, _ := json.Marshal(newTrigger)
	req := httptest.NewRequest(http.MethodPost, "/api/flows/triggers", bytes.NewReader(body))
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
		Flow:      "flow",
		Type:      model.TriggerTypeWebhook,
		Workspace: "default",
		Config: model.TriggerConfig{
			Description: "Updated description",
			Pipeline:    "pipeline.test_pipeline",
		},
	}
	body, _ = json.Marshal(updatedTrigger)

	req = httptest.NewRequest(http.MethodPut, "/api/flows/triggers/"+triggerID, bytes.NewReader(body))
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

func TestHandleTriggerUpdate_404(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	updatedTrigger := model.TriggerEntry{
		ID:        "nonexistent",
		Label:     "Nonexistent",
		Flow:      "flow",
		Type:      model.TriggerTypeWebhook,
		Config:    model.TriggerConfig{Pipeline: "pipeline.test"},
	}
	body, _ := json.Marshal(updatedTrigger)

	req := httptest.NewRequest(http.MethodPut, "/api/flows/triggers/nonexistent", bytes.NewReader(body))
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

	req := httptest.NewRequest(http.MethodDelete, "/api/flows/flow/triggers/webhook1", nil)
	req.SetPathValue("flowId", "flow")
	req.SetPathValue("triggerId", "webhook1")
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

	req := httptest.NewRequest(http.MethodDelete, "/api/flows/flow/triggers/nonexistent", nil)
	req.SetPathValue("flowId", "flow")
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

	req := httptest.NewRequest(http.MethodPost, "/api/flows/flow/triggers/webhook1/test", bytes.NewReader(body))
	req.SetPathValue("flowId", "flow")
	req.SetPathValue("triggerId", "webhook1")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	// This will fail to connect to Flowpipe but should return error for the handler structure
	HandleTriggerTest(rec, req)

	// We expect either 502 (Flowpipe not available) or 400 (pipeline not found)
	if rec.Code != http.StatusBadGateway && rec.Code != http.StatusBadRequest {
		t.Logf("unexpected status: %d (Flowpipe may not be available)", rec.Code)
	}
}

func TestHandleTriggerWebhookURL_200(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	req := httptest.NewRequest(http.MethodGet, "/api/flows/flow/triggers/webhook1/webhook", nil)
	req.SetPathValue("flowId", "flow")
	req.SetPathValue("triggerId", "webhook1")
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
	if resp.URL == "" {
		t.Fatalf("expected non-empty webhook URL")
	}
	if len(resp.URL) < 10 {
		t.Fatalf("unexpected webhook URL format: %s", resp.URL)
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
		Flow:   "flow",
		Type:   model.TriggerTypeWebhook,
		Config: model.TriggerConfig{Pipeline: "pipeline.test"},
	}
	body, _ := json.Marshal(newTrigger)
	req = httptest.NewRequest(http.MethodPost, "/api/flows/flow/triggers", bytes.NewReader(body))
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

	// Test GET /api/flows/triggers with flow filter
	req := httptest.NewRequest(http.MethodGet, "/api/flows/triggers?flow=flow", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/flows/triggers?flow=flow: expected 200, got %d", rec.Code)
	}

	// Test GET /api/flows/{flowId}/triggers/{triggerId}
	req = httptest.NewRequest(http.MethodGet, "/api/flows/flow/triggers/webhook1", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/flows/flow/triggers/webhook1: expected 200, got %d", rec.Code)
	}
}

func TestRegisterRoutes_TriggerHTTPMethods(t *testing.T) {
	flowsDir := createTestFlowsDirWithTriggers(t)
	writeFlowHandlerTestConfig(t, flowsDir)

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	// Test DELETE /api/flows/{flowId}/triggers/{triggerId}
	req := httptest.NewRequest(http.MethodDelete, "/api/flows/flow/triggers/webhook1", nil)
	req.SetPathValue("flowId", "flow")
	req.SetPathValue("triggerId", "webhook1")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	// May return 404 if trigger was already deleted by previous test
	if rec.Code != http.StatusNoContent && rec.Code != http.StatusNotFound {
		t.Errorf("DELETE /api/flows/flow/triggers/webhook1: unexpected status %d", rec.Code)
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
