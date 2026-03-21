package config

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/0x1d/bench/api/internal/model"
	"gopkg.in/yaml.v3"
)

//go:embed config.example.yaml
var embeddedExampleConfig []byte

const envConfigPath = "BENCH_CONFIG"

// FilesystemEntry represents a single filesystem root in config.
type FilesystemEntry struct {
	ID    string `yaml:"id"`
	Label string `yaml:"label"`
	Path  string `yaml:"path"`
}

// DatabaseEntry represents one configured database resource.
type DatabaseEntry struct {
	ID      string `yaml:"id"`
	Label   string `yaml:"label"`
	URL     string `yaml:"url"`
	Enabled *bool  `yaml:"enabled,omitempty"`
	Default bool   `yaml:"default,omitempty"`
}

// RestAuthType is the authentication type for a REST resource.
type RestAuthType string

const (
	RestAuthNone   RestAuthType = "none"
	RestAuthBasic  RestAuthType = "basic"
	RestAuthBearer RestAuthType = "bearer"
	RestAuthAPIKey RestAuthType = "apiKey"
)

// RestAuth represents authentication config for a REST resource.
type RestAuth struct {
	Type     RestAuthType `yaml:"type"`
	Username string       `yaml:"username,omitempty"`
	Password string       `yaml:"password,omitempty"`
	Token    string       `yaml:"token,omitempty"`
	Name     string       `yaml:"name,omitempty"`  // Header/query param name for apiKey
	In       string       `yaml:"in,omitempty"`    // "header" or "query" for apiKey
	Value    string       `yaml:"value,omitempty"` // Env placeholder for apiKey
}

// RestEntry represents one configured REST resource.
// When both SchemaID and OpenAPISpec are set, SchemaID takes precedence for spec resolution.
type RestEntry struct {
	ID          string    `yaml:"id"`
	Label       string    `yaml:"label"`
	BaseURL     string    `yaml:"baseUrl"`
	SchemaID    string    `yaml:"schemaId,omitempty"`
	OpenAPISpec string    `yaml:"openapiSpec,omitempty"`
	Auth        *RestAuth `yaml:"auth,omitempty"`
}

// SchemaSource holds the on-disk location for a schema entry.
type SchemaSource struct {
	Path string `yaml:"path"`
}

// SchemaEntry represents one registered schema in resources.schemas.
type SchemaEntry struct {
	ID     string       `yaml:"id"`
	Label  string       `yaml:"label"`
	Type   string       `yaml:"type"`
	Source SchemaSource `yaml:"source"`
}

// IsEnabled returns true when the database entry is enabled.
// Nil defaults to enabled.
func (d DatabaseEntry) IsEnabled() bool {
	if d.Enabled == nil {
		return true
	}
	return *d.Enabled
}

// WorkspaceEntry represents a Flowpipe workspace profile (not a directory).
// Workspaces are named profiles in workspaces.fpc; switching workspace only
// changes which profile is used when executing pipelines.
type WorkspaceEntry struct {
	ID          string `yaml:"id" json:"id"`
	Label       string `yaml:"label" json:"label"`
	FlowpipeURL string `yaml:"flowpipeUrl,omitempty" json:"flowpipeUrl,omitempty"` // Flowpipe server URL (host in workspaces.fpc)
}

// ResourcesConfig is the `resources` section of config.yaml (filesystem, databases, REST, schemas).
// It is edited in the UI on the Configuration page.
type ResourcesConfig struct {
	Filesystem []FilesystemEntry `yaml:"filesystem"`
	Databases  []DatabaseEntry   `yaml:"databases"`
	Rest       []RestEntry       `yaml:"rest"`
	Schemas    []SchemaEntry     `yaml:"schemas"`
}

// FlowsConfig holds flow-related settings including workspaces.
type FlowsConfig struct {
	Path       string           `yaml:"path"`       // flows directory (default ./flows)
	Workspaces []WorkspaceEntry `yaml:"workspaces"` // Flowpipe workspace profiles (id, label, flowpipeUrl)
}

// InfrastructureConfig holds infrastructure (Terraform) settings.
type InfrastructureConfig struct {
	Path string `yaml:"path"` // Terraform config directory (default ./workspace/infra)
}

// AgentConfig holds settings for the AI agent service.
type AgentConfig struct {
	Endpoint         string `yaml:"endpoint"`
	WorkingDirectory string `yaml:"workingDirectory"`
	Agent            string `yaml:"agent"` // cursor or gemini
	Model            string `yaml:"model,omitempty"`
}

