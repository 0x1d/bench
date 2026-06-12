package flow

import (
	"strings"

	"github.com/0x1d/bench/api/internal/model"
)

// RequiredConnectionParamIDs returns database IDs referenced by query steps in a flow tree.
func (s *Service) RequiredConnectionParamIDs(module string, f *model.Flow) map[string]bool {
	return s.collectRequiredConnectionParamIDs(module, f, s.defaultDatabaseID(), map[string]bool{})
}

func (s *Service) collectRequiredConnectionParamIDs(module string, f *model.Flow, defaultDBID string, visited map[string]bool) map[string]bool {
	required := make(map[string]bool)
	if f == nil {
		return required
	}
	flowKey := module + ":" + f.ID
	if visited[flowKey] {
		return required
	}
	visited[flowKey] = true

	for _, step := range f.Steps {
		if strings.EqualFold(step.Type, "query") {
			dbID, _ := step.Config["databaseId"].(string)
			dbID = strings.TrimSpace(dbID)
			if dbID == "" {
				dbID = defaultDBID
			}
			if dbID != "" {
				required[dbID] = true
			}
			continue
		}
		if !strings.EqualFold(step.Type, "pipeline") {
			continue
		}
		ref, _ := step.Config["pipelineRef"].(string)
		ref = strings.TrimSpace(ref)
		if ref == "" {
			continue
		}
		child, err := s.GetInModule(module, ref)
		if err != nil && module != "." {
			child, err = s.GetInModule(".", ref)
		}
		if err != nil {
			continue
		}
		for dbID := range s.collectRequiredConnectionParamIDs(module, child, defaultDBID, visited) {
			required[dbID] = true
		}
	}
	return required
}

// MergeTriggerRunArgs builds pipeline args for trigger test/run, including DB connection params.
func (s *Service) MergeTriggerRunArgs(moduleID string, trigger *model.TriggerState, payload map[string]any) map[string]any {
	merged := make(map[string]any)

	pipelineID := pipelineIDFromRef(trigger.Config.Pipeline)
	if pipelineID != "" {
		flow, err := s.GetInModule(moduleID, pipelineID)
		if err != nil && moduleID != "." {
			flow, err = s.GetInModule(".", pipelineID)
		}
		if err == nil && flow != nil {
			for dbID := range s.RequiredConnectionParamIDs(moduleID, flow) {
				merged["conn_"+dbID] = dbID
			}
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
					if name == "" {
						continue
					}
					if _, exists := merged[name]; exists {
						continue
					}
					if def, ok := m["default"]; ok && def != nil && def != "" {
						merged[name] = def
					}
				}
			}
		}
	}

	for k, v := range payload {
		merged[k] = v
	}
	return merged
}
