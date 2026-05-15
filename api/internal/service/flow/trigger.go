package flow

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/0x1d/bench/api/internal/config"
	"github.com/0x1d/bench/api/internal/model"
	"github.com/0x1d/bench/api/internal/service/flow/hclgen"
)

var (
	// triggerBlockRe matches "trigger "type" "id" {" and captures type, id.
	// The body is extracted separately using balanced brace matching.
	triggerBlockRe = regexp.MustCompile(`(?m)^trigger\s+"(\w+)"\s+"([^"]+)"\s*\{`)
)

// CreateTrigger adds a new trigger to a module's mod.fp file.
func (s *Service) CreateTrigger(trigger *model.TriggerEntry) error {
	if trigger == nil {
		return fmt.Errorf("trigger is nil")
	}
	if trigger.ID == "" {
		return fmt.Errorf("trigger id is required")
	}
	if trigger.Module == "" {
		return fmt.Errorf("trigger module is required")
	}
	if trigger.Type == "" {
		return fmt.Errorf("trigger type is required")
	}
	if trigger.Config.Pipeline == "" {
		return fmt.Errorf("trigger config.pipeline is required")
	}

	dir := s.moduleFlowDir(trigger.Module)
	if dir == "" {
		return fmt.Errorf("module %q not found", trigger.Module)
	}

	// Check for duplicate trigger ID in same module
	flowTriggers, err := s.ListTriggers()
	if err != nil {
		return err
	}
	foundCount := 0
	for _, t := range flowTriggers {
		if t.Module == trigger.Module && t.ID == trigger.ID {
			foundCount++
		}
	}
	if foundCount > 1 {
		return fmt.Errorf("trigger %q already exists in module %q", trigger.ID, trigger.Module)
	}

	// Generate HCL trigger block
	hclBlock, err := buildTriggerHCLBlock(trigger)
	if err != nil {
		return fmt.Errorf("invalid trigger config: %w", err)
	}

	// Write to mod.fp in the module directory
	modPath := filepath.Join(dir, "mod.fp")

	var existingContent string
	if data, err := os.ReadFile(modPath); err == nil {
		existingContent = string(data)
	} else if !os.IsNotExist(err) {
		return err
	}

	// Remove existing trigger block if present (for upsert behavior)
	existingContent = removeTriggerBlock(existingContent, trigger.ID)

	// Add new trigger block
	if existingContent != "" && !strings.HasSuffix(strings.TrimSpace(existingContent), "\n") {
		existingContent += "\n"
	}
	existingContent += hclBlock + "\n"

	// Write atomically
	if err := hclgen.WriteFileAtomically(modPath, []byte(existingContent), 0644); err != nil {
		return err
	}

	// Persist metadata (label, workspace) to config.yaml
	if err := saveTriggerToConfig(trigger); err != nil {
		return fmt.Errorf("failed to save trigger metadata: %w", err)
	}

	s.touchRootMod()
	return nil
}

