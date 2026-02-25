package resource

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestService_List(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("BENCH_RESOURCES_ROOT", tmp)

	// Create test structure
	if err := os.MkdirAll(filepath.Join(tmp, "subdir"), 0755); err != nil {
		t.Fatalf("setup: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tmp, "file.txt"), []byte("hello"), 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	svc := NewService()

	t.Run("list root", func(t *testing.T) {
		list, err := svc.List("default", ".")
		if err != nil {
			t.Fatalf("List: %v", err)
		}
		if len(list.Entries) < 2 {
			t.Errorf("expected at least 2 entries, got %d", len(list.Entries))
		}
		names := make(map[string]bool)
		for _, e := range list.Entries {
			names[e.Name] = true
		}
		if !names["subdir"] || !names["file.txt"] {
			t.Errorf("expected subdir and file.txt, got %v", names)
		}
	})

	t.Run("list subdir", func(t *testing.T) {
		list, err := svc.List("default", "subdir")
		if err != nil {
			t.Fatalf("List: %v", err)
		}
		if len(list.Entries) != 0 {
			t.Errorf("expected empty subdir, got %d entries", len(list.Entries))
		}
	})

	t.Run("root not found", func(t *testing.T) {
		_, err := svc.List("nonexistent", ".")
		if err != ErrRootNotFound {
			t.Errorf("expected ErrRootNotFound, got %v", err)
		}
	})

	t.Run("path traversal rejected", func(t *testing.T) {
		_, err := svc.List("default", "..")
		if err != ErrPathTraversal {
			t.Errorf("expected ErrPathTraversal for '..', got %v", err)
		}

		_, err = svc.List("default", "subdir/../..")
		if err != ErrPathTraversal {
			t.Errorf("expected ErrPathTraversal for 'subdir/../..', got %v", err)
		}
	})

	t.Run("not a directory", func(t *testing.T) {
		_, err := svc.List("default", "file.txt")
		if err != ErrNotADirectory {
			t.Errorf("expected ErrNotADirectory, got %v", err)
		}
	})
}

func TestService_Download(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("BENCH_RESOURCES_ROOT", tmp)

	content := []byte("test content")
	if err := os.WriteFile(filepath.Join(tmp, "download.txt"), content, 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	svc := NewService()

	rc, info, err := svc.Download("default", "download.txt")
	if err != nil {
		t.Fatalf("Download: %v", err)
	}
	defer rc.Close()

	if info.Name() != "download.txt" {
		t.Errorf("expected name download.txt, got %s", info.Name())
	}
	if info.Size() != int64(len(content)) {
		t.Errorf("expected size %d, got %d", len(content), info.Size())
	}

	var buf bytes.Buffer
	if _, err := buf.ReadFrom(rc); err != nil {
		t.Fatalf("ReadFrom: %v", err)
	}
	if !bytes.Equal(buf.Bytes(), content) {
		t.Errorf("content mismatch: got %q", buf.Bytes())
	}

	_, _, err = svc.Download("default", ".")
	if err != ErrNotAFile {
		t.Errorf("expected ErrNotAFile for directory, got %v", err)
	}
}

func TestService_Upload(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("BENCH_RESOURCES_ROOT", tmp)

	svc := NewService()
	content := []byte("uploaded")

	err := svc.Upload("default", ".", "newfile.txt", bytes.NewReader(content), int64(len(content)))
	if err != nil {
		t.Fatalf("Upload: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(tmp, "newfile.txt"))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if !bytes.Equal(data, content) {
		t.Errorf("content mismatch: got %q", data)
	}

	// Reject path in filename
	err = svc.Upload("default", ".", "path/to/file.txt", bytes.NewReader(content), int64(len(content)))
	if err != ErrInvalidNewName {
		t.Errorf("expected ErrInvalidNewName for path in filename, got %v", err)
	}
}

func TestService_CreateDir(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("BENCH_RESOURCES_ROOT", tmp)

	svc := NewService()

	err := svc.CreateDir("default", ".", "newdir")
	if err != nil {
		t.Fatalf("CreateDir: %v", err)
	}

	info, err := os.Stat(filepath.Join(tmp, "newdir"))
	if err != nil {
		t.Fatalf("Stat newdir: %v", err)
	}
	if !info.IsDir() {
		t.Error("expected newdir to be a directory")
	}

	err = svc.CreateDir("default", ".", "")
	if err != ErrEmptyName {
		t.Errorf("expected ErrEmptyName, got %v", err)
	}
}

func TestService_Rename(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("BENCH_RESOURCES_ROOT", tmp)

	if err := os.WriteFile(filepath.Join(tmp, "old.txt"), []byte("x"), 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	svc := NewService()

	err := svc.Rename("default", "old.txt", "new.txt")
	if err != nil {
		t.Fatalf("Rename: %v", err)
	}

	if _, err := os.Stat(filepath.Join(tmp, "old.txt")); err == nil {
		t.Error("old.txt should not exist")
	}
	if _, err := os.Stat(filepath.Join(tmp, "new.txt")); err != nil {
		t.Errorf("new.txt should exist: %v", err)
	}

	err = svc.Rename("default", "new.txt", "subdir/name")
	if err != ErrInvalidNewName {
		t.Errorf("expected ErrInvalidNewName for path in newName, got %v", err)
	}
}

func TestService_Delete(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("BENCH_RESOURCES_ROOT", tmp)

	filePath := filepath.Join(tmp, "todelete.txt")
	if err := os.WriteFile(filePath, []byte("x"), 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	svc := NewService()

	err := svc.Delete("default", "todelete.txt")
	if err != nil {
		t.Fatalf("Delete: %v", err)
	}

	if _, err := os.Stat(filePath); err == nil {
		t.Error("file should be deleted")
	}

	// Delete directory
	dirPath := filepath.Join(tmp, "todeletedir")
	if err := os.MkdirAll(dirPath, 0755); err != nil {
		t.Fatalf("setup dir: %v", err)
	}
	err = svc.Delete("default", "todeletedir")
	if err != nil {
		t.Fatalf("Delete dir: %v", err)
	}
	if _, err := os.Stat(dirPath); err == nil {
		t.Error("directory should be deleted")
	}
}
