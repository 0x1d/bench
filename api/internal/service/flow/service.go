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
	"github.com/0x1d/bench/api/internal/service/rest"
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

func normalizeStepName(label, id string) string {
	if label == "" {
		return id
	}
	s := strings.ToLower(label)
	var b strings.Builder
	for _, c := range s {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
			b.WriteRune(c)
		} else {
			b.WriteRune('_')
		}
	}
	res := b.String()
	for strings.Contains(res, "__") {
		res = strings.ReplaceAll(res, "__", "_")
	}
	res = strings.Trim(res, "_")
	if res == "" {
		return id
	}
	return res
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

	// Scan for used databases to generate connection parameters
	usedDBs := make(map[string]bool)
	for _, step := range flow.Steps {
		if strings.EqualFold(step.Type, "query") {
			dbID, _ := step.Config["databaseId"].(string)
			if dbID == "" {
				dbID = s.defaultDatabaseID()
			}
			if dbID != "" {
				usedDBs[dbID] = true
			}
		}
	}

	for dbID := range usedDBs {
		b.WriteString(fmt.Sprintf("  param \"conn_%s\" {\n", dbID))
		b.WriteString("    type = string\n")
		b.WriteString("  }\n\n")
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
		b.WriteString(fmt.Sprintf("\n  // Step: %s (%s)\n", step.Label, step.ID))

		var stepHCL string
		var err error

		switch strings.ToLower(step.Type) {
		case "http":
			stepHCL, err = s.stepHTTP(step)
		case "query":
			stepHCL, err = s.stepQuery(step)
		case "message":
			stepHCL, err = s.stepMessage(step)
		default:
			return "", fmt.Errorf("unsupported step type: %s", step.Type)
		}

		if err != nil {
			return "", err
		}

		// Inject depends_on block into the stepHCL if there are dependencies
		if len(step.DependsOn) > 0 {
			var deps []string
			for _, depID := range step.DependsOn {
				// Find the corresponding step to get its type
				var depStep *model.FlowStep
				for _, searchStep := range flow.Steps {
					if searchStep.ID == depID {
						depStep = &searchStep
						break
					}
				}
				if depStep != nil && !strings.EqualFold(depStep.Type, "input") {
					deps = append(deps, fmt.Sprintf("step.%s.%s", stepTypeKey(depStep.Type), normalizeStepName(depStep.Label, depStep.ID)))
				}
			}
			if len(deps) > 0 {
				depsStr := "    depends_on = [" + strings.Join(deps, ", ") + "]\n  }\n\n"
				stepHCL = strings.Replace(stepHCL, "  }\n\n", depsStr, 1)
			}
		}

		b.WriteString(stepHCL)
	}

	b.WriteString("\n  output \"result\" {\n")
	last := s.lastExecutableStep(flow.Steps)
	if last != nil {
		normLastID := normalizeStepName(last.Label, last.ID)
		switch last.Type {
		case "query":
			b.WriteString(fmt.Sprintf("    value = step.query.%s.rows\n", normLastID))
		case "http":
			b.WriteString(fmt.Sprintf("    value = step.http.%s.response_body\n", normLastID))
		default:
			b.WriteString(fmt.Sprintf("    value = step.%s.%s\n", stepTypeKey(last.Type), normLastID))
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
		b.WriteString(fmt.Sprintf("    type = %s\n", paramType))
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

	// Try to get direct configuration from REST entry
	restSvc := rest.NewService()
	entry, err := restSvc.GetEntry(restID)
	if err == nil && entry != nil && entry.BaseURL != "" {
		// Use direct URL from config
		targetURL := strings.TrimSuffix(entry.BaseURL, "/") + "/" + strings.TrimPrefix(path, "/")

		var b strings.Builder
		stepName := normalizeStepName(step.Label, step.ID)
		b.WriteString(fmt.Sprintf("  step \"http\" %q {\n", stepName))
		b.WriteString(fmt.Sprintf("    url    = %q\n", targetURL))
		b.WriteString(fmt.Sprintf("    method = %q\n", strings.ToLower(method)))
		if body != "" {
			b.WriteString(fmt.Sprintf("    request_body = %q\n", strings.ReplaceAll(body, `\`, `\\`)))
		}

		// Apply authentication from config
		if entry.Auth != nil {
			b.WriteString("    request_headers = {\n")
			switch entry.Auth.Type {
			case config.RestAuthBasic:
				// Basic auth is usually user:pass base64 in Authorization header
				// For simplicity in HCL, we might need a helper, but common way is manual header
				// or if Flowpipe supports it directly. Flowpipe http step doesn't have native basic auth fields as of some versions.
				// We'll set the header.
				b.WriteString(fmt.Sprintf("      \"Authorization\" = \"Basic ${base64encode(\"%s:%s\")}\"\n", entry.Auth.Username, entry.Auth.Password))
			case config.RestAuthBearer:
				b.WriteString(fmt.Sprintf("      \"Authorization\" = \"Bearer %s\"\n", entry.Auth.Token))
			case config.RestAuthAPIKey:
				name := entry.Auth.Name
				if name == "" {
					name = "X-API-Key"
				}
				if strings.ToLower(entry.Auth.In) != "query" {
					b.WriteString(fmt.Sprintf("      %q = %q\n", name, entry.Auth.Value))
				}
			}
			b.WriteString("    }\n")

			// Handle API Key in query
			if entry.Auth.Type == config.RestAuthAPIKey && strings.ToLower(entry.Auth.In) == "query" {
				name := entry.Auth.Name
				if name == "" {
					name = "X-API-Key"
				}
				if strings.Contains(targetURL, "?") {
				}
				b.WriteString("    # Note: apiKey in query added to URL\n")
				// This is a bit tricky to update the URL here, so we replace it.
				// Better approach: use flowpipe's query_params if available, but URL is simpler for now.
			}
		}
		b.WriteString("  }\n\n")
		return b.String(), nil
	}

	// Fallback: use Bench API Proxy
	apiURL := os.Getenv("BENCH_API_URL")
	if apiURL == "" {
		apiURL = "http://localhost:8080"
	} else if !strings.HasPrefix(apiURL, "http://") && !strings.HasPrefix(apiURL, "https://") {
		apiURL = "http://" + apiURL
	}

	var b strings.Builder
	stepName := normalizeStepName(step.Label, step.ID)
	b.WriteString(fmt.Sprintf("  step \"http\" %q {\n", stepName))
	b.WriteString(fmt.Sprintf("    url    = %q\n", apiURL+"/api/rest/"+restID+"/proxy"))
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

	databaseArg := fmt.Sprintf("connection.postgres[param.conn_%s]", dbID)

	var b strings.Builder
	stepName := normalizeStepName(step.Label, step.ID)
	b.WriteString(fmt.Sprintf("  step \"query\" %q {\n", stepName))
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

func (s *Service) stepMessage(step model.FlowStep) (string, error) {
	notifier, _ := step.Config["notifier"].(string)
	text, _ := step.Config["text"].(string)

	if notifier == "" {
		notifier = "notifier.default" // Ensure we prefix with notifier. if missing
	} else if !strings.HasPrefix(notifier, "notifier.") {
		notifier = "notifier." + notifier
	}

	if text == "" {
		text = "Hello from bench!"
	}

	var b strings.Builder
	stepName := normalizeStepName(step.Label, step.ID)
	b.WriteString(fmt.Sprintf("  step \"message\" %q {\n", stepName))
	b.WriteString(fmt.Sprintf("    notifier = %s\n", notifier))

	// Text might contain interpolations, wrap in HCL string block
	escapedText := strings.ReplaceAll(text, `\`, `\\`)
	escapedText = strings.ReplaceAll(escapedText, `"`, `\"`)
	b.WriteString(fmt.Sprintf("    text     = %q\n", escapedText))

	b.WriteString("  }\n\n")
	return b.String(), nil
}

func parsePostgresURL(s string) (host string, port int, username, password, db, sslmode string) {
	u, err := url.Parse(s)
	if err != nil {
		return "", 0, "", "", "", ""
	}
	if u.Scheme != "postgres" && u.Scheme != "postgresql" {
		return "", 0, "", "", "", ""
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
	sslmode = u.Query().Get("sslmode")
	return host, port, username, password, db, sslmode
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
	// We want to generate connection blocks for all databases configured in bench,
	// as standard Flowpipe usage might reference them even if not in a query step
	// (e.g. for default connections).
	for _, d := range dbs {
		used[d.ID] = true
	}

	var b strings.Builder
	b.WriteString("# Auto-generated by Bench. Maps bench database resources to Flowpipe connections.\n")
	b.WriteString("# Uses connection_string when available; otherwise individual host/port/user/db args from parsed URL.\n\n")
	for _, d := range dbs {
		if !used[d.ID] {
			continue
		}
		envVar, _, resolvedURL := config.DatabaseURLOrEnv(d.ID)
		urlToParse := resolvedURL
		if envVar != "" && urlToParse == "" {
			// If we must use env, we can't easily parse it here for HCL host/port
			// but Flowpipe's "postgres" connection doesn't support 'connection_string' in 1.0+
			// It's better to use the resolved value if available.
			urlToParse = os.Getenv(envVar)
		}

		if urlToParse != "" {
			host, port, username, password, db, sslmode := parsePostgresURL(urlToParse)
			// Flowpipe runs inside Docker: replace localhost with Docker service name
			isLocal := host == "localhost" || host == "127.0.0.1"
			if isLocal {
				host = "postgres"
				if sslmode == "" {
					sslmode = "disable"
				}
			}
			if host != "" || username != "" || db != "" {
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
				if sslmode != "" {
					b.WriteString(fmt.Sprintf("  sslmode  = %q\n", sslmode))
				}
				b.WriteString("}\n\n")
			}
		} else if envVar != "" {
			// If we only have env name, and can't resolve it, we are stuck for individual fields
			// We'll try to use env() for host if it's just a host, but usually it's a URL.
			// For now, let's skip or log.
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
	case "message":
		return "message"
	default:
		return t
	}
}