// BuildTriggerHCLBlock generates HCL for a trigger block.
func BuildTriggerHCLBlock(trigger *model.TriggerEntry) (string, error) {
	var b strings.Builder

	b.WriteString(fmt.Sprintf("trigger %q %q {\n", trigger.Type, trigger.ID))

	if trigger.Config.Description != "" {
		b.WriteString(fmt.Sprintf("  description = %q\n", trigger.Config.Description))
	}

	// Determine pipeline reference
	pipelineRef := trigger.Config.Pipeline
	if !strings.HasPrefix(pipelineRef, "pipeline.") {
		pipelineRef = "pipeline." + pipelineRef
	}
	b.WriteString(fmt.Sprintf("  pipeline    = %s\n", pipelineRef))

	// Add type-specific config
	switch trigger.Type {
	case model.TriggerTypeSchedule:
		if trigger.Config.Schedule != nil {
			if trigger.Config.Schedule.Cron != "" {
				b.WriteString(fmt.Sprintf("  schedule    = %q\n", trigger.Config.Schedule.Cron))
			}
			if trigger.Config.Schedule.Timezone != "" {
				b.WriteString(fmt.Sprintf("  timezone    = %q\n", trigger.Config.Schedule.Timezone))
			}
			if len(trigger.Config.Schedule.Args) > 0 {
				b.WriteString("  args = {\n")
				for k, v := range trigger.Config.Schedule.Args {
					b.WriteString(fmt.Sprintf("    %-20s = %q\n", k, v))
				}
				b.WriteString("  }\n")
			}
		}
	case model.TriggerTypeAlert:
		if trigger.Config.Alert != nil {
			if trigger.Config.Alert.Source != "" {
				source := trigger.Config.Alert.Source
				if !strings.HasPrefix(source, "notifier.") && !strings.HasPrefix(source, "connection.") {
					source = "notifier." + source
				}
				b.WriteString(fmt.Sprintf("  source      = %s\n", source))
			}
			if trigger.Config.Alert.Condition != "" {
				b.WriteString(fmt.Sprintf("  condition   = %q\n", trigger.Config.Alert.Condition))
			}
		}
	case model.TriggerTypeHTTP:
		if trigger.Config.HTTP != nil {
			if len(trigger.Config.HTTP.Args) > 0 {
				b.WriteString("  args = {\n")
				for k, v := range trigger.Config.HTTP.Args {
					b.WriteString(fmt.Sprintf("    %-20s = %s\n", k, v))
				}
				b.WriteString("  }\n")
			}
			if trigger.Config.HTTP.ExecutionMode != "" {
				b.WriteString(fmt.Sprintf("  execution_mode = %q\n", trigger.Config.HTTP.ExecutionMode))
			}
		}
	case model.TriggerTypeNotification:
		if trigger.Config.Notification != nil {
			if trigger.Config.Notification.Source != "" {
				source := trigger.Config.Notification.Source
				if !strings.HasPrefix(source, "notifier.") && !strings.HasPrefix(source, "connection.") {
					source = "notifier." + source
				}
				b.WriteString(fmt.Sprintf("  source      = %s\n", source))
			}
			if trigger.Config.Notification.Channel != "" {
				b.WriteString(fmt.Sprintf("  channel     = %q\n", trigger.Config.Notification.Channel))
			}
			if len(trigger.Config.Notification.Conditions) > 0 {
				var conditions []string
				for _, c := range trigger.Config.Notification.Conditions {
					conditions = append(conditions, fmt.Sprintf("%q", c))
				}
				b.WriteString(fmt.Sprintf("  conditions  = [%s]\n", strings.Join(conditions, ", ")))
			}
		}
	}

	b.WriteString("}\n")
	return b.String(), nil
}

// buildTriggerHCLBlock wrapper for internal use.
func buildTriggerHCLBlock(trigger *model.TriggerEntry) (string, error) {
	return BuildTriggerHCLBlock(trigger)
}

// UpdateTrigger updates an existing trigger in a module's mod.fp file.
func (s *Service) UpdateTrigger(trigger *model.TriggerEntry) error {
	if trigger == nil {
		return fmt.Errorf("trigger is nil")
	}
	if trigger.ID == "" {
		return fmt.Errorf("trigger id is required")
	}
	if trigger.Module == "" {
		return fmt.Errorf("trigger module is required")
	}

	// Check if trigger exists before updating
	triggers, err := s.ListTriggers()
	if err != nil {
		return err
	}
	found := false
	for _, t := range triggers {
		if t.Module == trigger.Module && t.ID == trigger.ID {
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("trigger %q not found in module %q", trigger.ID, trigger.Module)
	}

	// Delete the old trigger block and add the new one
	return s.CreateTrigger(trigger)
}

// DeleteTrigger removes a trigger from a module's mod.fp file.
func (s *Service) DeleteTrigger(moduleID, triggerID string) error {
	if moduleID == "" {
		return fmt.Errorf("module id is required")
	}
	if triggerID == "" {
		return fmt.Errorf("trigger id is required")
	}

	dir := s.moduleFlowDir(moduleID)
	if dir == "" {
		return fmt.Errorf("module %q not found", moduleID)
	}

	modPath := filepath.Join(dir, "mod.fp")
	data, err := os.ReadFile(modPath)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("trigger %q not found in module %q", triggerID, moduleID)
		}
		return err
	}

	content := string(data)
	newContent := removeTriggerBlock(content, triggerID)

	if newContent == content {
		return fmt.Errorf("trigger %q not found in module %q", triggerID, moduleID)
	}

	// Write back atomically
	if err := hclgen.WriteFileAtomically(modPath, []byte(newContent), 0644); err != nil {
		return err
	}

	// Remove from config.yaml
	if err := removeTriggerFromConfig(triggerID); err != nil {
		return fmt.Errorf("failed to remove trigger metadata: %w", err)
	}

	s.touchRootMod()
	return nil
}

