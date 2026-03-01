package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/0x1d/bench/api/internal/model"
	"github.com/0x1d/bench/api/internal/service/resource"
)

var resourceSvc = resource.NewService()

// HandleResourceRoots returns the list of configured roots.
func HandleResourceRoots(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	roots := resourceSvc.Roots()
	resp := struct {
		Roots []struct {
			ID    string `json:"id"`
			Label string `json:"label"`
		} `json:"roots"`
	}{
		Roots: make([]struct {
			ID    string `json:"id"`
			Label string `json:"label"`
		}, 0, len(roots)),
	}
	for _, r := range roots {
		resp.Roots = append(resp.Roots, struct {
			ID    string `json:"id"`
			Label string `json:"label"`
		}{ID: r.ID, Label: r.Label})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// HandleResourceList returns directory contents for the given root and path.
func HandleResourceList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rootID := r.URL.Query().Get("root")
	path := r.URL.Query().Get("path")
	if path == "" {
		path = "."
	}

	list, err := resourceSvc.List(rootID, path)
	if err != nil {
		switch {
		case err == resource.ErrRootNotFound:
			http.Error(w, "root not found", http.StatusNotFound)
		case err == resource.ErrNotADirectory:
			http.Error(w, "path is not a directory", http.StatusBadRequest)
		case err == resource.ErrPathTraversal:
			http.Error(w, "invalid path", http.StatusBadRequest)
		default:
			http.Error(w, fmt.Sprintf("list failed: %v", err), http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(list)
}

// HandleResourceDownload streams the file for download.
func HandleResourceDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rootID := r.URL.Query().Get("root")
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	rc, info, err := resourceSvc.Download(rootID, path)
	if err != nil {
		switch {
		case err == resource.ErrRootNotFound, err == resource.ErrNotFound:
			http.Error(w, "not found", http.StatusNotFound)
		case err == resource.ErrNotAFile:
			http.Error(w, "path is not a file", http.StatusBadRequest)
		case err == resource.ErrPathTraversal:
			http.Error(w, "invalid path", http.StatusBadRequest)
		default:
			http.Error(w, fmt.Sprintf("download failed: %v", err), http.StatusInternalServerError)
		}
		return
	}
	defer rc.Close()

	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", info.Name()))
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))
	w.WriteHeader(http.StatusOK)
	// StreamCopy would be ideal; for small files Write is fine. Use io.Copy for streaming.
	if _, copyErr := io.Copy(w, rc); copyErr != nil {
		// Response may be partially written; cannot change status
		_ = copyErr
		return
	}
}

// HandleResourcePost handles file upload (multipart) or create folder (JSON).
func HandleResourcePost(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rootID := r.URL.Query().Get("root")
	path := r.URL.Query().Get("path")
	if path == "" {
		path = "."
	}

	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		// File upload
		if err := r.ParseMultipartForm(512 << 20); err != nil { // 512MB max memory
			http.Error(w, "failed to parse multipart form", http.StatusBadRequest)
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "file is required", http.StatusBadRequest)
			return
		}
		defer file.Close()

		err = resourceSvc.Upload(rootID, path, header.Filename, file, header.Size)
		if err != nil {
			writeResourceError(w, err)
			return
		}
		w.WriteHeader(http.StatusCreated)
		return
	}

	// Create folder (JSON)
	var req model.CreateDirRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	if req.Action != "mkdir" {
		http.Error(w, "action must be mkdir", http.StatusBadRequest)
		return
	}

	err := resourceSvc.CreateDir(rootID, path, req.Name)
	if err != nil {
		writeResourceError(w, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// HandleResourcePatch handles rename.
func HandleResourcePatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req model.RenameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}

	err := resourceSvc.Rename(req.Root, req.Path, req.NewName)
	if err != nil {
		writeResourceError(w, err)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// HandleResourceDelete handles file/folder deletion.
func HandleResourceDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rootID := r.URL.Query().Get("root")
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	err := resourceSvc.Delete(rootID, path)
	if err != nil {
		writeResourceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeResourceError(w http.ResponseWriter, err error) {
	switch {
	case err == resource.ErrRootNotFound:
		http.Error(w, "root not found", http.StatusNotFound)
	case err == resource.ErrNotADirectory:
		http.Error(w, "path is not a directory", http.StatusBadRequest)
	case err == resource.ErrPathTraversal, err == resource.ErrInvalidNewName:
		http.Error(w, "invalid path or name", http.StatusBadRequest)
	case err == resource.ErrEmptyName:
		http.Error(w, "name cannot be empty", http.StatusBadRequest)
	case err.Error() == "file too large":
		http.Error(w, "file too large", 413)
	default:
		http.Error(w, fmt.Sprintf("operation failed: %v", err), http.StatusInternalServerError)
	}
}
