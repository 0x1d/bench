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
	"time"

	"github.com/0x1d/bench/api/internal/config"
	"github.com/0x1d/bench/api/internal/model"
	"github.com/0x1d/bench/api/internal/service/flow/hclgen"
)

// CreateTrigger adds a new trigger to a flow's .fp file.
func (s *Service) CreateTrigger(trigger *model.TriggerEntry) error {
	if trigger == nil {
		return fmt.Errorf("trigger is nil")
	}
	if trigger.ID == "" {
		return fmt.Errorf("trigger id is required")
	}
	if trigger.Flow == "" {
		return fmt.Errorf("trigger flow is required")
	}
	if trigger.Type == "" {
		return fmt.Errorf("trigger type is required")
	}
	if trigger.Config.Pipeline == "" {
		return fmt.Errorf("trigger config.pipeline is required")
	}

	dir := config.FlowsPath()
	if dir == "" {
		return fmt.Errorf("flows path not configured")
	}

	// Check for duplicate trigger ID in same flow
	// When updating, the trigger being updated is in the list, so we need to skip it
	flowTriggers, err := s.ListTriggers()
	if err != nil {
		return err
	}
	foundCount := 0
	for _, t := range flowTriggers {
		if t.Flow == trigger.Flow && t.ID == trigger.ID {
			foundCount++
		}
	}
	// If we found exactly one (the one we're updating), that's OK
	// If we found more than one, that's a duplicate conflict
	if foundCount > 1 {
		return fmt.Errorf("trigger %q already exists in flow %q", trigger.ID, trigger.Flow)
	}

	// Generate HCL trigger block
	hclBlock, err := buildTriggerHCLBlock(trigger)
	if err != nil {
		return fmt.Errorf("invalid trigger config: %w", err)
	}

	// Find the flow's .fp file
	flowPath := filepath.Join(dir, trigger.Flow+".fp")

	// Read existing content or create new file
	var existingContent []byte
	if data, err := os.ReadFile(flowPath); err == nil {
		existingContent = data
	} else {
		if os.IsNotExist(err) {
			return fmt.Errorf("flow %q not found. Create flow first", trigger.Flow)
		}
		return err
	}

	content := string(existingContent)

	// Check if trigger already exists and remove it if updating
	triggerBlockRe := regexp.MustCompile(`(?s)trigger\s+"[^"]+"\s+"` + regexp.QuoteMeta(trigger.ID) + `"\s*\{[^}]*\}`)
	content = triggerBlockRe.ReplaceAllString(content, "")

	// Add new trigger block
	if content != "" && !strings.HasSuffix(strings.TrimSpace(content), "\n") {
		content += "\n"
	}
	content += hclBlock + "\n"

	// Write to file atomically
	if err := hclgen.WriteFileAtomically(flowPath, []byte(content), 0644); err != nil {
		return err
	}

	// Update connections.fpc
	if err := s.updateConnectionsFPC(dir); err != nil {
		return fmt.Errorf("failed to update connections.fpc: %w", err)
	}

	s.touchRootMod()
	return nil
}

// buildTriggerHCLBlock generates HCL for a trigger block.
func buildTriggerHCLBlock(trigger *model.TriggerEntry) (string, error) {
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
				b.WriteString(fmt.Sprintf("  cron        = %q\n", trigger.Config.Schedule.Cron))
			}
			if trigger.Config.Schedule.Timezone != "" {
				b.WriteString(fmt.Sprintf("  timezone    = %q\n", trigger.Config.Schedule.Timezone))
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
			if trigger.Config.HTTP.URL != "" {
				b.WriteString(fmt.Sprintf("  url         = %q\n", trigger.Config.HTTP.URL))
			}
			if trigger.Config.HTTP.Method != "" {
				b.WriteString(fmt.Sprintf("  method      = %q\n", trigger.Config.HTTP.Method))
			}
			if trigger.Config.HTTP.Body != "" {
				b.WriteString(fmt.Sprintf("  body        = %q\n", trigger.Config.HTTP.Body))
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
	case model.TriggerTypeWebhook:
		// Webhook has no additional fields beyond the base
	}

	b.WriteString("}\n")
	return b.String(), nil
}

// UpdateTrigger updates an existing trigger in a flow's .fp file.
func (s *Service) UpdateTrigger(trigger *model.TriggerEntry) error {
	if trigger == nil {
		return fmt.Errorf("trigger is nil")
	}
	if trigger.ID == "" {
		return fmt.Errorf("trigger id is required")
	}
	if trigger.Flow == "" {
		return fmt.Errorf("trigger flow is required")
	}

	// Check if trigger exists before updating
	triggers, err := s.ListTriggers()
	if err != nil {
		return err
	}
	found := false
	for _, t := range triggers {
		if t.Flow == trigger.Flow && t.ID == trigger.ID {
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("trigger %q not found in flow %q", trigger.ID, trigger.Flow)
	}

	// Check for duplicate ID in other triggers (same flow)
	for _, t := range triggers {
		if t.Flow == trigger.Flow && t.ID != trigger.ID && t.ID == trigger.ID {
			return fmt.Errorf("trigger id %q already in use", trigger.ID)
		}
	}

	// Delete the old trigger block and add the new one
	return s.CreateTrigger(trigger)
}

// DeleteTrigger removes a trigger from a flow's .fp file.
func (s *Service) DeleteTrigger(flowID, triggerID string) error {
	if flowID == "" {
		return fmt.Errorf("flow id is required")
	}
	if triggerID == "" {
		return fmt.Errorf("trigger id is required")
	}

	dir := config.FlowsPath()
	if dir == "" {
		return fmt.Errorf("flows path not configured")
	}

	flowPath := filepath.Join(dir, flowID+".fp")
	data, err := os.ReadFile(flowPath)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("flow %q not found", flowID)
		}
		return err
	}

	content := string(data)

	// Remove trigger block
	triggerBlockRe := regexp.MustCompile(`(?s)trigger\s+"[^"]+"\s+"` + regexp.QuoteMeta(triggerID) + `"\s*\{[^}]*\}`)
	newContent := triggerBlockRe.ReplaceAllString(content, "")

	// Check if content changed
	if newContent == content {
		return fmt.Errorf("trigger %q not found in flow %q", triggerID, flowID)
	}

	// Write back atomically
	if err := hclgen.WriteFileAtomically(flowPath, []byte(newContent), 0644); err != nil {
		return err
	}

	// Update connections.fpc
	if err := s.updateConnectionsFPC(dir); err != nil {
		return fmt.Errorf("failed to update connections.fpc: %w", err)
	}

	s.touchRootMod()
	return nil
}

// TestTrigger simulates trigger execution by calling Flowpipe API to run the pipeline.
func (s *Service) TestTrigger(flowID, triggerID string, payload map[string]any) (*model.TriggerTestResponse, error) {
	// Get the trigger to find the pipeline reference
	trigger, err := s.GetTrigger(flowID, triggerID)
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

	// For webhook triggers, generate a test payload
	triggerType := trigger.Type
	if triggerType == model.TriggerTypeWebhook && payload == nil {
		runRequest["args"] = map[string]any{
			"event": map[string]any{
				"timestamp": time.Now().Unix(),
				"trigger":   triggerID,
				"flow":      flowID,
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
		// Return successful response even if we can't parse
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
