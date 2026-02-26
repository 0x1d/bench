package config

import (
	"os"
	"path/filepath"

	"github.com/0x1d/bench/api/internal/model"
)

const (
	envResourcesRoot = "BENCH_RESOURCES_ROOT"
	envComfyUIPath   = "COMFYUI_PATH"
)

// Roots returns all configured roots for resource browsing.
// Includes BENCH_RESOURCES_ROOT (id: "default") and ComfyUI shortcuts when COMFYUI_PATH is set.
func Roots() []model.Root {
	var roots []model.Root

	if p := os.Getenv(envResourcesRoot); p != "" {
		abs, err := filepath.Abs(p)
		if err == nil {
			roots = append(roots, model.Root{ID: "default", Label: "Resources", Path: abs})
		}
	}

	if base := os.Getenv(envComfyUIPath); base != "" {
		abs, err := filepath.Abs(base)
		if err != nil {
			return roots
		}
		roots = append(roots,
			model.Root{ID: "workflows", Label: "ComfyUI Workflows", Path: filepath.Join(abs, "workflows")},
			model.Root{ID: "models", Label: "ComfyUI Models", Path: filepath.Join(abs, "models")},
			model.Root{ID: "output", Label: "ComfyUI Output", Path: filepath.Join(abs, "output")},
		)
	}

	return roots
}
