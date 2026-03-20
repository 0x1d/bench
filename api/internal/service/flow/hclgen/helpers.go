package hclgen

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/0x1d/bench/api/internal/config"
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

func usedConnectionParamIDs(flow *model.Flow, defaultID string) map[string]bool {
	used := make(map[string]bool)
	if flow == nil {
		return used
	}
	for dbID := range usedDatabaseIDs(flow.Steps, defaultID) {
		used[dbID] = true
	}
	visited := map[string]bool{}
	for _, step := range flow.Steps {
		if !stringsEqualFold(step.Type, "pipeline") {
			continue
		}
		ref, _ := step.Config["pipelineRef"].(string)
		for dbID := range requiredConnectionParamIDsForPipelineRef(ref, defaultID, visited) {
			used[dbID] = true
		}
	}
	return used
}

func requiredConnectionParamIDsForPipelineRef(ref, defaultID string, visited map[string]bool) map[string]bool {
	out := make(map[string]bool)
	ref = strings.TrimSpace(ref)
	if ref == "" || visited[ref] {
		return out
	}
	visited[ref] = true

	flow, ok := loadFlowByPipelineRef(ref)
	if !ok || flow == nil {
		return out
	}
	for dbID := range usedDatabaseIDs(flow.Steps, defaultID) {
		out[dbID] = true
	}
	for _, step := range flow.Steps {
		if !stringsEqualFold(step.Type, "pipeline") {
			continue
		}
		nestedRef, _ := step.Config["pipelineRef"].(string)
		for dbID := range requiredConnectionParamIDsForPipelineRef(nestedRef, defaultID, visited) {
			out[dbID] = true
		}
	}
	return out
}

func loadFlowByPipelineRef(ref string) (*model.Flow, bool) {
	base := config.FlowsPath()
	if strings.TrimSpace(base) == "" {
		return nil, false
	}
	candidates := make([]string, 0, 4)
	normalized := filepath.FromSlash(ref)
	candidates = append(candidates, filepath.Join(base, normalized+".json"))
	candidates = append(candidates, filepath.Join(base, ref+".json"))
	if strings.Contains(ref, ".") {
		last := ref[strings.LastIndex(ref, ".")+1:]
		if last != "" {
			candidates = append(candidates, filepath.Join(base, last+".json"))
		}
	}

	var data []byte
	found := false
	seen := map[string]bool{}
	for _, p := range candidates {
		if p == "" || seen[p] {
			continue
		}
		seen[p] = true
		b, err := os.ReadFile(p)
		if err == nil {
			data = b
			found = true
			break
		}
	}

	if !found {
		targetName := ref + ".json"
		if strings.Contains(ref, ".") {
			targetName = ref[strings.LastIndex(ref, ".")+1:] + ".json"
		}
		_ = filepath.WalkDir(base, func(path string, d os.DirEntry, err error) error {
			if err != nil || d == nil || d.IsDir() {
				return nil
			}
			if d.Name() != targetName {
				return nil
			}
			b, readErr := os.ReadFile(path)
			if readErr == nil {
				data = b
				found = true
				return filepath.SkipAll
			}
			return nil
		})
	}
	if !found {
		return nil, false
	}

	var flow model.Flow
	if err := json.Unmarshal(data, &flow); err != nil {
		return nil, false
	}
	return &flow, true
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
