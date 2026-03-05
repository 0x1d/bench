package handler

import (
	"encoding/json"
	"net/http"

	"github.com/0x1d/bench/api/internal/config"
	"github.com/0x1d/bench/api/internal/db"
	"github.com/0x1d/bench/api/internal/service/flow"
)

// StatusResponse is the response for GET /api/status.
type StatusResponse struct {
	Filesystem struct {
		Configured bool                `json:"configured"`
		Paths      []config.RootStatus `json:"paths"`
	} `json:"filesystem"`
	Database struct {
		Configured bool                 `json:"configured"`
		DefaultID  string               `json:"defaultId,omitempty"`
		Databases  []db.ConnectionState `json:"databases"`
	} `json:"database"`
	REST struct {
		Configured bool `json:"configured"`
		Count      int  `json:"count"`
	} `json:"rest"`
	Flows struct {
		Configured      bool `json:"configured"`
		Count           int  `json:"count"`
		FlowpipeHealthy bool `json:"flowpipeHealthy"`
	} `json:"flows"`
}

func countFlowsInTree(entries []flow.WorkspaceTreeEntry) int {
	n := 0
	for _, e := range entries {
		if e.Type == "flow" {
			n++
		}
		n += countFlowsInTree(e.Children)
	}
	return n
}

// HandleStatus returns status information including filesystem, database, REST, and flows configuration.
func HandleStatus(w http.ResponseWriter, r *http.Request) {
	paths := config.RootsStatus()
	restEntries := config.RestResources()

	resp := StatusResponse{}
	resp.Filesystem.Configured = len(paths) > 0
	resp.Filesystem.Paths = paths
	resp.Database.Configured = db.Configured()
	resp.Database.DefaultID = db.DefaultID()
	resp.Database.Databases = db.States()
	resp.REST.Configured = len(restEntries) > 0
	resp.REST.Count = len(restEntries)

	resp.Flows.Configured = config.FlowsConfigured()
	if config.FlowsPath() != "" {
		if tree, err := flowSvc.ListTree("."); err == nil {
			resp.Flows.Count = countFlowsInTree(tree)
		}
	}
	flowpipeURL := config.FlowpipeURLForWorkspace("default")
	if req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, flowpipeURL+"/api/v0/process", nil); err == nil {
		client := &http.Client{}
		if fpResp, err := client.Do(req); err == nil {
			fpResp.Body.Close()
			// Flowpipe /api/v0/process may return 5xx when it panics, but the server is up.
			// Treat any HTTP response as healthy (server reachable).
			resp.Flows.FlowpipeHealthy = true
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}
