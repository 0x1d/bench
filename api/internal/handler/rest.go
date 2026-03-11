package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/0x1d/bench/api/internal/model"
	"github.com/0x1d/bench/api/internal/service/rest"
)

var restSvc = rest.NewService()

// HandleRestList returns the list of configured REST resources.
func HandleRestList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	resources := restSvc.List()
	resp := struct {
		Resources []model.RestResource `json:"resources"`
	}{
		Resources: resources,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

// HandleRestSpec returns the OpenAPI spec for the given REST resource.
func HandleRestSpec(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		http.Error(w, "rest resource id required", http.StatusBadRequest)
		return
	}

	spec, err := restSvc.Spec(id)
	if err != nil {
		switch {
		case err == rest.ErrRestNotFound:
			http.Error(w, "rest resource not found", http.StatusNotFound)
		case err == rest.ErrSpecNotFound:
			http.Error(w, "no OpenAPI spec configured", http.StatusNotFound)
		case err == rest.ErrPathTraversal:
			http.Error(w, "invalid path", http.StatusBadRequest)
		default:
			http.Error(w, fmt.Sprintf("spec failed: %v", err), http.StatusInternalServerError)
		}
		return
	}

	// Detect content type from content (JSON vs YAML)
	ct := "application/json"
	if len(spec) > 0 {
		trimmed := strings.TrimSpace(string(spec))
		if !strings.HasPrefix(trimmed, "{") && !strings.HasPrefix(trimmed, "[") {
			ct = "application/x-yaml"
		}
	}
	w.Header().Set("Content-Type", ct)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(spec)
}

// ProxyRequest is the JSON body for POST /api/rest/{id}/proxy.
type ProxyRequest struct {
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    string            `json:"body,omitempty"`
}

// HandleRestProxy forwards a request to the target REST API.
func HandleRestProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		http.Error(w, "rest resource id required", http.StatusBadRequest)
		return
	}

	var req ProxyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = http.MethodGet
	}
	path := req.Path
	if path == "" {
		path = "/"
	}

	// Build headers from map
	headers := make(http.Header)
	for k, v := range req.Headers {
		headers.Set(k, v)
	}

	var body io.Reader
	if len(req.Body) > 0 {
		body = strings.NewReader(string(req.Body))
		// Default to application/json when body is present and Content-Type not set (honors OpenAPI media type)
		if headers.Get("Content-Type") == "" {
			headers.Set("Content-Type", "application/json")
		}
	}

	resp, err := restSvc.ProxyRequest(id, method, path, headers, body)
	if err != nil {
		switch {
		case err == rest.ErrRestNotFound:
			http.Error(w, "rest resource not found", http.StatusNotFound)
		case err == rest.ErrInvalidPath:
			http.Error(w, "invalid path", http.StatusBadRequest)
		default:
			if strings.Contains(err.Error(), "URL blocked") {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			http.Error(w, fmt.Sprintf("proxy failed: %v", err), http.StatusBadGateway)
		}
		return
	}
	defer resp.Body.Close()

	// Copy response headers (exclude hop-by-hop)
	for k, v := range resp.Header {
		kl := strings.ToLower(k)
		if kl == "transfer-encoding" || kl == "connection" || kl == "keep-alive" {
			continue
		}
		for _, vv := range v {
			w.Header().Add(k, vv)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}
