package flow

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
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

	return nil
}

// Delete removes a flow.
func (s *Service) Delete(id string) error {
	if !s.validID(id) {
		return fmt.Errorf("invalid flow id: %s", id)
	}
	for _, p := range []string{s.jsonPath(id), s.fpPath(id)} {
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			return err
		}
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

	stepIDs := make(map[string]bool)
	for _, step := range flow.Steps {
		stepIDs[step.ID] = true
	}

	for _, step := range flow.Steps {
		switch step.Type {
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
	if len(flow.Steps) > 0 {
		last := flow.Steps[len(flow.Steps)-1]
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

func (s *Service) stepHTTP(step model.FlowStep) (string, error) {
	restID, _ := step.Config["restId"].(string)
	method, _ := step.Config["method"].(string)
	path, _ := step.Config["path"].(string)
	body, _ := step.Config["body"].(string)

	if restID == "" {
		return "", fmt.Errorf("step %s: restId required for http step", step.ID)
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

	if sql == "" {
		return "", fmt.Errorf("step %s: sql required for query step", step.ID)
	}
	if dbID == "" {
		return "", fmt.Errorf("step %s: databaseId required for query step", step.ID)
	}

	envVar := s.databaseEnvVar(dbID)
	if envVar == "" {
		return "", fmt.Errorf("step %s: database %s has no env var in URL", step.ID, dbID)
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("  step \"query\" %q {\n", step.ID))
	b.WriteString(fmt.Sprintf("    sql      = %q\n", strings.ReplaceAll(sql, `"`, `\"`)))
	b.WriteString(fmt.Sprintf("    database = env(%q)\n", envVar))
	b.WriteString("  }\n\n")
	return b.String(), nil
}

func (s *Service) databaseEnvVar(dbID string) string {
	dbs, err := config.DatabasesWithError()
	if err != nil {
		return ""
	}
	for _, d := range dbs {
		if d.ID == dbID {
			// Extract ${VAR} from URL
			matches := config.EnvVarPattern().FindStringSubmatch(d.URL)
			if len(matches) >= 2 {
				return matches[1]
			}
			return ""
		}
	}
	return ""
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
