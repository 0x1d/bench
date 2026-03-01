package handler

import (
	"encoding/json"
	"net/http"

	"github.com/0x1d/bench/api/internal/config"
	"github.com/0x1d/bench/api/internal/db"
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
}

// HandleStatus returns status information including filesystem and database configuration.
func HandleStatus(w http.ResponseWriter, r *http.Request) {
	paths := config.RootsStatus()
	resp := StatusResponse{}
	resp.Filesystem.Configured = len(paths) > 0
	resp.Filesystem.Paths = paths
	resp.Database.Configured = db.Configured()
	resp.Database.DefaultID = db.DefaultID()
	resp.Database.Databases = db.States()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}
