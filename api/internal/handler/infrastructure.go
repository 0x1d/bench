package handler

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"

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