// removeTriggerBlock removes a trigger block with the given ID from HCL content.
// Uses balanced brace matching to handle nested braces in body fields.
func removeTriggerBlock(content, triggerID string) string {
	lines := strings.Split(content, "\n")
	var result []string
	skipUntilBraceClose := false
	braceDepth := 0

	for _, line := range lines {
		if skipUntilBraceClose {
			// Count braces in this line
			for _, ch := range line {
				if ch == '{' {
					braceDepth++
				} else if ch == '}' {
					braceDepth--
					if braceDepth == 0 {
						skipUntilBraceClose = false
						break
					}
				}
			}
			continue
		}

		// Check if this line starts the trigger we want to remove
		if triggerBlockRe.MatchString(line) {
			matches := triggerBlockRe.FindStringSubmatch(line)
			if len(matches) >= 3 && matches[2] == triggerID {
				// Start skipping - find the opening brace
				skipUntilBraceClose = true
				braceDepth = 0
				for _, ch := range line {
					if ch == '{' {
						braceDepth++
					} else if ch == '}' {
						braceDepth--
						if braceDepth == 0 {
							skipUntilBraceClose = false
							break
						}
					}
				}
				if !skipUntilBraceClose {
					// Single line trigger block, already handled
				}
				continue
			}
		}
		result = append(result, line)
	}

	return strings.Join(result, "\n")
}

// TestTrigger simulates trigger execution by calling Flowpipe API to run the pipeline.
func (s *Service) TestTrigger(moduleID, triggerID string, payload map[string]any) (*model.TriggerTestResponse, error) {
	// Get the trigger to find the pipeline reference
	trigger, err := s.GetTrigger(moduleID, triggerID)
	if err != nil {
		return nil, fmt.Errorf("failed to get trigger: %w", err)
	}

	// Get the pipeline reference from trigger config
	pipelineRef := trigger.Config.Pipeline
	if pipelineRef == "" {
		return nil, fmt.Errorf("trigger has no pipeline reference")
	}

	// Ensure pipeline reference has "pipeline." prefix
	if !strings.HasPrefix(pipelineRef, "pipeline.") {
		pipelineRef = "pipeline." + strings.TrimPrefix(pipelineRef, "pipeline.")
	}

	// Get the workspace to determine Flowpipe URL
	defaultWorkspace := "default"
	if trigger.Workspace != "" {
		defaultWorkspace = trigger.Workspace
	}
	ws := config.WorkspaceByID(defaultWorkspace)
	if ws == nil && defaultWorkspace != "default" {
		return nil, fmt.Errorf("workspace not found: %s", defaultWorkspace)
	}

	flowpipeURL := "http://localhost:7103"
	if ws != nil && ws.FlowpipeURL != "" {
		flowpipeURL = ws.FlowpipeURL
	}

	// Build the run request
	runRequest := map[string]any{}
	if payload != nil {
		runRequest["args"] = payload
	}

	// For HTTP triggers, generate a test payload
	triggerType := trigger.Type
	if triggerType == model.TriggerTypeHTTP && payload == nil {
		runRequest["args"] = map[string]any{
			"event": map[string]any{
				"timestamp": time.Now().Unix(),
				"trigger":   triggerID,
				"module":    moduleID,
			},
		}
	}

	// Serialize request body
	bodyBytes, err := json.Marshal(runRequest)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP client
	client := &http.Client{Timeout: 30 * time.Second}

	// Call Flowpipe API
	url := fmt.Sprintf("%s/api/v0/pipeline/%s/run", flowpipeURL, pipelineRef)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Flowpipe: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("Flowpipe API error: status %d, body: %s", resp.StatusCode, string(respBody))
	}

	// Parse response for execution ID
	var execResp map[string]any
	if err := json.Unmarshal(respBody, &execResp); err != nil {
		return &model.TriggerTestResponse{
			ExecutedAt: time.Now(),
			Status:     "pending",
		}, nil
	}

	execStatus := "pending"
	if status, ok := execResp["status"].(string); ok {
		execStatus = status
	}

	return &model.TriggerTestResponse{
		ExecutedAt: time.Now(),
		Status:     execStatus,
	}, nil
}

