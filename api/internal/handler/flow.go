package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/0x1d/bench/api/internal/config"
	"github.com/0x1d/bench/api/internal/model"
	"github.com/0x1d/bench/api/internal/service/flow"
)

var flowSvc = flow.NewService()

// HandleFlowList returns all flows.
func HandleFlowList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	flows, err := flowSvc.List()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(struct {
		Flows []model.Flow `json:"flows"`
	}{Flows: flows})
}

// HandleFlowGet returns a single flow.
func HandleFlowGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		http.Error(w, "flow id required", http.StatusBadRequest)
		return
	}
	f, err := flowSvc.Get(id)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(f)
}

// HandleFlowCreate creates a new flow.
func HandleFlowCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var f model.Flow
	if err := json.NewDecoder(r.Body).Decode(&f); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := flowSvc.Save(&f); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(f)
}

// HandleFlowUpdate updates an existing flow.
func HandleFlowUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		http.Error(w, "flow id required", http.StatusBadRequest)
		return
	}
	var f model.Flow
	if err := json.NewDecoder(r.Body).Decode(&f); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}
	f.ID = id
	if err := flowSvc.Save(&f); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(f)
}

// HandleFlowDelete deletes a flow.
func HandleFlowDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		http.Error(w, "flow id required", http.StatusBadRequest)
		return
	}
	if err := flowSvc.Delete(id); err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// HandleFlowRun executes a flow on the Flowpipe server.
func HandleFlowRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		http.Error(w, "flow id required", http.StatusBadRequest)
		return
	}
	f, err := flowSvc.Get(id)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	flowpipeURL := strings.TrimSuffix(config.FlowpipeURL(), "/")
	url := flowpipeURL + "/api/v0/pipeline/" + f.ID + "/command"

	// Collect unique database connections used in query steps
	connArgs := make(map[string]any)
	for _, step := range f.Steps {
		if strings.EqualFold(step.Type, "query") {
			dbID, _ := step.Config["databaseId"].(string)
			if dbID == "" {
				// We don't have access to s.defaultDatabaseID() here easily without flowSvc exposure,
				// but flowSvc.Save ensures steps have databaseId or use defaults.
				// However, the safest is to look for what generateHCL would have used.
				// We'll skip empty dbID for now, or use a placeholder if needed.
			}
			if dbID != "" {
				connArgs["conn_"+dbID] = dbID
			}
		}
	}

	// Parse user-provided args from request body
	userArgs := make(map[string]any)
	if r.Body != nil {
		var reqBody struct {
			Args map[string]any `json:"args"`
		}
		if err := json.NewDecoder(r.Body).Decode(&reqBody); err == nil && reqBody.Args != nil {
			userArgs = reqBody.Args
		}
	}

	// Merge: user args + connection args (connection args take precedence for conn_ prefixed keys)
	mergedArgs := make(map[string]any)
	for k, v := range userArgs {
		mergedArgs[k] = v
	}
	for k, v := range connArgs {
		mergedArgs[k] = v
	}

	body := map[string]any{
		"command": "run",
		"args":    mergedArgs,
	}
	bodyBytes, _ := json.Marshal(body)

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "flowpipe request failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// HandleFlowProcesses lists recent Flowpipe processes, optionally filtered by pipeline.
func HandleFlowProcesses(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	flowpipeURL := strings.TrimSuffix(config.FlowpipeURL(), "/")
	url := flowpipeURL + "/api/v0/process"

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, url, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "flowpipe request failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// HandleFlowExecution returns detailed execution info for a specific process.
func HandleFlowExecution(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	execID := strings.TrimSpace(r.PathValue("execId"))
	if execID == "" {
		http.Error(w, "execution id required", http.StatusBadRequest)
		return
	}

	flowpipeURL := strings.TrimSuffix(config.FlowpipeURL(), "/")
	url := flowpipeURL + "/api/v0/process/" + execID + "/execution"

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, url, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "flowpipe request failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}
