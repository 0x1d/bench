package handler

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/0x1d/bench/api/internal/config"
)

// InfrastructureStatusResponse is the response for GET /api/infrastructure/status.
type InfrastructureStatusResponse struct {
	Configured         bool   `json:"configured"`
	Path               string `json:"path"`
	TerraformAvailable bool   `json:"terraformAvailable"`
}

// HandleInfrastructureStatus returns infrastructure configuration status.
func HandleInfrastructureStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	resp := InfrastructureStatusResponse{
		Configured: config.InfrastructureConfigured(),
	}
	if resp.Configured {
		resp.Path = config.InfrastructurePath()
	}
	if _, err := exec.LookPath("terraform"); err == nil {
		resp.TerraformAvailable = true
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// HandleInfrastructureInit runs terraform init in the infrastructure directory.
func HandleInfrastructureInit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	runTerraformCommand(w, "init")
}

// HandleInfrastructurePlan runs terraform plan.
func HandleInfrastructurePlan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	runTerraformCommand(w, "plan")
}

// HandleInfrastructureApply runs terraform apply -auto-approve.
func HandleInfrastructureApply(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	runTerraformCommand(w, "apply", "-auto-approve")
}

// HandleInfrastructureDestroy runs terraform destroy -auto-approve.
func HandleInfrastructureDestroy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	runTerraformCommand(w, "destroy", "-auto-approve")
}

// GraphResponse is the JSON response for GET /api/infrastructure/graph.
type GraphResponse struct {
	Dot string `json:"dot"`
}

// HandleInfrastructureGraph runs terraform graph and returns the DOT output.
func HandleInfrastructureGraph(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if !config.InfrastructureConfigured() {
		http.Error(w, "infrastructure not configured", http.StatusBadRequest)
		return
	}

	dir := config.InfrastructurePath()
	if dir == "" {
		http.Error(w, "infrastructure path not configured", http.StatusBadRequest)
		return
	}

	cmd := exec.Command("terraform", "graph")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "TF_IN_AUTOMATION=1")

	out, err := cmd.CombinedOutput()
	if err != nil {
		http.Error(w, fmt.Sprintf("terraform graph failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(GraphResponse{Dot: strings.TrimSpace(string(out))})
}

func runTerraformCommand(w http.ResponseWriter, args ...string) {
	if !config.InfrastructureConfigured() {
		http.Error(w, "infrastructure not configured", http.StatusBadRequest)
		return
	}

	dir := config.InfrastructurePath()
	if dir == "" {
		http.Error(w, "infrastructure path not configured", http.StatusBadRequest)
		return
	}

	// Ensure directory exists
	if err := os.MkdirAll(dir, 0755); err != nil {
		http.Error(w, fmt.Sprintf("failed to create infra dir: %v", err), http.StatusInternalServerError)
		return
	}

	cmd := exec.Command("terraform", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "TF_IN_AUTOMATION=1")

	// Use CombinedOutput pipe so stdout and stderr are merged
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to create stdout pipe: %v", err), http.StatusInternalServerError)
		return
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		http.Error(w, fmt.Sprintf("failed to start terraform: %v", err), http.StatusInternalServerError)
		return
	}

	// Stream output as plain text
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Transfer-Encoding", "chunked")
	w.WriteHeader(http.StatusOK)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
		if _, err := w.Write(line); err != nil {
			return
		}
		if _, err := w.Write([]byte("\n")); err != nil {
			return
		}
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}

	cmd.Wait()
}

// SaveFileRequest is the JSON body for POST /api/infrastructure/save-file.
type SaveFileRequest struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// HandleInfrastructureSaveFile saves a file to the infrastructure directory and runs terraform fmt.
func HandleInfrastructureSaveFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if !config.InfrastructureConfigured() {
		http.Error(w, "infrastructure not configured", http.StatusBadRequest)
		return
	}

	dir := config.InfrastructurePath()
	if dir == "" {
		http.Error(w, "infrastructure path not configured", http.StatusBadRequest)
		return
	}

	var req SaveFileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	if req.Path == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	// Resolve path and ensure it stays within infra dir
	absPath := filepath.Join(dir, filepath.Clean(req.Path))
	absDir, err := filepath.Abs(dir)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid path: %v", err), http.StatusInternalServerError)
		return
	}
	absPathResolved, err := filepath.Abs(absPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid path: %v", err), http.StatusBadRequest)
		return
	}
	rel, err := filepath.Rel(absDir, absPathResolved)
	if err != nil || strings.HasPrefix(rel, "..") {
		http.Error(w, "path traversal not allowed", http.StatusBadRequest)
		return
	}

	if err := os.MkdirAll(filepath.Dir(absPathResolved), 0755); err != nil {
		http.Error(w, fmt.Sprintf("failed to create directory: %v", err), http.StatusInternalServerError)
		return
	}

	if err := os.WriteFile(absPathResolved, []byte(req.Content), 0644); err != nil {
		http.Error(w, fmt.Sprintf("failed to write file: %v", err), http.StatusInternalServerError)
		return
	}

	// Run terraform fmt in the infra directory
	fmtCmd := exec.Command("terraform", "fmt")
	fmtCmd.Dir = dir
	if err := fmtCmd.Run(); err != nil {
		// Log but don't fail - file was saved; fmt may fail if content is invalid
		_ = err
	}

	w.WriteHeader(http.StatusOK)
}