// ListTriggers returns all triggers found in module directories.
func (s *Service) ListTriggers() ([]model.TriggerState, error) {
	dir := config.FlowsPath()
	if dir == "" {
		return nil, fmt.Errorf("flows path not configured")
	}

	var triggers []model.TriggerState
	var mu sync.Mutex

	// Collect all module directories (including root)
	modules := []string{""} // root module
	entries, err := os.ReadDir(dir)
	if err == nil {
		for _, e := range entries {
			if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
				modules = append(modules, e.Name())
			}
		}
	}

	// Parse triggers from each module's mod.fp
	for _, mod := range modules {
		modDir := s.moduleFlowDir(mod)
		if modDir == "" {
			continue
		}

		moduleName := mod
		if moduleName == "" {
			moduleName = "." // root module marker
		}

		modPath := filepath.Join(modDir, "mod.fp")
		data, err := os.ReadFile(modPath)
		if err != nil {
			if os.IsNotExist(err) {
				continue // no mod.fp in this module
			}
			return nil, err
		}

		// Parse trigger blocks using balanced brace matching
		parsedTriggers := parseTriggerBlocks(string(data), moduleName)
		mu.Lock()
		triggers = append(triggers, parsedTriggers...)
		mu.Unlock()
	}

	// Enrich with config.yaml data
	for i := range triggers {
		if entry := config.TriggerByID(triggers[i].ID); entry != nil {
			triggers[i].Label = entry.Label
			triggers[i].Workspace = entry.Workspace
			triggers[i].Config = triggerEntryToModelConfig(&entry.Config)
		}
	}

	return triggers, nil
}

// GetTrigger returns a specific trigger from a module.
func (s *Service) GetTrigger(moduleID, triggerID string) (*model.TriggerState, error) {
	dir := s.moduleFlowDir(moduleID)
	if dir == "" {
		return nil, fmt.Errorf("module %q not found", moduleID)
	}

	modPath := filepath.Join(dir, "mod.fp")
	data, err := os.ReadFile(modPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("trigger not found: %s in module %s", triggerID, moduleID)
		}
		return nil, err
	}

	// Parse trigger blocks
	parsedTriggers := parseTriggerBlocks(string(data), moduleID)
	for i := range parsedTriggers {
		if parsedTriggers[i].ID == triggerID {
			// Enrich with config.yaml data
			if entry := config.TriggerByID(triggerID); entry != nil {
				parsedTriggers[i].Label = entry.Label
				parsedTriggers[i].Workspace = entry.Workspace
				parsedTriggers[i].Config = triggerEntryToModelConfig(&entry.Config)
			}
			return &parsedTriggers[i], nil
		}
	}

	return nil, fmt.Errorf("trigger not found: %s in module %s", triggerID, moduleID)
}

