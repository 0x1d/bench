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
	"github.com/0x1d/bench/api/internal/service/flow/hclgen"
)

var flowSvc = flow.NewService()

func defaultDatabaseIDForFlowRun() string {
	dbs, err := config.DatabasesWithError()
	if err != nil || len(dbs) == 0 {
		return ""
	}
	for _, db := range dbs {
		if db.Default {
			return db.ID
		}
	}
	return dbs[0].ID
}

func collectRequiredConnectionParamIDs(module string, f *model.Flow, defaultDBID string, visited map[string]bool) map[string]bool {
	required := make(map[string]bool)
	if f == nil {
		return required
	}
	flowKey := module + ":" + f.ID
	if visited[flowKey] {
		return required
	}
	visited[flowKey] = true

	for _, step := range f.Steps {
		if strings.EqualFold(step.Type, "query") {
			dbID, _ := step.Config["databaseId"].(string)
			dbID = strings.TrimSpace(dbID)
			if dbID == "" {
				dbID = defaultDBID
			}
			if dbID != "" {
				required[dbID] = true
			}
			continue
		}
		if !strings.EqualFold(step.Type, "pipeline") {
			continue
		}
		ref, _ := step.Config["pipelineRef"].(string)
		ref = strings.TrimSpace(ref)
		if ref == "" {
			continue
		}
		child, err := flowSvc.GetInModule(module, ref)
		if err != nil && module != "." {
			child, err = flowSvc.GetInModule(".", ref)
		}
		if err != nil {
			continue
		}
		for dbID := range collectRequiredConnectionParamIDs(module, child, defaultDBID, visited) {
			required[dbID] = true
		}
	}
	return required
}

// HandleFlowHCLSchema returns the HCL schema for flow expression autocomplete.
// Schema aligns with hclgen step types and attributes.
func HandleFlowHCLSchema(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(struct {
		StepTypes     []string            `json:"stepTypes"`
		StepAttributes map[string][]string `json:"stepAttributes"`
	}{
		StepTypes:     hclgen.StepTypes(),
		StepAttributes: hclgen.StepAttributes(),
	})
}

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
// Query param recursive=true returns a tree structure.
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
	recursive := r.URL.Query().Get("recursive") == "true"
	if recursive {
		tree, err := flowSvc.ListTree(subpath)
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
			Entries []flow.WorkspaceTreeEntry `json:"entries"`
		}{Entries: tree})
		return
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

// HandleFlowMove moves a flow from one module to another.
func HandleFlowMove(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		http.Error(w, "flow id required", http.StatusBadRequest)
		return
	}
	var body struct {
		FromModule string `json:"fromModule"`
		ToModule   string `json:"toModule"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}
	fromModule := strings.TrimSpace(body.FromModule)
	toModule := strings.TrimSpace(body.ToModule)
	if fromModule == "" {
		fromModule = "."
	}
	if toModule == "" {
		toModule = "."
	}
	if err := flowSvc.MoveFlow(fromModule, toModule, id); err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
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

	// Build the set of params this pipeline actually defines (Flowpipe rejects unknown params).
	allowedParams := make(map[string]bool)
	requiredConnIDs := collectRequiredConnectionParamIDs(module, f, defaultDatabaseIDForFlowRun(), map[string]bool{})
	for _, step := range f.Steps {
		if strings.EqualFold(step.Type, "input") {
			if params, ok := step.Config["params"].([]any); ok {
				for _, p := range params {
					if m, ok := p.(map[string]any); ok {
						if name, ok := m["name"].(string); ok && name != "" {
							allowedParams[name] = true
						}
					}
				}
			}
		}
	}
	for dbID := range requiredConnIDs {
		allowedParams["conn_"+dbID] = true
	}

	// Parse user-provided args from request body
	userArgs := make(map[string]any)
	if r.Body != nil {
		var reqBody struct {
			Args map[string]any `json:"args"`
		}
		if err := json.NewDecoder(r.Body).Decode(&reqBody); err == nil && reqBody.Args != nil {
			for k, v := range reqBody.Args {
				if allowedParams[k] {
					userArgs[k] = v
				}
			}
		}
	}

	// Add connection args for required DB params (conn_X = connection name)
	mergedArgs := make(map[string]any)
	for k, v := range userArgs {
		mergedArgs[k] = v
	}
	for dbID := range requiredConnIDs {
		key := "conn_" + dbID
		if _, provided := mergedArgs[key]; !provided {
			mergedArgs[key] = dbID
		}
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

	// Flowpipe may panic on /api/v0/process (e.g. nil pointer in LoadProcessDB).
	// Return a user-friendly error instead of passing through the raw 5xx body.
	if resp.StatusCode >= 500 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":"Flowpipe server error: unable to list processes"}`))
		return
	}

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
