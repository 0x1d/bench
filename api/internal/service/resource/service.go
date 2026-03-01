package resource

import (
	"errors"
	"io"
	"os"
	"path/filepath"

	"github.com/0x1d/bench/api/internal/config"
	"github.com/0x1d/bench/api/internal/model"
)

const (
	maxListEntries   = 1000
	defaultUploadMax = 500 * 1024 * 1024 // 500MB
)

var (
	ErrRootNotFound   = errors.New("root not found")
	ErrPathTraversal  = errors.New("path traversal not allowed")
	ErrNotUnderRoot   = errors.New("path is not under root")
	ErrNotAFile       = errors.New("path is not a file")
	ErrNotADirectory  = errors.New("path is not a directory")
	ErrNotFound       = errors.New("not found")
	ErrEmptyName      = errors.New("name cannot be empty")
	ErrInvalidNewName = errors.New("new name contains invalid path characters")
)

// Service provides file system resource operations.
type Service struct{}

// NewService creates a new resource service.
func NewService() *Service {
	return &Service{}
}

// Roots returns the configured roots.
func (s *Service) Roots() []model.Root {
	return config.Roots()
}

// resolvePath returns the absolute path for root+path and validates it stays under the root.
func (s *Service) resolvePath(rootID, relPath string) (absPath string, rootPath string, err error) {
	roots := config.Roots()
	var root *model.Root
	for i := range roots {
		if roots[i].ID == rootID {
			root = &roots[i]
			break
		}
	}
	if root == nil {
		return "", "", ErrRootNotFound
	}

	rootPath = filepath.Clean(root.Path)
	joined := filepath.Join(rootPath, filepath.Clean(relPath))
	absPath, err = filepath.Abs(joined)
	if err != nil {
		return "", "", err
	}

	// Ensure path is under root (prevents .. traversal)
	rel, err := filepath.Rel(rootPath, absPath)
	if err != nil {
		return "", "", ErrPathTraversal
	}
	if rel == ".." || len(rel) >= 3 && rel[:3] == ".."+string(filepath.Separator) {
		return "", "", ErrPathTraversal
	}

	return absPath, rootPath, nil
}

// List returns directory entries for the given root and path.
func (s *Service) List(rootID, relPath string) (*model.ListResponse, error) {
	absPath, _, err := s.resolvePath(rootID, relPath)
	if err != nil {
		return nil, err
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, ErrNotADirectory
	}

	entries, err := os.ReadDir(absPath)
	if err != nil {
		return nil, err
	}

	result := make([]model.ResourceEntry, 0, len(entries))
	for i, e := range entries {
		if i >= maxListEntries {
			break
		}
		// Skip . and ..
		if e.Name() == "." || e.Name() == ".." {
			continue
		}

		entry := model.ResourceEntry{
			Name:  e.Name(),
			Path:  filepath.Join(relPath, e.Name()),
			IsDir: e.IsDir(),
		}

		info, err := e.Info()
		if err == nil {
			if !entry.IsDir {
				entry.Size = info.Size()
			}
			entry.Mtime = info.ModTime().Unix()
		}

		result = append(result, entry)
	}

	return &model.ListResponse{
		Entries: result,
		Roots:   s.Roots(),
	}, nil
}

// Download opens the file at the given path for reading.
// Caller must close the returned ReadCloser.
func (s *Service) Download(rootID, relPath string) (io.ReadCloser, os.FileInfo, error) {
	absPath, _, err := s.resolvePath(rootID, relPath)
	if err != nil {
		return nil, nil, err
	}

	info, err := os.Stat(absPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil, ErrNotFound
		}
		return nil, nil, err
	}
	if info.IsDir() {
		return nil, nil, ErrNotAFile
	}

	f, err := os.Open(absPath)
	if err != nil {
		return nil, nil, err
	}

	return f, info, nil
}

// Upload saves an uploaded file to the given directory.
func (s *Service) Upload(rootID, relPath string, filename string, content io.Reader, size int64) error {
	if size > defaultUploadMax {
		return errors.New("file too large")
	}
	dirPath, _, err := s.resolvePath(rootID, relPath)
	if err != nil {
		return err
	}

	info, err := os.Stat(dirPath)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return ErrNotADirectory
	}

	// Ensure filename has no path components
	if filepath.Base(filename) != filename {
		return ErrInvalidNewName
	}

	targetPath := filepath.Join(dirPath, filename)
	if err := s.ensureUnderRoot(targetPath, dirPath); err != nil {
		return err
	}

	f, err := os.Create(targetPath)
	if err != nil {
		return err
	}
	defer f.Close()

	written, err := io.Copy(f, content)
	if err != nil {
		os.Remove(targetPath)
		return err
	}
	if size > 0 && written != size {
		os.Remove(targetPath)
		return errors.New("upload size mismatch")
	}
	return nil
}

func (s *Service) ensureUnderRoot(target, root string) error {
	absTarget, err := filepath.Abs(target)
	if err != nil {
		return err
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(absRoot, absTarget)
	if err != nil {
		return ErrPathTraversal
	}
	if rel == ".." || len(rel) >= 3 && rel[:3] == ".."+string(filepath.Separator) {
		return ErrPathTraversal
	}
	return nil
}

// CreateDir creates a directory at the given path.
func (s *Service) CreateDir(rootID, relPath, name string) error {
	if name == "" {
		return ErrEmptyName
	}
	if filepath.Base(name) != name {
		return ErrInvalidNewName
	}

	parentPath, _, err := s.resolvePath(rootID, relPath)
	if err != nil {
		return err
	}

	info, err := os.Stat(parentPath)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return ErrNotADirectory
	}

	targetPath := filepath.Join(parentPath, name)
	return os.MkdirAll(targetPath, 0755)
}

// Rename renames a file or directory.
func (s *Service) Rename(rootID, oldPath, newName string) error {
	if newName == "" {
		return ErrEmptyName
	}
	if filepath.Base(newName) != newName {
		return ErrInvalidNewName
	}

	oldAbsPath, rootPath, err := s.resolvePath(rootID, oldPath)
	if err != nil {
		return err
	}

	parent := filepath.Dir(oldAbsPath)
	newAbsPath := filepath.Join(parent, newName)

	if err := s.ensureUnderRoot(newAbsPath, rootPath); err != nil {
		return err
	}

	return os.Rename(oldAbsPath, newAbsPath)
}

// Delete removes a file or directory.
func (s *Service) Delete(rootID, relPath string) error {
	absPath, _, err := s.resolvePath(rootID, relPath)
	if err != nil {
		return err
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return err
	}

	if info.IsDir() {
		return os.RemoveAll(absPath)
	}
	return os.Remove(absPath)
}