// parseTriggerBlocks parses all trigger blocks from HCL content using balanced brace matching.
func parseTriggerBlocks(content, moduleName string) []model.TriggerState {
	var triggers []model.TriggerState

	// Find all trigger block start positions
	matches := triggerBlockRe.FindAllStringSubmatchIndex(content, -1)
	if len(matches) == 0 {
		return nil
	}

	for _, m := range matches {
		if len(m) < 6 {
			continue
		}
		// m[2]:m[3] = trigger type, m[4]:m[5] = trigger ID
		triggerType := content[m[2]:m[3]]
		triggerID := content[m[4]:m[5]]

		// Find the opening brace position
		openBracePos := -1
		for i := m[5]; i < len(content); i++ {
			if content[i] == '{' {
				openBracePos = i
				break
			}
		}
		if openBracePos == -1 {
			continue
		}

		// Find matching closing brace using balanced counting
		braceDepth := 1
		closeBracePos := -1
		for i := openBracePos + 1; i < len(content); i++ {
			if content[i] == '{' {
				braceDepth++
			} else if content[i] == '}' {
				braceDepth--
				if braceDepth == 0 {
					closeBracePos = i
					break
				}
			}
		}
		if closeBracePos == -1 {
			continue
		}

		blockContent := content[openBracePos+1 : closeBracePos]

		state := parseTriggerBlockContent(triggerType, triggerID, blockContent, moduleName)
		triggers = append(triggers, state)
	}

	return triggers
}

// ParseTriggerBlock parses a single trigger block and returns TriggerState.
func ParseTriggerBlock(triggerType, triggerID, blockContent string) model.TriggerState {
	return parseTriggerBlockContent(triggerType, triggerID, blockContent, "")
}

func parseTriggerBlockContent(triggerType, triggerID, blockContent, moduleName string) model.TriggerState {
	state := model.TriggerState{
		Type:    model.TriggerType(triggerType),
		Module:  moduleName,
		Enabled: true,
		Status:  "ready",
	}

	// Parse basic fields from block content
	pipelineRe := regexp.MustCompile(`pipeline\s*=\s*pipeline\.([^\s,}\n]+)`)
	descRe := regexp.MustCompile(`description\s*=\s*"((?:[^"\\]|\\.)*)"`)
	cronRe := regexp.MustCompile(`schedule\s*=\s*"((?:[^"\\]|\\.)*)"`)
	timezoneRe := regexp.MustCompile(`timezone\s*=\s*"((?:[^"\\]|\\.)*)"`)
	sourceRe := regexp.MustCompile(`source\s*=\s*([^\s,}\n]+)`)
	conditionRe := regexp.MustCompile(`condition\s*=\s*"((?:[^"\\]|\\.)*)"`)
	channelRe := regexp.MustCompile(`channel\s*=\s*"((?:[^"\\]|\\.)*)"`)

	if pipelineMatch := pipelineRe.FindStringSubmatch(blockContent); len(pipelineMatch) > 1 {
		state.Config.Pipeline = "pipeline." + pipelineMatch[1]
	}
	if descMatch := descRe.FindStringSubmatch(blockContent); len(descMatch) > 1 {
		state.Config.Description = unescapeHCLString(descMatch[1])
	}

	// Parse type-specific fields
	switch triggerType {
	case "schedule":
		sched := &model.ScheduleConfig{Pipeline: state.Config.Pipeline}
		if cronMatch := cronRe.FindStringSubmatch(blockContent); len(cronMatch) > 1 {
			sched.Cron = unescapeHCLString(cronMatch[1])
		}
		if tzMatch := timezoneRe.FindStringSubmatch(blockContent); len(tzMatch) > 1 {
			sched.Timezone = unescapeHCLString(tzMatch[1])
		}
		if args := parseHCLArgs(blockContent); len(args) > 0 {
			sched.Args = args
		}
		state.Config.Schedule = sched
	case "alert":
		alert := &model.AlertConfig{Pipeline: state.Config.Pipeline}
		if srcMatch := sourceRe.FindStringSubmatch(blockContent); len(srcMatch) > 1 {
			alert.Source = srcMatch[1]
		}
		if condMatch := conditionRe.FindStringSubmatch(blockContent); len(condMatch) > 1 {
			alert.Condition = unescapeHCLString(condMatch[1])
		}
		state.Config.Alert = alert
	case "http":
		http := &model.HTTPConfig{Pipeline: state.Config.Pipeline}
		if args := parseHCLArgs(blockContent); len(args) > 0 {
			http.Args = args
		}
		// Parse execution_mode
		execModeRe := regexp.MustCompile(`execution_mode\s*=\s*"((?:[^"\\]|\\.)*)"`)
		if emMatch := execModeRe.FindStringSubmatch(blockContent); len(emMatch) > 1 {
			http.ExecutionMode = unescapeHCLString(emMatch[1])
		}
		state.Config.HTTP = http
	case "notification":
		notif := &model.NotificationConfig{Pipeline: state.Config.Pipeline}
		if srcMatch := sourceRe.FindStringSubmatch(blockContent); len(srcMatch) > 1 {
			notif.Source = srcMatch[1]
		}
		if chMatch := channelRe.FindStringSubmatch(blockContent); len(chMatch) > 1 {
			notif.Channel = unescapeHCLString(chMatch[1])
		}
		state.Config.Notification = notif
	}

	state.ID = triggerID
	state.Label = triggerID

	return state
}

