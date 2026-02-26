package config

import (
	"os"
	"path/filepath"

	"github.com/0x1d/bench/api/internal/model"
	"gopkg.in/yaml.v3"
)

const envConfigPath = "BENCH_CONFIG"

// FilesystemEntry represents a single filesystem root in config.
type FilesystemEntry struct {
	ID    string `yaml:"id"`
	Label string `yaml:"label"`
	Path  string `yaml:"path"`
}

// ResourcesConfig is the resources section of config.yaml.
type ResourcesConfig struct {
	Filesystem []FilesystemEntry `yaml:"filesystem"`
}

// Config is the top-level config structure.
type Config struct {
	Resources ResourcesConfig `yaml:"resources"`
}

// FindConfigPath returns the path to config.yaml, or empty if none exists.
// Resolution order: BENCH_CONFIG (absolute path) → ./config.yaml → ../config.yaml.
func FindConfigPath() string {
	if p := os.Getenv(envConfigPath); p != "" {
		if filepath.IsAbs(p) {
			return p
		}
		wd, _ := os.Getwd()
		return filepath.Join(wd, p)
	}
	wd, _ := os.Getwd()
	for _, name := range []string{"config.yaml", "config.yml"} {
		p := filepath.Join(wd, name)
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	// When running from api/, try parent directory
	parent := filepath.Dir(wd)
	for _, name := range []string{"config.yaml", "config.yml"} {
		p := filepath.Join(parent, name)
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// Roots returns all configured roots for resource browsing from config.yaml.
// Returns empty slice if config is missing or has no filesystem entries.
func Roots() []model.Root {
	path := FindConfigPath()
	if path == "" {
		return nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil
	}

	var roots []model.Root
	baseDir := filepath.Dir(path)

	for _, e := range cfg.Resources.Filesystem {
		if e.ID == "" || e.Path == "" {
			continue
		}
		p := e.Path
		if !filepath.IsAbs(p) {
			p = filepath.Join(baseDir, p)
		}
		abs, err := filepath.Abs(p)
		if err != nil {
			continue
		}
		label := e.Label
		if label == "" {
			label = e.ID
		}
		roots = append(roots, model.Root{ID: e.ID, Label: label, Path: abs})
	}

	return roots
}

// RootStatus represents a filesystem root for status display (includes path).
type RootStatus struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Path  string `json:"path"`
}

const envConfigWritePath = "BENCH_CONFIG_WRITE"

// ConfigWritePath returns the path where config.yaml should be written when none exists.
// Uses BENCH_CONFIG_WRITE if set, else: parent/config.yaml when running from api/, else cwd/config.yaml.
func ConfigWritePath() string {
	if p := os.Getenv(envConfigWritePath); p != "" {
		return p
	}
	wd, _ := os.Getwd()
	// When running from api/, save to repo root (parent)
	if filepath.Base(wd) == "api" {
		return filepath.Join(filepath.Dir(wd), "config.yaml")
	}
	return filepath.Join(wd, "config.yaml")
}

// SaveConfig validates and writes config YAML. Uses existing config path if found, else default write path.
func SaveConfig(data []byte) error {
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return err
	}
	path := FindConfigPath()
	if path == "" {
		path = ConfigWritePath()
	}
	return os.WriteFile(path, data, 0644)
}

// ExampleConfigPath returns the path to config.example.yaml (same dir as config or write path).
func ExampleConfigPath() string {
	path := FindConfigPath()
	if path == "" {
		path = ConfigWritePath()
	}
	return filepath.Join(filepath.Dir(path), "config.example.yaml")
}

// ReadExampleConfig returns the content of config.example.yaml.
func ReadExampleConfig() ([]byte, error) {
	return os.ReadFile(ExampleConfigPath())
}

// RootsStatus returns configured roots with paths for status display.
func RootsStatus() []RootStatus {
	roots := Roots()
	out := make([]RootStatus, 0, len(roots))
	for _, r := range roots {
		out = append(out, RootStatus{ID: r.ID, Label: r.Label, Path: r.Path})
	}
	return out
}
