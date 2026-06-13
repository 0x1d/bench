package flow

import (
	"fmt"
	"sort"
	"strings"

	"github.com/0x1d/bench/api/internal/model"
)

// ValidateTriggerEntry checks trigger configuration before persisting.
// HTTP triggers must map args to the target pipeline's parameters.
func (s *Service) ValidateTriggerEntry(trigger *model.TriggerEntry) error {
	if trigger == nil {
		return fmt.Errorf("trigger is nil")
	}
	if trigger.Type != model.TriggerTypeHTTP {
		return nil
	}
	return s.validateHTTPTrigger(trigger)
}

func (s *Service) validateHTTPTrigger(trigger *model.TriggerEntry) error {
	pipelineID := pipelineIDFromRef(trigger.Config.Pipeline)
	if pipelineID == "" {
		return fmt.Errorf("invalid pipeline reference %q", trigger.Config.Pipeline)
	}

	moduleID := trigger.Module
	flow, err := s.GetInModule(moduleID, pipelineID)
	if err != nil && moduleID != "." {
		flow, err = s.GetInModule(".", pipelineID)
	}
	if err != nil {
		return fmt.Errorf("pipeline %q not found for module %q", pipelineID, moduleID)
	}

	allowed := make(map[string]bool)
	var required []string

	for _, step := range flow.Steps {
		if !strings.EqualFold(step.Type, "input") {
			continue
		}
		params, ok := step.Config["params"].([]any)
		if !ok {
			continue
		}
		for _, p := range params {
			m, ok := p.(map[string]any)
			if !ok {
				continue
			}
			name, _ := m["name"].(string)
			name = strings.TrimSpace(name)
			if name == "" {
				continue
			}
			allowed[name] = true
			if !inputParamHasDefault(m) {
				required = append(required, name)
			}
		}
	}

	for dbID := range s.RequiredConnectionParamIDs(moduleID, flow) {
		key := "conn_" + dbID
		allowed[key] = true
		required = append(required, key)
	}

	effective := mergeHTTPTriggerArgs(s, trigger)
	var missing []string
	for _, name := range required {
		if v, ok := effective[name]; !ok || strings.TrimSpace(v) == "" {
			missing = append(missing, name)
		}
	}

	userArgs := userHTTPTriggerArgs(trigger)
	var unknown []string
	for k := range userArgs {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		if !allowed[k] {
			unknown = append(unknown, k)
		}
	}

	if len(missing) > 0 {
		sort.Strings(missing)
		hint := ""
		if len(missing) > 0 {
			hint = fmt.Sprintf(" (e.g. %s = self.request_body)", missing[0])
		}
		return fmt.Errorf("missing required pipeline args: %s%s", strings.Join(missing, ", "), hint)
	}
	if len(unknown) > 0 {
		sort.Strings(unknown)
		allowedNames := make([]string, 0, len(allowed))
		for k := range allowed {
			allowedNames = append(allowedNames, k)
		}
		sort.Strings(allowedNames)
		return fmt.Errorf(
			"unknown trigger arg keys: %s (pipeline accepts: %s)",
			strings.Join(unknown, ", "),
			strings.Join(allowedNames, ", "),
		)
	}
	return nil
}

func userHTTPTriggerArgs(trigger *model.TriggerEntry) map[string]string {
	if trigger.Config.HTTP != nil && len(trigger.Config.HTTP.Args) > 0 {
		return trigger.Config.HTTP.Args
	}
	return nil
}

func inputParamHasDefault(m map[string]any) bool {
	def, ok := m["default"]
	if !ok || def == nil {
		return false
	}
	switch v := def.(type) {
	case string:
		return strings.TrimSpace(v) != ""
	case float64, bool, int:
		return true
	default:
		return fmt.Sprint(v) != ""
	}
}
