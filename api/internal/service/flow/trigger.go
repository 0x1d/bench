package flow

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

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
	flowTriggers, err := s.ListTriggers()
	if err != nil {
		return err
	}
	for _, t := range flowTriggers {
		if t.Flow == trigger.Flow && t.ID == trigger.ID {
			return fmt.Errorf("trigger %q already exists in flow %q", trigger.ID, trigger.Flow)
		}
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
