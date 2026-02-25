package handler

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestHandleResourceRoots(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("BENCH_RESOURCES_ROOT", tmp)

	req := httptest.NewRequest(http.MethodGet, "/api/resources/roots", nil)
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
	t.Setenv("BENCH_RESOURCES_ROOT", tmp)
	if err := os.MkdirAll(filepath.Join(tmp, "sub"), 0755); err != nil {
		t.Fatalf("setup: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/resources?root=default&path=.", nil)
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
	t.Setenv("BENCH_RESOURCES_ROOT", tmp)

	req := httptest.NewRequest(http.MethodGet, "/api/resources?root=nonexistent&path=.", nil)
	rec := httptest.NewRecorder()

	HandleResourceList(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected status %d, got %d", http.StatusNotFound, rec.Code)
	}
}

func TestHandleResourceDownload(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("BENCH_RESOURCES_ROOT", tmp)
	content := []byte("download content")
	if err := os.WriteFile(filepath.Join(tmp, "file.txt"), content, 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/resources/download?root=default&path=file.txt", nil)
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
	t.Setenv("BENCH_RESOURCES_ROOT", tmp)

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, _ := w.CreateFormFile("file", "uploaded.txt")
	part.Write([]byte("uploaded content"))
	w.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/resources?root=default&path=.", &buf)
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
	t.Setenv("BENCH_RESOURCES_ROOT", tmp)

	body := []byte(`{"action":"mkdir","name":"newfolder"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/resources?root=default&path=.", bytes.NewReader(body))
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
	t.Setenv("BENCH_RESOURCES_ROOT", tmp)
	if err := os.WriteFile(filepath.Join(tmp, "oldname.txt"), []byte("x"), 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	body := []byte(`{"root":"default","path":"oldname.txt","newName":"newname.txt"}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/resources", bytes.NewReader(body))
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
	t.Setenv("BENCH_RESOURCES_ROOT", tmp)
	filePath := filepath.Join(tmp, "todelete.txt")
	if err := os.WriteFile(filePath, []byte("x"), 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/resources?root=default&path=todelete.txt", nil)
	rec := httptest.NewRecorder()

	HandleResourceDelete(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected status %d, got %d", http.StatusNoContent, rec.Code)
	}
	if _, err := os.Stat(filePath); err == nil {
		t.Error("file should be deleted")
	}
}
