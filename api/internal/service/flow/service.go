package flow

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/0x1d/bench/api/internal/config"
	"github.com/0x1d/bench/api/internal/model"
)

var (
	idChars = regexp.MustCompile(`^[a-z0-9_-]+$`)
)

const (
	modContent = `mod "bench_flows" {
  title       = "Bench Flows"
  description = "Flows created in Bench"
}
`
)

// Service provides flow persistence and HCL generation.
type Service struct{}

// NewService creates a new flow service.
func NewService() *Service {
	return &Service{}
}

// List returns all flows.
func (s *Service) List() ([]model.Flow, error) {
	dir := config.FlowsPath()
	if dir == "" {
		return nil, fmt.Errorf("flows path not configured")
	}
	if err := s.ensureDir(dir); err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var flows []model.Flow
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".json")
		if !strings.HasPrefix(id, "flow_") {
			continue
		}
		flow, err := s.Get(id)
		if err != nil {
			continue
		}
		flows = append(flows, *flow)
	}
	return flows, nil
}

// SyncFromJSON regenerates .fp files from existing .json files.
// Call on startup to fix stale .fp when JSON was edited outside the API.
func (s *Service) SyncFromJSON() error {
	dir := config.FlowsPath()
	if dir == "" {
		return nil
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") || !strings.HasPrefix(e.Name(), "flow_") {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".json")
		flow, err := s.Get(id)
		if err != nil {
			continue
		}
		if err := s.Save(flow); err != nil {
			// Log but don't fail; other flows may still sync
			continue
		}
	}
	return nil
}

// Get returns a flow by ID.
func (s *Service) Get(id string) (*model.Flow, error) {
	if !s.validID(id) {
		return nil, fmt.Errorf("invalid flow id: %s", id)
	}
	path := s.jsonPath(id)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("flow not found: %s", id)
		}
		return nil, err
	}
	var flow model.Flow
	if err := json.Unmarshal(data, &flow); err != nil {
		return nil, err
	}
	return &flow, nil
}

