package handler

import "net/http"

// RegisterRoutes attaches all API route handlers to the given mux.
func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/health", HandleHealth)
}