// parseHCLArgs extracts key-value pairs from an args = { ... } block.
// It finds the "args" key, extracts the brace-delimited block, and
// parses lines like `key = "value"` into a map.
func parseHCLArgs(blockContent string) map[string]string {
	args := make(map[string]string)

	// Find "args = {" using regex
	argsRe := regexp.MustCompile(`(?m)^[\s]*args\s*=\s*\{`)
	loc := argsRe.FindStringIndex(blockContent)
	if loc == nil {
		return args
	}

	// Find the opening brace
	openBrace := -1
	for i := loc[1] - 1; i < len(blockContent); i++ {
		if blockContent[i] == '{' {
			openBrace = i
			break
		}
	}
	if openBrace == -1 {
		return args
	}

	// Find matching closing brace
	depth := 1
	closeBrace := -1
	for i := openBrace + 1; i < len(blockContent); i++ {
		if blockContent[i] == '{' {
			depth++
		} else if blockContent[i] == '}' {
			depth--
			if depth == 0 {
				closeBrace = i
				break
			}
		}
	}
	if closeBrace == -1 {
		return args
	}

	inner := blockContent[openBrace+1 : closeBrace]
	// Parse key = "value" pairs
	kvRe := regexp.MustCompile(`(\w+)\s*=\s*"((?:[^"\\]|\\.)*)"`)
	for _, m := range kvRe.FindAllStringSubmatch(inner, -1) {
		args[m[1]] = unescapeHCLString(m[2])
	}
	return args
}

// triggerEntryToModelConfig converts config.TriggerConfig to model.TriggerConfig.
func triggerEntryToModelConfig(cfg *config.TriggerConfig) model.TriggerConfig {
	mcfg := model.TriggerConfig{
		Description: cfg.Description,
		Pipeline:    cfg.Pipeline,
	}
	if cfg.Schedule != nil {
		mcfg.Schedule = &model.ScheduleConfig{
			Description: cfg.Schedule.Description,
			Pipeline:    cfg.Schedule.Pipeline,
			Cron:        cfg.Schedule.Cron,
			Timezone:    cfg.Schedule.Timezone,
			Args:        cfg.Schedule.Args,
		}
	}
	if cfg.Alert != nil {
		mcfg.Alert = &model.AlertConfig{
			Description: cfg.Alert.Description,
			Pipeline:    cfg.Alert.Pipeline,
			Source:      cfg.Alert.Source,
			Condition:   cfg.Alert.Condition,
		}
	}
	if cfg.HTTP != nil {
		mcfg.HTTP = &model.HTTPConfig{
			Description:   cfg.HTTP.Description,
			Pipeline:      cfg.HTTP.Pipeline,
			Args:          cfg.HTTP.Args,
			ExecutionMode: cfg.HTTP.ExecutionMode,
		}
	}
	if cfg.Notification != nil {
		mcfg.Notification = &model.NotificationConfig{
			Description:  cfg.Notification.Description,
			Pipeline:     cfg.Notification.Pipeline,
			Source:       cfg.Notification.Source,
			Channel:      cfg.Notification.Channel,
			Conditions:   []string{},
		}
	}
	return mcfg
}