// Config is the top-level config structure.
type Config struct {
	Resources      ResourcesConfig       `yaml:"resources"`
	Flows          *FlowsConfig          `yaml:"flows,omitempty"`
	Infrastructure *InfrastructureConfig `yaml:"infrastructure,omitempty"`
	Agent          *AgentConfig          `yaml:"agent,omitempty"`
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

var envVarPattern = regexp.MustCompile(`\$\{([A-Za-z_][A-Za-z0-9_]*)\}`)

// EnvVarPattern returns the regex for extracting env var names from ${VAR} placeholders.
func EnvVarPattern() *regexp.Regexp {
	return envVarPattern
}

func interpolateEnv(data []byte) ([]byte, error) {
	matches := envVarPattern.FindAllSubmatch(data, -1)
	if len(matches) == 0 {
		return data, nil
	}

	missingSet := map[string]struct{}{}
	out := envVarPattern.ReplaceAllStringFunc(string(data), func(match string) string {
		parts := envVarPattern.FindStringSubmatch(match)
		if len(parts) != 2 {
			return match
		}
		name := parts[1]
		if val, ok := os.LookupEnv(name); ok {
			return val
		}
		missingSet[name] = struct{}{}
		return match
	})

	if len(missingSet) > 0 {
		names := make([]string, 0, len(missingSet))
		for name := range missingSet {
			names = append(names, name)
		}
		sort.Strings(names)
		return nil, fmt.Errorf("missing environment variables: %s", strings.Join(names, ", "))
	}
	return []byte(out), nil
}

func parseConfig(data []byte) (Config, error) {
	expanded, err := interpolateEnv(data)
	if err != nil {
		return Config{}, err
	}
	var cfg Config
	if err := yaml.Unmarshal(expanded, &cfg); err != nil {
		return Config{}, err
	}
	if err := validateConfig(cfg); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

var validRestAuthTypes = map[RestAuthType]bool{
	RestAuthNone: true, RestAuthBasic: true, RestAuthBearer: true, RestAuthAPIKey: true,
}

var validSchemaTypes = map[string]struct{}{
	"openapi":     {},
	"asyncapi":    {},
	"json-schema": {},
}

func validateConfig(cfg Config) error {
	seenDB := map[string]struct{}{}
	defaults := 0
	for i, db := range cfg.Resources.Databases {
		if db.ID == "" {
			return fmt.Errorf("resources.databases[%d].id is required", i)
		}
		if _, ok := seenDB[db.ID]; ok {
			return fmt.Errorf("resources.databases contains duplicate id %q", db.ID)
		}
		seenDB[db.ID] = struct{}{}
		if db.URL == "" {
			return fmt.Errorf("resources.databases[%d].url is required", i)
		}
		if db.Default {
			defaults++
		}
	}
	if defaults > 1 {
		return fmt.Errorf("resources.databases allows at most one default entry")
	}

	seenRest := map[string]struct{}{}
	for i, rest := range cfg.Resources.Rest {
		if rest.ID == "" {
			return fmt.Errorf("resources.rest[%d].id is required", i)
		}
		if _, ok := seenRest[rest.ID]; ok {
			return fmt.Errorf("resources.rest contains duplicate id %q", rest.ID)
		}
		seenRest[rest.ID] = struct{}{}
		if rest.BaseURL == "" {
			return fmt.Errorf("resources.rest[%d].baseUrl is required", i)
		}
		authType := RestAuthNone
		if rest.Auth != nil {
			authType = rest.Auth.Type
			if authType == "" {
				authType = RestAuthNone
			}
			if !validRestAuthTypes[authType] {
				return fmt.Errorf("resources.rest[%d].auth.type must be one of: none, basic, bearer, apiKey", i)
			}
			if authType == RestAuthBasic && (rest.Auth.Username == "" || rest.Auth.Password == "") {
				return fmt.Errorf("resources.rest[%d].auth.username and auth.password are required for basic auth", i)
			}
			if authType == RestAuthBearer && rest.Auth.Token == "" {
				return fmt.Errorf("resources.rest[%d].auth.token is required for bearer auth", i)
			}
			if authType == RestAuthAPIKey {
				if rest.Auth.Name == "" || rest.Auth.Value == "" {
					return fmt.Errorf("resources.rest[%d].auth.name and auth.value are required for apiKey auth", i)
				}
				if rest.Auth.In != "" && rest.Auth.In != "header" && rest.Auth.In != "query" {
					return fmt.Errorf("resources.rest[%d].auth.in must be header or query for apiKey auth", i)
				}
			}
		}
		if rest.SchemaID != "" {
			var sch *SchemaEntry
			for j := range cfg.Resources.Schemas {
				if cfg.Resources.Schemas[j].ID == rest.SchemaID {
					sch = &cfg.Resources.Schemas[j]
					break
				}
			}
			if sch == nil || sch.Type != "openapi" {
				return fmt.Errorf("resources.rest[%d].schemaId %q references non-existent or non-openapi schema", i, rest.SchemaID)
			}
		}
	}

	seenSchema := map[string]struct{}{}
	for i, s := range cfg.Resources.Schemas {
		if s.ID == "" {
			return fmt.Errorf("resources.schemas[%d].id is required", i)
		}
		if _, ok := seenSchema[s.ID]; ok {
			return fmt.Errorf("resources.schemas contains duplicate id %q", s.ID)
		}
		seenSchema[s.ID] = struct{}{}
		if s.Type == "" {
			return fmt.Errorf("resources.schemas[%d].type is required", i)
		}
		if _, ok := validSchemaTypes[s.Type]; !ok {
			return fmt.Errorf("resources.schemas[%d].type must be one of: openapi, asyncapi, json-schema", i)
		}
		if s.Source.Path == "" {
			return fmt.Errorf("resources.schemas[%d].source.path is required", i)
		}
	}

	if cfg.Flows != nil {
		seenWorkspace := map[string]struct{}{}
		for i, ws := range cfg.Flows.Workspaces {
			if ws.ID == "" {
				return fmt.Errorf("flows.workspaces[%d].id is required", i)
			}
			if _, ok := seenWorkspace[ws.ID]; ok {
				return fmt.Errorf("flows.workspaces contains duplicate id %q", ws.ID)
			}
			seenWorkspace[ws.ID] = struct{}{}
		}
	}
	if cfg.Agent != nil {
		if cfg.Agent.Endpoint == "" {
			return fmt.Errorf("agent.endpoint is required")
		}
		if cfg.Agent.WorkingDirectory == "" {
			return fmt.Errorf("agent.workingDirectory is required")
		}
		if cfg.Agent.Agent == "" {
			return fmt.Errorf("agent.agent is required")
		}
		agentType := strings.ToLower(cfg.Agent.Agent)
		if agentType != "cursor" && agentType != "gemini" {
			return fmt.Errorf("agent.agent must be 'cursor' or 'gemini'")
		}
	}
	return nil
}

// ReadConfig reads and validates config.yaml and returns parsed config + path.
func ReadConfig() (*Config, string, error) {
	path := FindConfigPath()
	if path == "" {
		return nil, "", fmt.Errorf("config not found")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, "", err
	}
	cfg, err := parseConfig(data)
	if err != nil {
		return nil, "", err
	}
	return &cfg, path, nil
}

// Roots returns all configured roots for resource browsing from config.yaml.
// Returns empty slice if config is missing or has no filesystem entries.
func Roots() []model.Root {
	cfg, path, err := ReadConfig()
	if err != nil {
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

	// Add infrastructure root when configured
	if InfrastructureConfigured() {
		infraPath := InfrastructurePath()
		if infraPath != "" {
			roots = append(roots, model.Root{ID: "infra", Label: "Infrastructure", Path: infraPath})
		}
	}

	return roots
}

// Databases returns configured database resources from config.yaml.
func Databases() []DatabaseEntry {
	out, err := DatabasesWithError()
	if err != nil {
		return nil
	}
	return out
}

// DatabasesWithError returns configured database resources and preserves load errors.
func DatabasesWithError() ([]DatabaseEntry, error) {
	cfg, _, err := ReadConfig()
	if err != nil {
		return nil, err
	}
	out := make([]DatabaseEntry, 0, len(cfg.Resources.Databases))
	for _, e := range cfg.Resources.Databases {
		if e.ID == "" || e.URL == "" {
			continue
		}
		if e.Label == "" {
			e.Label = e.ID
		}
		out = append(out, e)
	}
	return out, nil
}

// DatabasesFromRawConfig returns database entries from config without env interpolation.
// Use when ReadConfig fails (e.g. missing env vars) but we still need to generate
// connection blocks for flows. DatabaseURLOrEnv can resolve env var names or raw URLs.
func DatabasesFromRawConfig() ([]DatabaseEntry, error) {
	rawData, err := ReadConfigRaw()
	if err != nil {
		return nil, err
	}
	cfg, err := parseConfigRaw(rawData)
	if err != nil {
		return nil, err
	}
	out := make([]DatabaseEntry, 0, len(cfg.Resources.Databases))
	for _, e := range cfg.Resources.Databases {
		if e.ID == "" || e.URL == "" {
			continue
		}
		if e.Label == "" {
			e.Label = e.ID
		}
		out = append(out, e)
	}
	return out, nil
}

// RestResources returns configured REST resources from config.yaml.
func RestResources() []RestEntry {
	out, err := RestResourcesWithError()
	if err != nil {
		return nil
	}
	return out
}

// RestResourcesWithError returns configured REST resources and preserves load errors.
func RestResourcesWithError() ([]RestEntry, error) {
	cfg, _, err := ReadConfig()
	if err != nil {
		return nil, err
	}
	out := make([]RestEntry, 0, len(cfg.Resources.Rest))
	for _, e := range cfg.Resources.Rest {
		if e.ID == "" || e.BaseURL == "" {
			continue
		}
		if e.Label == "" {
			e.Label = e.ID
		}
		out = append(out, e)
	}
	return out, nil
}

// SchemaEntries returns configured schema entries from config.yaml.
// Entries with empty id or type are skipped. Empty label defaults to id.
// Returns nil when config cannot be read.
func SchemaEntries() []SchemaEntry {
	cfg, _, err := ReadConfig()
	if err != nil {
		return nil
	}
	out := make([]SchemaEntry, 0, len(cfg.Resources.Schemas))
	for _, e := range cfg.Resources.Schemas {
		if e.ID == "" || e.Type == "" {
			continue
		}
		if e.Label == "" {
			e.Label = e.ID
		}
		out = append(out, e)
	}
	return out
}

// SchemaByID returns the schema entry for the given id, or nil if not found.
func SchemaByID(id string) *SchemaEntry {
	for _, e := range SchemaEntries() {
		if e.ID == id {
			c := e
			return &c
		}
	}
	return nil
}

// Workspaces returns configured flow workspaces from config.yaml.
func Workspaces() []WorkspaceEntry {
	out, _ := WorkspacesWithError()
	return out
}

// WorkspacesWithError returns configured Flowpipe workspace profiles.
func WorkspacesWithError() ([]WorkspaceEntry, error) {
	cfg, _, err := ReadConfig()
	if err != nil {
		return nil, err
	}
	workspaces := []WorkspaceEntry{}
	if cfg.Flows != nil {
		workspaces = cfg.Flows.Workspaces
	}
	out := make([]WorkspaceEntry, 0, len(workspaces))
	for _, e := range workspaces {
		if e.ID == "" {
			continue
		}
		label := e.Label
		if label == "" {
			label = e.ID
		}
		url := e.FlowpipeURL
		if url == "" {
			url = "http://localhost:7103"
		}
		out = append(out, WorkspaceEntry{ID: e.ID, Label: label, FlowpipeURL: url})
	}
	return out, nil
}

// WorkspaceByID returns the workspace entry for the given ID, or nil if not found.
func WorkspaceByID(id string) *WorkspaceEntry {
	for _, w := range Workspaces() {
		if w.ID == id {
			return &w
		}
	}
	return nil
}

// RootStatus represents a filesystem root for status display (includes path).
type RootStatus struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Path      string `json:"path"`
	Available bool   `json:"available"`
	Error     string `json:"error,omitempty"`
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
	if _, err := parseConfig(data); err != nil {
		return err
	}
	path := FindConfigPath()
	if path == "" {
		path = ConfigWritePath()
	}
	return os.WriteFile(path, data, 0644)
}

// ConfigDir returns the directory containing config.yaml, or empty if config not found.
func ConfigDir() string {
	path := FindConfigPath()
	if path == "" {
		return ""
	}
	return filepath.Dir(path)
}

// FlowsConfigured returns true if flows are configured (path or workspaces) in config.
// Uses raw config so it works even when ReadConfig fails (e.g. missing env vars).
func FlowsConfigured() bool {
	rawData, err := ReadConfigRaw()
	if err != nil {
		return false
	}
	cfg, err := parseConfigRaw(rawData)
	if err != nil {
		return false
	}
	if cfg.Flows == nil {
		return false
	}
	if cfg.Flows.Path != "" {
		return true
	}
	return len(cfg.Flows.Workspaces) > 0
}

// FlowsPath returns the absolute path to the flows directory.
// Defaults to ./flows relative to config dir.
// When ReadConfig fails (e.g. missing env vars), falls back to ./flows relative to config file.
func FlowsPath() string {
	cfg, path, err := ReadConfig()
	if err == nil {
		baseDir := filepath.Dir(path)
		p := "flows"
		if cfg.Flows != nil && cfg.Flows.Path != "" {
			p = cfg.Flows.Path
		}
		if !filepath.IsAbs(p) {
			p = filepath.Join(baseDir, p)
		}
		abs, _ := filepath.Abs(p)
		return abs
	}
	// Fallback when ReadConfig fails (e.g. missing env vars): use ./flows relative to config
	configPath := FindConfigPath()
	if configPath == "" {
		return ""
	}
	baseDir := filepath.Dir(configPath)
	p := filepath.Join(baseDir, "flows")
	abs, _ := filepath.Abs(p)
	return abs
}

// InfrastructureConfigured returns true if infrastructure is configured in config.
func InfrastructureConfigured() bool {
	rawData, err := ReadConfigRaw()
	if err != nil {
		return false
	}
	cfg, err := parseConfigRaw(rawData)
	if err != nil {
		return false
	}
	return cfg.Infrastructure != nil && cfg.Infrastructure.Path != ""
}

// InfrastructurePath returns the absolute path to the infrastructure (Terraform) directory.
// Defaults to ./workspace/infra relative to config dir.
func InfrastructurePath() string {
	cfg, path, err := ReadConfig()
	if err == nil {
		baseDir := filepath.Dir(path)
		p := "workspace/infra"
		if cfg.Infrastructure != nil && cfg.Infrastructure.Path != "" {
			p = cfg.Infrastructure.Path
		}
		if !filepath.IsAbs(p) {
			p = filepath.Join(baseDir, p)
		}
		abs, _ := filepath.Abs(p)
		return abs
	}
	configPath := FindConfigPath()
	if configPath == "" {
		return ""
	}
	baseDir := filepath.Dir(configPath)
	p := filepath.Join(baseDir, "workspace", "infra")
	abs, _ := filepath.Abs(p)
	return abs
}

// FlowpipeURLForWorkspace returns the Flowpipe server URL for the given workspace profile.
func FlowpipeURLForWorkspace(workspaceID string) string {
	w := WorkspaceByID(workspaceID)
	if w != nil && w.FlowpipeURL != "" {
		return w.FlowpipeURL
	}
	return "http://localhost:7103"
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
// Uses embedded copy when the file is not found on disk (e.g. in deployed builds).
func ReadExampleConfig() ([]byte, error) {
	data, err := os.ReadFile(ExampleConfigPath())
	if err == nil {
		return data, nil
	}
	return embeddedExampleConfig, nil
}

// ReadConfigRaw returns config.yaml content if present.
func ReadConfigRaw() ([]byte, error) {
	path := FindConfigPath()
	if path == "" {
		return nil, os.ErrNotExist
	}
	return os.ReadFile(path)
}

// parseConfigRaw parses config YAML without env interpolation.
// Used when we need to extract env var names from URLs (e.g. for flow HCL generation).
func parseConfigRaw(data []byte) (Config, error) {
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return Config{}, err
	}
	if err := validateConfig(cfg); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// DatabaseURLOrEnv returns either the env var name (if URL contains ${VAR}) or the URL.
// When the raw URL has ${VAR}, returns envVar and useResolved=false.
// When the raw URL has no ${VAR}, returns useResolved=true and the URL (from interpolated config if available, else raw).
func DatabaseURLOrEnv(dbID string) (envVar string, useResolved bool, resolvedURL string) {
	rawData, err := ReadConfigRaw()
	if err != nil {
		return "", false, ""
	}
	rawCfg, err := parseConfigRaw(rawData)
	if err != nil {
		return "", false, ""
	}
	for _, d := range rawCfg.Resources.Databases {
		if d.ID == dbID {
			matches := EnvVarPattern().FindStringSubmatch(d.URL)
			if len(matches) >= 2 {
				return matches[1], false, ""
			}
			// No env var: use URL. Prefer interpolated (in case of other ${VAR} in URL), else raw.
			if interpCfg, _, err := ReadConfig(); err == nil {
				for _, ic := range interpCfg.Resources.Databases {
					if ic.ID == dbID {
						return "", true, ic.URL
					}
				}
			}
			return "", true, d.URL
		}
	}
	return "", false, ""
}

// RootsStatus returns configured roots with paths for status display.
func RootsStatus() []RootStatus {
	roots := Roots()
	out := make([]RootStatus, 0, len(roots))
	for _, r := range roots {
		available, checkErr := checkFilesystemRoot(r.Path)
		status := RootStatus{
			ID:        r.ID,
			Label:     r.Label,
			Path:      r.Path,
			Available: available,
		}
		if checkErr != nil {
			status.Error = checkErr.Error()
		}
		out = append(out, status)
	}
	return out
}

func checkFilesystemRoot(path string) (bool, error) {
	info, err := os.Stat(path)
	if err != nil {
		return false, err
	}
	if !info.IsDir() {
		return false, fmt.Errorf("path is not a directory")
	}
	if _, err := os.ReadDir(path); err != nil {
		return false, err
	}
	return true, nil
}
