package handler

import "net/http"

// RegisterRoutes attaches all API route handlers to the given mux.
func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/health", HandleHealth)
	mux.HandleFunc("GET /api/status", HandleStatus)
	mux.HandleFunc("GET /api/config", HandleConfig)
	mux.HandleFunc("GET /api/config/example", HandleConfigExample)
	mux.HandleFunc("POST /api/config/save", HandleConfigSave)
	mux.HandleFunc("POST /api/config", HandleConfigUpload)
	// Resource routes: more specific paths first
	mux.HandleFunc("GET /api/resources/roots", HandleResourceRoots)
	mux.HandleFunc("GET /api/resources/download", HandleResourceDownload)
	mux.HandleFunc("POST /api/resources", HandleResourcePost)
	mux.HandleFunc("PUT /api/resources", HandleResourceMove)
	mux.HandleFunc("PATCH /api/resources", HandleResourcePatch)
	mux.HandleFunc("DELETE /api/resources", HandleResourceDelete)
	mux.HandleFunc("GET /api/resources", HandleResourceList)
	// REST routes: more specific paths first
	mux.HandleFunc("GET /api/rest/{id}/spec", HandleRestSpec)
	mux.HandleFunc("POST /api/rest/{id}/proxy", HandleRestProxy)
	mux.HandleFunc("GET /api/rest", HandleRestList)
	// Database routes: more specific paths first
	mux.HandleFunc("PATCH /api/database/tables/{name}/rows", HandleDatabaseTableUpdateRow)
	mux.HandleFunc("DELETE /api/database/tables/{name}/rows", HandleDatabaseTableDeleteRow)
	mux.HandleFunc("POST /api/database/tables/{name}/rows", HandleDatabaseTableInsert)
	mux.HandleFunc("DELETE /api/database/tables/{name}", HandleDatabaseTableDrop)
	mux.HandleFunc("PATCH /api/database/tables/{name}", HandleDatabaseTableAlter)
	mux.HandleFunc("GET /api/database/schema/{name}", HandleDatabaseTableSchema)
	mux.HandleFunc("GET /api/database/tables/{name}/lookup", HandleDatabaseTableLookup)
	mux.HandleFunc("GET /api/database/tables/{name}", HandleDatabaseTableData)
	mux.HandleFunc("GET /api/database/tables", HandleDatabaseTablesList)
	mux.HandleFunc("POST /api/database/tables", HandleDatabaseTablesCreate)
	mux.HandleFunc("POST /api/database/query", HandleDatabaseQuery)
	// Flow routes
	mux.HandleFunc("GET /api/flows", HandleFlowList)
	mux.HandleFunc("GET /api/flows/{id}", HandleFlowGet)
	mux.HandleFunc("POST /api/flows", HandleFlowCreate)
	mux.HandleFunc("PUT /api/flows/{id}", HandleFlowUpdate)
	mux.HandleFunc("DELETE /api/flows/{id}", HandleFlowDelete)
	mux.HandleFunc("POST /api/flows/{id}/run", HandleFlowRun)
}
