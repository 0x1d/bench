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

// HandleFlowWorkspacesList returns configured flow workspaces.
func HandleFlowWorkspacesList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	workspaces := config.Workspaces()
	if len(workspaces) == 0 && config.FlowsPath() != "" {
		// Fallback: default profile when no workspaces configured
		workspaces = []config.WorkspaceEntry{
			{ID: "default", Label: "Default"},
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(struct {
		Workspaces []config.WorkspaceEntry `json:"workspaces"`
	}{Workspaces: workspaces})
}

// HandleFlowEntries lists modules and flows at the given path (relative to flows/).
func HandleFlowEntries(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if config.FlowsPath() == "" {
		http.Error(w, "flows path not configured", http.StatusNotFound)
		return
	}
	subpath := r.URL.Query().Get("path")
	if subpath == "" {
		subpath = "."
	}
	entries, err := flowSvc.ListEntries(subpath)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(struct {
		Entries []flow.WorkspaceDirEntry `json:"entries"`
	}{Entries: entries})
}

// HandleFlowGetModule returns module metadata from mod.fp.
func HandleFlowGetModule(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if config.FlowsPath() == "" {
		http.Error(w, "flows path not configured", http.StatusNotFound)
		return
	}
	modulePath := strings.TrimSpace(r.URL.Query().Get("path"))
	if modulePath == "" || modulePath == "." {
		http.Error(w, "path required (module path)", http.StatusBadRequest)
		return
	}
	meta, err := flowSvc.GetModule(modulePath)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(meta)
}

// HandleFlowUpdateModule updates module metadata in mod.fp.
func HandleFlowUpdateModule(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if config.FlowsPath() == "" {
		http.Error(w, "flows path not configured", http.StatusNotFound)
		return
	}
	modulePath := strings.TrimSpace(r.URL.Query().Get("path"))
	if modulePath == "" || modulePath == "." {
		http.Error(w, "path required (module path)", http.StatusBadRequest)
		return
	}
	var meta flow.ModuleMeta
	if err := json.NewDecoder(r.Body).Decode(&meta); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := flowSvc.UpdateModule(modulePath, &meta); err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(meta)
}

// HandleFlowCreateModule creates a module subfolder under flows/.
func HandleFlowCreateModule(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if config.FlowsPath() == "" {
		http.Error(w, "flows path not configured", http.StatusNotFound)
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}
	moduleName := strings.TrimSpace(body.Name)
	if moduleName == "" {
		http.Error(w, "module name required", http.StatusBadRequest)
		return
	}
	if err := flowSvc.CreateModule(moduleName); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// HandleFlowList returns all flows. Query param: module (default "." for root).
func HandleFlowList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	module := strings.TrimSpace(r.URL.Query().Get("module"))
	if module == "" {
		module = "."
	}
	flows, err := flowSvc.ListInModule(module)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(struct {
		Flows []model.Flow `json:"flows"`
	}{Flows: flows})
}

// HandleFlowGet returns a single flow. Query param: module (default "." for root).
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
	module := strings.TrimSpace(r.URL.Query().Get("module"))
	if module == "" {
		module = "."
	}
	f, err := flowSvc.GetInModule(module, id)
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

// HandleFlowCreate creates a new flow. Query param: module (default "." for root).
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
	module := strings.TrimSpace(r.URL.Query().Get("module"))
	if module == "" {
		module = "."
	}
	err := flowSvc.SaveInModule(module, &f)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(f)
}

// HandleFlowUpdate updates an existing flow. Query param: module (default "." for root).
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
	module := strings.TrimSpace(r.URL.Query().Get("module"))
	if module == "" {
		module = "."
	}
	err := flowSvc.SaveInModule(module, &f)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(f)
}

// HandleFlowDelete deletes a flow. Query param: module (default "." for root).
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
	module := strings.TrimSpace(r.URL.Query().Get("module"))
	if module == "" {
		module = "."
	}
	err := flowSvc.DeleteInModule(module, id)
	if err != nil {
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
// Query params: module (default "."), workspace (profile for execution).
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
	module := strings.TrimSpace(r.URL.Query().Get("module"))
	if module == "" {
		module = "."
	}
	f, err := flowSvc.GetInModule(module, id)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	workspace := strings.TrimSpace(r.URL.Query().Get("workspace"))
	if workspace == "" {
		workspace = "default"
	}
	flowpipeURL := strings.TrimSuffix(config.FlowpipeURLForWorkspace(workspace), "/")
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
	if workspace != "" {
		req.Header.Set("X-Flowpipe-Workspace", workspace)
	}

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

// HandleFlowProcesses lists recent Flowpipe processes. Query param: workspace (profile).
func HandleFlowProcesses(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	workspace := strings.TrimSpace(r.URL.Query().Get("workspace"))
	if workspace == "" {
		workspace = "default"
	}
	flowpipeURL := strings.TrimSuffix(config.FlowpipeURLForWorkspace(workspace), "/")
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
// Query param: workspace (profile).
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
	workspace := strings.TrimSpace(r.URL.Query().Get("workspace"))
	if workspace == "" {
		workspace = "default"
	}
	flowpipeURL := strings.TrimSuffix(config.FlowpipeURLForWorkspace(workspace), "/")
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
