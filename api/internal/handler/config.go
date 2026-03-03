package handler

import (
	"context"
	"io"
	"net/http"
	"os"

	"github.com/0x1d/bench/api/internal/config"
	"github.com/0x1d/bench/api/internal/db"
	"github.com/0x1d/bench/api/internal/service/flow"
)

// HandleConfigExample returns the content of config.example.yaml.
func HandleConfigExample(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data, err := config.ReadExampleConfig()
	if err != nil {
		http.Error(w, "config.example.yaml not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "text/yaml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

// HandleConfig returns the content of config.yaml if present.
func HandleConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data, err := config.ReadConfigRaw()
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "config.yaml not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to read config.yaml", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/yaml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

// HandleConfigSave accepts raw YAML body and saves it as config.yaml.
func HandleConfigSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	if err := config.SaveConfig(data); err != nil {
		http.Error(w, "invalid config: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := reloadDatabaseRuntime(); err != nil {
		http.Error(w, "config saved but failed to apply runtime: "+err.Error(), http.StatusInternalServerError)
		return
	}
	flowSvc := flow.NewService()
	_ = flowSvc.EnsureFlowsMod()
	_ = flowSvc.SyncWorkspacesToFPC()

	w.WriteHeader(http.StatusOK)
}
func HandleConfigUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := r.ParseMultipartForm(1 << 20); err != nil { // 1MB max
		http.Error(w, "failed to parse multipart form", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "failed to read file", http.StatusInternalServerError)
		return
	}

	if err := config.SaveConfig(data); err != nil {
		http.Error(w, "invalid config: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := reloadDatabaseRuntime(); err != nil {
		http.Error(w, "config saved but failed to apply runtime: "+err.Error(), http.StatusInternalServerError)
		return
	}
	flowSvc := flow.NewService()
	_ = flowSvc.EnsureFlowsMod()
	_ = flowSvc.SyncWorkspacesToFPC()

	w.WriteHeader(http.StatusCreated)
}

func reloadDatabaseRuntime() error {
	dbEntries, err := config.DatabasesWithError()
	if err != nil {
		return err
	}
	if len(dbEntries) > 0 {
		defs := make([]db.Definition, 0, len(dbEntries))
		for _, entry := range dbEntries {
			defs = append(defs, db.Definition{
				ID:      entry.ID,
				Label:   entry.Label,
				URL:     entry.URL,
				Enabled: entry.IsEnabled(),
				Default: entry.Default,
			})
		}
		return db.InitDefinitions(context.Background(), defs)
	}
	if connStr := os.Getenv("DATABASE_URL"); connStr != "" {
		return db.Init(context.Background(), connStr)
	}
	db.Close()
	return nil
}
