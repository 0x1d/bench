package handler

import (
	"encoding/json"
	"net/http"

	"github.com/0x1d/bench/api/internal/config"
)

// StatusResponse is the response for GET /api/status.
type StatusResponse struct {
	Filesystem struct {
		Configured bool                `json:"configured"`
		Paths      []config.RootStatus `json:"paths"`
	} `json:"filesystem"`
}

// HandleStatus returns status information including filesystem configuration.
func HandleStatus(w http.ResponseWriter, r *http.Request) {
	paths := config.RootsStatus()
	resp := StatusResponse{}
	resp.Filesystem.Configured = len(paths) > 0
	resp.Filesystem.Paths = paths

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}