// Save persists a flow and generates the .fp file.
func (s *Service) Save(flow *model.Flow) error {
	if flow == nil {
		return fmt.Errorf("flow is nil")
	}
	if flow.ID == "" {
		flow.ID = s.generateID()
	}
	if !s.validID(flow.ID) {
		return fmt.Errorf("invalid flow id: %s", flow.ID)
	}
	if flow.Name == "" {
		flow.Name = flow.ID
	}

	dir := config.FlowsPath()
	if dir == "" {
		return fmt.Errorf("flows path not configured")
	}
	if err := s.ensureDir(dir); err != nil {
		return err
	}

	// Write JSON
	jsonData, err := json.MarshalIndent(flow, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(s.jsonPath(flow.ID), jsonData, 0644); err != nil {
		return err
	}

	// Generate and write HCL
	hcl, err := s.generateHCL(flow)
	if err != nil {
		return err
	}
	if err := os.WriteFile(s.fpPath(flow.ID), []byte(hcl), 0644); err != nil {
		return err
	}

	// Update connections.fpc with connection blocks for databases used in flows
	if err := s.updateConnectionsFPC(dir); err != nil {
		return err
	}

	return nil
}

// Delete removes a flow.
func (s *Service) Delete(id string) error {
	if !s.validID(id) {
		return fmt.Errorf("invalid flow id: %s", id)
	}
	dir := config.FlowsPath()
	for _, p := range []string{s.jsonPath(id), s.fpPath(id)} {
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	if dir != "" {
		_ = s.updateConnectionsFPC(dir)
	}
	return nil
}

// generateHCL produces Flowpipe pipeline HCL from a flow.
func (s *Service) generateHCL(flow *model.Flow) (string, error) {
	var b strings.Builder
	pipelineName := s.pipelineName(flow.ID)
	b.WriteString(fmt.Sprintf("pipeline %q {\n", pipelineName))
	if flow.Name != "" {
		b.WriteString(fmt.Sprintf("  title = %q\n\n", flow.Name))
	}

	// Emit param blocks from input steps (defines pipeline parameters).
	// Input is virtual: it only contributes params to the pipeline, not a step block.
	for _, step := range flow.Steps {
		if strings.EqualFold(step.Type, "input") {
			hcl, err := s.stepInput(step)
			if err != nil {
				return "", err
			}
			b.WriteString(hcl)
		}
	}

	stepIDs := make(map[string]bool)
	for _, step := range flow.Steps {
		stepIDs[step.ID] = true
	}

	for _, step := range flow.Steps {
		// Input is virtual: it only contributes param blocks (emitted above), not step blocks.
		if strings.EqualFold(step.Type, "input") {
			continue
		}
		switch strings.ToLower(step.Type) {
		case "http":
			hcl, err := s.stepHTTP(step)
			if err != nil {
				return "", err
			}
			b.WriteString(hcl)
		case "query":
			hcl, err := s.stepQuery(step)
			if err != nil {
				return "", err
			}
			b.WriteString(hcl)
		default:
			return "", fmt.Errorf("unsupported step type: %s", step.Type)
		}
	}

	b.WriteString("\n  output \"result\" {\n")
	last := s.lastExecutableStep(flow.Steps)
	if last != nil {
		switch last.Type {
		case "query":
			b.WriteString(fmt.Sprintf("    value = step.query.%s.rows\n", last.ID))
		case "http":
			b.WriteString(fmt.Sprintf("    value = step.http.%s.response_body\n", last.ID))
		default:
			b.WriteString(fmt.Sprintf("    value = step.%s.%s\n", stepTypeKey(last.Type), last.ID))
		}
	} else {
		b.WriteString("    value = null\n")
	}
	b.WriteString("  }\n}\n")
	return b.String(), nil
}

func (s *Service) lastExecutableStep(steps []model.FlowStep) *model.FlowStep {
	for i := len(steps) - 1; i >= 0; i-- {
		if !strings.EqualFold(steps[i].Type, "input") {
			return &steps[i]
		}
	}
	return nil
}

func (s *Service) stepInput(step model.FlowStep) (string, error) {
	params, _ := step.Config["params"].([]any)
	if len(params) == 0 {
		return "", nil
	}
	var b strings.Builder
	for _, p := range params {
		pm, ok := p.(map[string]any)
		if !ok {
			continue
		}
		name, _ := pm["name"].(string)
		if name == "" {
			continue
		}
		paramType, _ := pm["type"].(string)
		if paramType == "" {
			paramType = "any"
		}
		desc, _ := pm["description"].(string)
		def, hasDef := pm["default"]
		b.WriteString(fmt.Sprintf("  param %q {\n", name))
		b.WriteString(fmt.Sprintf("    type = %q\n", paramType))
		if desc != "" {
			b.WriteString(fmt.Sprintf("    description = %q\n", strings.ReplaceAll(desc, `\`, `\\`)))
		}
		if hasDef && def != nil && def != "" {
			switch v := def.(type) {
			case string:
				b.WriteString(fmt.Sprintf("    default = %q\n", strings.ReplaceAll(v, `\`, `\\`)))
			case float64:
				b.WriteString(fmt.Sprintf("    default = %v\n", v))
			case bool:
				b.WriteString(fmt.Sprintf("    default = %v\n", v))
			}
		}
		b.WriteString("  }\n\n")
	}
	return b.String(), nil
}

func (s *Service) stepHTTP(step model.FlowStep) (string, error) {
	restID, _ := step.Config["restId"].(string)
	method, _ := step.Config["method"].(string)
	path, _ := step.Config["path"].(string)
	body, _ := step.Config["body"].(string)

	if restID == "" {
		restID = "__unconfigured__"
	}
	if method == "" {
		method = "GET"
	}
	if path == "" {
		path = "/"
	}

	// HCL: jsonencode({ method = "GET", path = "/...", body = "..." })
	bodyArg := ""
	if body != "" {
		bodyArg = fmt.Sprintf(`, body = %q`, strings.ReplaceAll(body, `\`, `\\`))
	}
	proxyObj := fmt.Sprintf(`{ method = %q, path = %q%s }`, strings.ToUpper(method), path, bodyArg)

	var b strings.Builder
	b.WriteString(fmt.Sprintf("  step \"http\" %q {\n", step.ID))
	b.WriteString(`    url    = "${env("BENCH_API_URL")}/api/rest/` + restID + `/proxy"` + "\n")
	b.WriteString("    method = \"post\"\n")
	b.WriteString("    request_body = jsonencode(" + proxyObj + ")\n")
	b.WriteString("  }\n\n")
	return b.String(), nil
}

func (s *Service) stepQuery(step model.FlowStep) (string, error) {
	sql, _ := step.Config["sql"].(string)
	dbID, _ := step.Config["databaseId"].(string)
	argsRaw, _ := step.Config["args"]

	if sql == "" {
		sql = "SELECT 1"
	}
	if dbID == "" {
		dbID = s.defaultDatabaseID()
	}
	if dbID == "" {
		return "", fmt.Errorf("step %s: no database configured; select a database in step config", step.ID)
	}

	envVar, useResolved, resolvedURL := config.DatabaseURLOrEnv(dbID)
	var databaseArg string
	if envVar != "" || (useResolved && resolvedURL != "") {
		databaseArg = fmt.Sprintf("connection.postgres.%s", dbID)
	} else {
		// Config not loaded or database not in config: still emit connection reference
		// so the .fp is generated; user can define the connection in connections.fpc
		databaseArg = fmt.Sprintf("connection.postgres.%s", dbID)
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("  step \"query\" %q {\n", step.ID))
	b.WriteString(fmt.Sprintf("    sql      = %q\n", strings.ReplaceAll(sql, `"`, `\"`)))
	b.WriteString(fmt.Sprintf("    database = %s\n", databaseArg))
	if argsRaw != nil {
		if args, ok := argsRaw.([]any); ok && len(args) > 0 {
			argStrs := make([]string, 0, len(args))
			for _, a := range args {
				s, ok := a.(string)
				if !ok {
					continue
				}
				if strings.HasPrefix(s, "param.") || strings.HasPrefix(s, "step.") {
					argStrs = append(argStrs, s)
				} else {
					escaped := strings.ReplaceAll(s, `\`, `\\`)
					escaped = strings.ReplaceAll(escaped, `"`, `\"`)
					argStrs = append(argStrs, fmt.Sprintf("%q", escaped))
				}
			}
			if len(argStrs) > 0 {
				b.WriteString("    args     = [" + strings.Join(argStrs, ", ") + "]\n")
			}
		}
	}
	b.WriteString("  }\n\n")
	return b.String(), nil
}

func parsePostgresURL(s string) (host string, port int, username, password, db string) {
	u, err := url.Parse(s)
	if err != nil {
		return "", 0, "", "", ""
	}
	if u.Scheme != "postgres" && u.Scheme != "postgresql" {
		return "", 0, "", "", ""
	}
	host = u.Hostname()
	if p, err := strconv.Atoi(u.Port()); err == nil {
		port = p
	} else if u.Port() == "" {
		port = 5432
	}
	if u.User != nil {
		username = u.User.Username()
		password, _ = u.User.Password()
	}
	db = strings.TrimPrefix(u.Path, "/")
	return host, port, username, password, db
}

func (s *Service) updateConnectionsFPC(dir string) error {
	dbs, err := config.DatabasesWithError()
	if err != nil || len(dbs) == 0 {
		// Fallback: use raw config when ReadConfig fails (e.g. missing env vars).
		// This allows generating connection blocks so flows with database steps can save.
		dbs, err = config.DatabasesFromRawConfig()
		if err != nil || len(dbs) == 0 {
			return nil
		}
	}

	// Collect database IDs used in any flow
	used := make(map[string]bool)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") || !strings.HasPrefix(e.Name(), "flow_") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		var flow model.Flow
		if err := json.Unmarshal(data, &flow); err != nil {
			continue
		}
		for _, step := range flow.Steps {
			if step.Type != "query" {
				continue
			}
			dbID, _ := step.Config["databaseId"].(string)
			if dbID == "" {
				dbID = s.defaultDatabaseID()
			}
			if dbID != "" {
				used[dbID] = true
			}
		}
	}

	var b strings.Builder
	b.WriteString("# Auto-generated by Bench. Maps bench database resources to Flowpipe connections.\n")
	b.WriteString("# Uses connection_string when available; otherwise individual host/port/user/db args from parsed URL.\n\n")
	for _, d := range dbs {
		if !used[d.ID] {
			continue
		}
		envVar, useResolved, resolvedURL := config.DatabaseURLOrEnv(d.ID)
		if envVar != "" {
			b.WriteString(fmt.Sprintf("connection \"postgres\" %q {\n", d.ID))
			b.WriteString(fmt.Sprintf("  connection_string = env(%q)\n", envVar))
			b.WriteString("}\n\n")
		} else if useResolved && resolvedURL != "" {
			if host, port, username, password, db := parsePostgresURL(resolvedURL); host != "" || username != "" || db != "" {
				b.WriteString(fmt.Sprintf("connection \"postgres\" %q {\n", d.ID))
				if host != "" {
					b.WriteString(fmt.Sprintf("  host     = %q\n", host))
				}
				if port > 0 {
					b.WriteString(fmt.Sprintf("  port     = %d\n", port))
				}
				if username != "" {
					b.WriteString(fmt.Sprintf("  username = %q\n", username))
				}
				if password != "" {
					b.WriteString(fmt.Sprintf("  password = %q\n", strings.ReplaceAll(password, `\`, `\\`)))
				}
				if db != "" {
					b.WriteString(fmt.Sprintf("  db       = %q\n", db))
				}
				b.WriteString("}\n\n")
			} else {
				// Fallback: use connection string literal
				escaped := strings.ReplaceAll(resolvedURL, `\`, `\\`)
				escaped = strings.ReplaceAll(escaped, `"`, `\"`)
				b.WriteString(fmt.Sprintf("connection \"postgres\" %q {\n", d.ID))
				b.WriteString(fmt.Sprintf("  connection_string = %q\n", escaped))
				b.WriteString("}\n\n")
			}
		}
	}

	fpcPath := filepath.Join(dir, "connections.fpc")
	if b.Len() <= 100 {
		// No connections to write
		_ = os.Remove(fpcPath)
		return nil
	}
	return os.WriteFile(fpcPath, []byte(strings.TrimSuffix(b.String(), "\n\n")+"\n"), 0644)
}

func (s *Service) defaultDatabaseID() string {
	dbs, err := config.DatabasesWithError()
	if err != nil || len(dbs) == 0 {
		return ""
	}
	for _, d := range dbs {
		if d.Default {
			return d.ID
		}
	}
	return dbs[0].ID
}

func (s *Service) ensureDir(dir string) error {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	modPath := filepath.Join(dir, "mod.fp")
	if _, err := os.Stat(modPath); os.IsNotExist(err) {
		return os.WriteFile(modPath, []byte(modContent), 0644)
	}
	return nil
}

func (s *Service) jsonPath(id string) string {
	return filepath.Join(config.FlowsPath(), id+".json")
}

func (s *Service) fpPath(id string) string {
	return filepath.Join(config.FlowsPath(), s.pipelineName(id)+".fp")
}

func (s *Service) pipelineName(id string) string {
	return id
}

func (s *Service) validID(id string) bool {
	return strings.HasPrefix(id, "flow_") && len(id) > 6 && idChars.MatchString(id)
}

func (s *Service) generateID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return "flow_" + hex.EncodeToString(b)
}

func stepTypeKey(t string) string {
	switch t {
	case "http":
		return "http"
	case "query":
		return "query"
	default:
		return t
	}
}
