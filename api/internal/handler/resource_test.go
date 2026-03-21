package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func writeTestConfig(t *testing.T, configDir, rootPath string) string {
	t.Helper()
	cfgPath := filepath.Join(configDir, "config.yaml")
	body := fmt.Sprintf("resources:\n  filesystem:\n    - id: default\n      label: Resources\n      path: %s\n", rootPath)
	if err := os.WriteFile(cfgPath, []byte(body), 0644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	abs, _ := filepath.Abs(cfgPath)
	return abs
}

func TestHandleResourceRoots(t *testing.T) {
	tmp := t.TempDir()
	cfgPath := writeTestConfig(t, tmp, tmp)
	t.Setenv("BENCH_CONFIG", cfgPath)

	req := httptest.NewRequest(http.MethodGet, "/api/configuration/roots", nil)
	rec := httptest.NewRecorder()

	HandleResourceRoots(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	var resp struct {
		Roots []struct {
			ID    string `json:"id"`
			Label string `json:"label"`
		} `json:"roots"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Roots) == 0 {
		t.Error("expected at least one root")
	}
	if resp.Roots[0].ID != "default" {
		t.Errorf("expected first root id 'default', got %s", resp.Roots[0].ID)
	}
}

func TestHandleResourceList(t *testing.T) {
	tmp := t.TempDir()
	cfgPath := writeTestConfig(t, tmp, tmp)
	t.Setenv("BENCH_CONFIG", cfgPath)
	if err := os.MkdirAll(filepath.Join(tmp, "sub"), 0755); err != nil {
		t.Fatalf("setup: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/configuration?root=default&path=.", nil)
	rec := httptest.NewRecorder()

	HandleResourceList(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	var resp struct {
		Entries []struct {
			Name  string `json:"name"`
			IsDir bool   `json:"isDir"`
		} `json:"entries"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	found := false
	for _, e := range resp.Entries {
		if e.Name == "sub" && e.IsDir {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected sub directory in entries, got %v", resp.Entries)
	}
}

func TestHandleResourceList_RootNotFound(t *testing.T) {
	tmp := t.TempDir()
	cfgPath := writeTestConfig(t, tmp, tmp)
	t.Setenv("BENCH_CONFIG", cfgPath)

	req := httptest.NewRequest(http.MethodGet, "/api/configuration?root=nonexistent&path=.", nil)
	rec := httptest.NewRecorder()

	HandleResourceList(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected status %d, got %d", http.StatusNotFound, rec.Code)
	}
}

func TestHandleResourceDownload(t *testing.T) {
	tmp := t.TempDir()
	cfgPath := writeTestConfig(t, tmp, tmp)
	t.Setenv("BENCH_CONFIG", cfgPath)
	content := []byte("download content")
	if err := os.WriteFile(filepath.Join(tmp, "file.txt"), content, 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/configuration/download?root=default&path=file.txt", nil)
	rec := httptest.NewRecorder()

	HandleResourceDownload(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}
	if rec.Body.Len() != len(content) {
		t.Errorf("expected body length %d, got %d", len(content), rec.Body.Len())
	}
	if !bytes.Equal(rec.Body.Bytes(), content) {
		t.Error("body content mismatch")
	}
}

func TestHandleResourcePost_Upload(t *testing.T) {
	tmp := t.TempDir()
	cfgPath := writeTestConfig(t, tmp, tmp)
	t.Setenv("BENCH_CONFIG", cfgPath)

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, _ := w.CreateFormFile("file", "uploaded.txt")
	part.Write([]byte("uploaded content"))
	w.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/configuration?root=default&path=.", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	rec := httptest.NewRecorder()

	HandleResourcePost(rec, req)

	if rec.Code != http.StatusCreated {
		t.Errorf("expected status %d, got %d", http.StatusCreated, rec.Code)
	}
	data, err := os.ReadFile(filepath.Join(tmp, "uploaded.txt"))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(data) != "uploaded content" {
		t.Errorf("expected 'uploaded content', got %q", data)
	}
}

func TestHandleResourcePost_CreateDir(t *testing.T) {
	tmp := t.TempDir()
	cfgPath := writeTestConfig(t, tmp, tmp)
	t.Setenv("BENCH_CONFIG", cfgPath)

	body := []byte(`{"action":"mkdir","name":"newfolder"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/configuration?root=default&path=.", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	HandleResourcePost(rec, req)

	if rec.Code != http.StatusCreated {
		t.Errorf("expected status %d, got %d", http.StatusCreated, rec.Code)
	}
	info, err := os.Stat(filepath.Join(tmp, "newfolder"))
	if err != nil {
		t.Fatalf("Stat: %v", err)
	}
	if !info.IsDir() {
		t.Error("expected newfolder to be directory")
	}
}

func TestHandleResourcePatch(t *testing.T) {
	tmp := t.TempDir()
	cfgPath := writeTestConfig(t, tmp, tmp)
	t.Setenv("BENCH_CONFIG", cfgPath)
	if err := os.WriteFile(filepath.Join(tmp, "oldname.txt"), []byte("x"), 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	body := []byte(`{"root":"default","path":"oldname.txt","newName":"newname.txt"}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/configuration", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	HandleResourcePatch(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}
	if _, err := os.Stat(filepath.Join(tmp, "oldname.txt")); err == nil {
		t.Error("oldname.txt should not exist")
	}
	if _, err := os.Stat(filepath.Join(tmp, "newname.txt")); err != nil {
		t.Errorf("newname.txt should exist: %v", err)
	}
}

func TestHandleResourceDelete(t *testing.T) {
	tmp := t.TempDir()
	cfgPath := writeTestConfig(t, tmp, tmp)
	t.Setenv("BENCH_CONFIG", cfgPath)
	filePath := filepath.Join(tmp, "todelete.txt")
	if err := os.WriteFile(filePath, []byte("x"), 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/configuration?root=default&path=todelete.txt", nil)
	rec := httptest.NewRecorder()

	HandleResourceDelete(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected status %d, got %d", http.StatusNoContent, rec.Code)
	}
	if _, err := os.Stat(filePath); err == nil {
		t.Error("file should be deleted")
	}
}

func TestRegisterRoutes_FilesystemConfigurationAndLegacyAlias(t *testing.T) {
	tmp := t.TempDir()
	cfgPath := writeTestConfig(t, tmp, tmp)
	t.Setenv("BENCH_CONFIG", cfgPath)

	mux := http.NewServeMux()
	RegisterRoutes(mux)

	for _, path := range []string{"/api/configuration/roots", "/api/resources/roots"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: expected status %d, got %d", path, http.StatusOK, rec.Code)
		}
	}
}
