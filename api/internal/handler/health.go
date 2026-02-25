package handler

import (
	"encoding/json"
	"net/http"
)

// HealthResponse represents the health check response payload.
type HealthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

// HandleHealth returns the API health status.
func HandleHealth(w http.ResponseWriter, r *http.Request) {
	resp := HealthResponse{
		Status:  "ok",
		Version: "0.1.0",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}
