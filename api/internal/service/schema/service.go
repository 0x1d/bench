package schema

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/0x1d/bench/api/internal/config"
	"github.com/0x1d/bench/api/internal/model"
)

var (
	// ErrSchemaNotFound is returned when no schema exists for the given id.
	ErrSchemaNotFound = errors.New("schema not found")
	// ErrPathTraversal is returned when a schema path escapes the config directory.
	ErrPathTraversal = errors.New("path traversal not allowed")
)

// Service provides schema registry operations.
type Service struct{}

// NewService creates a new schema service.
func NewService() *Service {
	return &Service{}
}

// List returns all configured schemas for API responses.
func (s *Service) List() []model.SchemaResource {
	entries := config.SchemaEntries()
	out := make([]model.SchemaResource, 0, len(entries))
	for _, e := range entries {
		out = append(out, toSchemaResource(e))
	}
	return out
}

// Get returns the schema resource for id, or ErrSchemaNotFound.
func (s *Service) Get(id string) (*model.SchemaResource, error) {
	e := config.SchemaByID(id)
	if e == nil {
		return nil, ErrSchemaNotFound
	}
	r := toSchemaResource(*e)
	return &r, nil
}

// Content reads the schema file bytes for id. Paths are resolved relative to the
// config directory using the same rules as REST OpenAPI spec loading.
func (s *Service) Content(id string) ([]byte, error) {
	res, err := s.Get(id)
	if err != nil {
		return nil, err
	}

	baseDir := config.ConfigDir()
	if baseDir == "" {
		return nil, errors.New("config directory not found")
	}

	cleanPath := filepath.Clean(res.Source.Path)
	if cleanPath == ".." || strings.HasPrefix(cleanPath, ".."+string(filepath.Separator)) {
		return nil, ErrPathTraversal
	}
	absPath := filepath.Join(baseDir, cleanPath)

	rel, err := filepath.Rel(baseDir, absPath)
	if err != nil {
		return nil, ErrPathTraversal
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return nil, ErrPathTraversal
	}

	return os.ReadFile(absPath)
}

func toSchemaResource(e config.SchemaEntry) model.SchemaResource {
	return model.SchemaResource{
		ID:    e.ID,
		Label: e.Label,
		Type:  e.Type,
		Source: model.SchemaSource{
			Path: e.Source.Path,
		},
	}
}