// saveTriggerToConfig persists trigger metadata to config.yaml.
func saveTriggerToConfig(trigger *model.TriggerEntry) error {
	cfg, configPath, err := config.ReadConfig()
	if err != nil {
		return nil // skip silently - config may not exist
	}

	if cfg.FlowpipeTriggers == nil {
		cfg.FlowpipeTriggers = &config.FlowpipeTriggersConfig{}
	}

	// Check if trigger already exists, update if so
	for i, t := range cfg.FlowpipeTriggers.Triggers {
		if t.ID == trigger.ID {
			cfg.FlowpipeTriggers.Triggers[i].Label = trigger.Label
			cfg.FlowpipeTriggers.Triggers[i].Workspace = trigger.Workspace
			cfg.FlowpipeTriggers.Triggers[i].Module = trigger.Module
			cfg.FlowpipeTriggers.Triggers[i].Type = config.TriggerType(trigger.Type)
			cfg.FlowpipeTriggers.Triggers[i].Config = configTriggerEntryFromModel(trigger)
			return config.SaveConfigStruct(cfg, configPath)
		}
	}

	// Add new entry
	cfg.FlowpipeTriggers.Triggers = append(cfg.FlowpipeTriggers.Triggers, config.TriggerEntry{
		ID:        trigger.ID,
		Label:     trigger.Label,
		Workspace: trigger.Workspace,
		Module:    trigger.Module,
		Type:      config.TriggerType(trigger.Type),
		Config:    configTriggerEntryFromModel(trigger),
	})

	return config.SaveConfigStruct(cfg, configPath)
}

// removeTriggerFromConfig removes trigger metadata from config.yaml.
func removeTriggerFromConfig(triggerID string) error {
	cfg, configPath, err := config.ReadConfig()
	if err != nil {
		return nil // skip silently
	}

	if cfg.FlowpipeTriggers == nil {
		return nil
	}

	triggers := cfg.FlowpipeTriggers.Triggers
	for i, t := range triggers {
		if t.ID == triggerID {
			cfg.FlowpipeTriggers.Triggers = append(triggers[:i], triggers[i+1:]...)
			return config.SaveConfigStruct(cfg, configPath)
		}
	}
	return nil
}

// configTriggerEntryFromModel converts model.TriggerEntry to config.TriggerConfig.
func configTriggerEntryFromModel(trigger *model.TriggerEntry) config.TriggerConfig {
	tc := config.TriggerConfig{
		Description: trigger.Config.Description,
		Pipeline:    trigger.Config.Pipeline,
	}

	switch trigger.Type {
	case model.TriggerTypeSchedule:
		if trigger.Config.Schedule != nil {
			tc.Schedule = &config.ScheduleConfig{
				Description: trigger.Config.Schedule.Description,
				Pipeline:    trigger.Config.Schedule.Pipeline,
				Cron:        trigger.Config.Schedule.Cron,
				Timezone:    trigger.Config.Schedule.Timezone,
				Args:        trigger.Config.Schedule.Args,
			}
		}
	case model.TriggerTypeAlert:
		if trigger.Config.Alert != nil {
			tc.Alert = &config.AlertConfig{
				Description: trigger.Config.Alert.Description,
				Pipeline:    trigger.Config.Alert.Pipeline,
				Source:      trigger.Config.Alert.Source,
				Condition:   trigger.Config.Alert.Condition,
			}
		}
	case model.TriggerTypeHTTP:
		if trigger.Config.HTTP != nil {
			tc.HTTP = &config.HTTPConfig{
				Description:   trigger.Config.HTTP.Description,
				Pipeline:      trigger.Config.HTTP.Pipeline,
				Args:          trigger.Config.HTTP.Args,
				ExecutionMode: trigger.Config.HTTP.ExecutionMode,
			}
		}
	case model.TriggerTypeNotification:
		if trigger.Config.Notification != nil {
			tc.Notification = &config.NotificationConfig{
				Description:  trigger.Config.Notification.Description,
				Pipeline:     trigger.Config.Notification.Pipeline,
				Source:       trigger.Config.Notification.Source,
				Channel:      trigger.Config.Notification.Channel,
				Conditions:   strings.Join(trigger.Config.Notification.Conditions, "\n"),
			}
		}
	}

	return tc
}
