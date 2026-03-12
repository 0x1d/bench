package hclgen

import (
	"sort"
	"strings"

	"github.com/0x1d/bench/api/internal/model"
)

func isVirtualStep(t string) bool {
	t = strings.TrimSpace(strings.ToLower(t))
	return t == "input" || t == "output"
}

func stringsEqualFold(a, b string) bool {
	return strings.EqualFold(strings.TrimSpace(a), strings.TrimSpace(b))
}

func pipelineName(flow *model.Flow) string {
	slug := slugFromName(flow.Name)
	if slug != "" {
		return slug
	}
	return flow.ID
}

func slugFromName(name string) string {
	if name == "" {
		return ""
	}
	t := strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	lastUnderscore := false
	for _, c := range t {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
			b.WriteRune(c)
			lastUnderscore = false
		} else if (c == ' ' || c == '-' || c == '_') && !lastUnderscore {
			b.WriteRune('_')
			lastUnderscore = true
		}
	}
	res := strings.Trim(b.String(), "_")
	for strings.Contains(res, "__") {
		res = strings.ReplaceAll(res, "__", "_")
	}
	return res
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

func stepTypeKey(t string) string {
	t = strings.TrimSpace(strings.ToLower(t))
	switch t {
	case "http", "query", "message", "sleep", "transform", "container", "pipeline":
		return t
	default:
		return t
	}
}

func paramsFromInput(step model.FlowStep) []ParamIR {
	params, _ := step.Config["params"].([]any)
	if len(params) == 0 {
		return nil
	}
	var out []ParamIR
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
		pr := ParamIR{Name: name, Type: paramType, Description: desc}
		if hasDef && def != nil && def != "" {
			pr.Default = def
		}
		out = append(out, pr)
	}
	return out
}

func usedDatabaseIDs(steps []model.FlowStep, defaultID string) map[string]bool {
	used := make(map[string]bool)
	for _, step := range steps {
		if !stringsEqualFold(step.Type, "query") {
			continue
		}
		dbID, _ := step.Config["databaseId"].(string)
		if dbID == "" {
			dbID = defaultID
		}
		if dbID != "" {
			used[dbID] = true
		}
	}
	return used
}

func sortedKeys(m map[string]bool) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func stepToIR(step model.FlowStep) StepIR {
	stepType := strings.TrimSpace(strings.ToLower(step.Type))
	stepType = strings.Join(strings.Fields(stepType), " ")
	s := StepIR{
		Type:      stepType,
		Label:     step.Label,
		ID:        step.ID,
		Config:    step.Config,
		DependsOn: step.DependsOn,
	}
	if raw, ok := step.Config["commonAttributes"].(map[string]any); ok && raw != nil {
		s.CommonAttrs = commonAttrsFromRaw(raw)
	}
	return s
}

func commonAttrsFromRaw(raw map[string]any) *CommonAttrsIR {
	ir := &CommonAttrsIR{}
	if v, ok := raw["title"].(string); ok && v != "" {
		ir.Title = v
	}
	if v, ok := raw["description"].(string); ok && v != "" {
		ir.Description = v
	}
	if v := raw["timeout"]; v != nil {
		switch x := v.(type) {
		case string:
			if x != "" {
				ir.Timeout = x
			}
		case float64:
			ir.TimeoutSeconds = int(x)
		}
	}
	if v, ok := raw["if"].(string); ok && v != "" {
		ir.If = v
	}
	if v, ok := raw["for_each"].(string); ok && v != "" {
		ir.ForEach = v
	}
	if v, ok := raw["max_concurrency"].(float64); ok && v > 0 {
		ir.MaxConcurrency = int(v)
	}
	if errMap, ok := raw["error"].(map[string]any); ok && errMap["enabled"] == true {
		ir.Error = &ErrorBlockIR{}
		if ignore, _ := errMap["ignore"].(bool); ignore {
			ir.Error.Ignore = true
		}
		if v, _ := errMap["if"].(string); v != "" {
			ir.Error.If = v
		}
	}
	if loopMap, ok := raw["loop"].(map[string]any); ok && loopMap["enabled"] == true {
		ir.Loop = &LoopBlockIR{}
		if v, _ := loopMap["until"].(string); v != "" {
			ir.Loop.Until = v
		}
	}
	if retryMap, ok := raw["retry"].(map[string]any); ok && retryMap["enabled"] == true {
		ir.Retry = &RetryBlockIR{}
		if v, ok := retryMap["max_attempts"].(float64); ok && v > 0 {
			ir.Retry.MaxAttempts = int(v)
		}
		if v, ok := retryMap["strategy"].(string); ok && v != "" {
			ir.Retry.Strategy = v
		}
		if v, ok := retryMap["min_interval"].(float64); ok && v > 0 {
			ir.Retry.MinInterval = int(v)
		}
		if v, _ := retryMap["if"].(string); v != "" {
			ir.Retry.If = v
		}
	}
	if throwMap, ok := raw["throw"].(map[string]any); ok && throwMap["enabled"] == true {
		ir.Throw = &ThrowBlockIR{}
		if v, _ := throwMap["if"].(string); v != "" {
			ir.Throw.If = v
		}
		if v, _ := throwMap["message"].(string); v != "" {
			ir.Throw.Message = v
		}
	}
	if outMap, ok := raw["output"].(map[string]any); ok && outMap["enabled"] == true {
		if outputs, ok := outMap["outputs"].([]any); ok {
			ir.Output = &StepOutputBlockIR{}
			for _, o := range outputs {
				om, ok := o.(map[string]any)
				if !ok {
					continue
				}
				name, _ := om["name"].(string)
				value, _ := om["value"].(string)
				if name == "" {
					name = "result"
				}
				if value == "" {
					value = "null"
				}
				ir.Output.Outputs = append(ir.Output.Outputs, OutputIR{Name: name, Value: value})
			}
		}
	}
	return ir
}

func outputsFromStep(step model.FlowStep) []OutputIR {
	outputs, _ := step.Config["outputs"].([]any)
	var out []OutputIR
	for _, o := range outputs {
		om, ok := o.(map[string]any)
		if !ok {
			continue
		}
		name, _ := om["name"].(string)
		value, _ := om["value"].(string)
		if name == "" {
			name = "result"
		}
		if value == "" {
			value = "null"
		}
		out = append(out, OutputIR{Name: name, Value: value})
	}
	return out
}
