package handler

import "net/http"

// RegisterRoutes attaches all API route handlers to the given mux.
func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/health", HandleHealth)
	// Resource routes: more specific paths first
	mux.HandleFunc("GET /api/resources/roots", HandleResourceRoots)
	mux.HandleFunc("GET /api/resources/download", HandleResourceDownload)
	mux.HandleFunc("POST /api/resources", HandleResourcePost)
	mux.HandleFunc("PATCH /api/resources", HandleResourcePatch)
	mux.HandleFunc("DELETE /api/resources", HandleResourceDelete)
	mux.HandleFunc("GET /api/resources", HandleResourceList)
}
