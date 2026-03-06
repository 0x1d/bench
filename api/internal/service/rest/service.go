package rest

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/0x1d/bench/api/internal/config"
	"github.com/0x1d/bench/api/internal/model"
	restpkg "github.com/0x1d/bench/api/internal/rest"
)

var (
	ErrRestNotFound  = errors.New("REST resource not found")
	ErrInvalidPath   = errors.New("invalid path")
	ErrSpecNotFound  = errors.New("OpenAPI spec not found")
	ErrPathTraversal = errors.New("path traversal not allowed")
)

// Service provides REST resource operations.
type Service struct{}

// NewService creates a new REST service.
func NewService() *Service {
	return &Service{}
}

// List returns configured REST resources.
func (s *Service) List() []model.RestResource {
	entries := config.RestResources()
	out := make([]model.RestResource, 0, len(entries))
	for _, e := range entries {
		out = append(out, model.RestResource{
			ID:          e.ID,
			Label:       e.Label,
			BaseURL:     e.BaseURL,
			OpenAPISpec: e.OpenAPISpec,
		})
	}
	return out
}

// GetEntry returns the REST entry for the given ID.
func (s *Service) GetEntry(id string) (*config.RestEntry, error) {
	entries, err := config.RestResourcesWithError()
	if err != nil {
		return nil, err
	}
	for i := range entries {
		if entries[i].ID == id {
			return &entries[i], nil
		}
	}
	return nil, ErrRestNotFound
}

// Spec returns the OpenAPI spec content for the given REST resource.
func (s *Service) Spec(id string) ([]byte, error) {
	entry, err := s.GetEntry(id)
	if err != nil {
		return nil, err
	}
	if entry.OpenAPISpec == "" {
		return nil, ErrSpecNotFound
	}

	baseDir := config.ConfigDir()
	if baseDir == "" {
		return nil, errors.New("config directory not found")
	}

	// Resolve path relative to config dir; reject path traversal
	cleanSpec := filepath.Clean(entry.OpenAPISpec)
	if cleanSpec == ".." || strings.HasPrefix(cleanSpec, ".."+string(filepath.Separator)) {
		return nil, ErrPathTraversal
	}
	absPath := filepath.Join(baseDir, cleanSpec)

	// Ensure resolved path is under baseDir
	rel, err := filepath.Rel(baseDir, absPath)
	if err != nil {
		return nil, ErrPathTraversal
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return nil, ErrPathTraversal
	}

	return os.ReadFile(absPath)
}

// ProxyRequest forwards a request to the target REST API with configured auth.
func (s *Service) ProxyRequest(id string, method, path string, headers http.Header, body io.Reader) (*http.Response, error) {
	entry, err := s.GetEntry(id)
	if err != nil {
		return nil, err
	}

	if err := restpkg.ValidateBaseURL(entry.BaseURL); err != nil {
		return nil, err
	}

	// Validate path: must be relative, no ..
	path = strings.TrimPrefix(path, "/")
	if path == "" {
		path = "/"
	}
	if strings.Contains(path, "..") || strings.HasPrefix(path, "//") {
		return nil, ErrInvalidPath
	}

	baseURL := strings.TrimSuffix(entry.BaseURL, "/")
	targetStr := baseURL + "/" + path
	if _, err := url.Parse(targetStr); err != nil {
		return nil, fmt.Errorf("invalid path: %w", err)
	}

	req, err := http.NewRequest(method, targetStr, body)
	if err != nil {
		return nil, err
	}

	// Copy allowed headers from client (exclude Host, auth-related)
	for k, v := range headers {
		kl := strings.ToLower(k)
		if kl == "host" || kl == "authorization" || kl == "x-api-key" || strings.HasPrefix(kl, "x-api-") {
			continue
		}
		for _, vv := range v {
			req.Header.Add(k, vv)
		}
	}

	// Apply configured auth
	if err := s.applyAuth(req, entry); err != nil {
		return nil, err
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	return resp, nil
}

func (s *Service) applyAuth(req *http.Request, entry *config.RestEntry) error {
	auth := entry.Auth
	if auth == nil {
		return nil
	}
	switch auth.Type {
	case config.RestAuthNone:
		return nil
	case config.RestAuthBasic:
		req.SetBasicAuth(auth.Username, auth.Password)
		return nil
	case config.RestAuthBearer:
		req.Header.Set("Authorization", "Bearer "+auth.Token)
		return nil
	case config.RestAuthAPIKey:
		val := auth.Value
		name := auth.Name
		if name == "" {
			name = "X-API-Key"
		}
		in := strings.ToLower(auth.In)
		if in == "query" {
			q := req.URL.Query()
			q.Set(name, val)
			req.URL.RawQuery = q.Encode()
		} else {
			req.Header.Set(name, val)
		}
		return nil
	default:
		return nil
	}
}
