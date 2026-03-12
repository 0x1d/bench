package hclgen

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/0x1d/bench/api/internal/config"
	"github.com/0x1d/bench/api/internal/model"
	"github.com/0x1d/bench/api/internal/service/rest"
	"github.com/hashicorp/hcl/v2/hclsyntax"
	"github.com/hashicorp/hcl/v2/hclwrite"
	"github.com/zclconf/go-cty/cty"
)

// Generate produces Flowpipe HCL from a flow model.
// Uses the typed IR and hclwrite for canonical, deterministic output.
func Generate(flow *model.Flow, defaultDBID string) ([]byte, error) {
	ir, err := BuildIR(flow, defaultDBID)
	if err != nil {
		return nil, err
	}
	if ir == nil {
		return nil, fmt.Errorf("flow is nil")
	}
	return emitPipeline(ir, flow, defaultDBID)
}

// emitPipeline writes the pipeline block and all nested blocks to a new HCL file.
func emitPipeline(ir *PipelineIR, flow *model.Flow, defaultDBID string) ([]byte, error) {
	f := hclwrite.NewEmptyFile()
	root := f.Body()

	// pipeline "name" { ... }
	pipeBlock := root.AppendNewBlock("pipeline", []string{ir.Name})
	pipeBody := pipeBlock.Body()

	if ir.Title != "" {
		pipeBody.SetAttributeValue("title", cty.StringVal(ir.Title))
		pipeBody.AppendNewline()
	}

	// Params
	for _, p := range ir.Params {
		paramBlock := pipeBody.AppendNewBlock("param", []string{p.Name})
		pb := paramBlock.Body()
		pb.SetAttributeValue("type", cty.StringVal(p.Type))
		if p.Description != "" {
			pb.SetAttributeValue("description", cty.StringVal(escapeString(p.Description)))
		}
		if p.Default != nil && p.Default != "" {
			switch v := p.Default.(type) {
			case string:
				pb.SetAttributeValue("default", cty.StringVal(escapeString(v)))
			case float64:
				pb.SetAttributeValue("default", cty.NumberFloatVal(v))
			case bool:
				pb.SetAttributeValue("default", cty.BoolVal(v))
			}
		}
		pipeBody.AppendNewline()
	}

	// Steps
	stepIndex := make(map[string]*model.FlowStep)
	for i := range flow.Steps {
		stepIndex[flow.Steps[i].ID] = &flow.Steps[i]
	}

	for _, step := range ir.Steps {
		pipeBody.AppendNewline()
		pipeBody.AppendUnstructuredTokens(commentTokens(" Step: " + step.Label + " (" + step.ID + ")"))
		pipeBody.AppendNewline()

		stepBlock := pipeBody.AppendNewBlock("step", []string{step.Type, normalizeStepName(step.Label, step.ID)})
		sb := stepBlock.Body()

		// Emit step-specific config
		if err := emitStepConfig(sb, step, flow, stepIndex, defaultDBID); err != nil {
			return nil, fmt.Errorf("step %s (%s): %w", step.Label, step.ID, err)
		}

		// Common attributes
		if step.CommonAttrs != nil {
			emitCommonAttrs(sb, step.CommonAttrs)
		}

		// depends_on
		if len(step.DependsOn) > 0 {
			deps := buildDependsOn(step.DependsOn, flow.Steps, step.Type)
			if len(deps) > 0 {
				sb.SetAttributeRaw("depends_on", hclwrite.TokensForTuple(deps))
			}
		}

		pipeBody.AppendNewline()
	}

	// Output blocks
	for _, o := range ir.Outputs {
		pipeBody.AppendNewline()
		outBlock := pipeBody.AppendNewBlock("output", []string{o.Name})
		outBlock.Body().SetAttributeRaw("value", tokensForExpression(o.Value))
	}

	pipeBody.AppendNewline()
	return f.Bytes(), nil
}

func commentTokens(s string) hclwrite.Tokens {
	return hclwrite.Tokens{
		{Type: hclsyntax.TokenNewline, Bytes: []byte("\n")},
		{Type: hclsyntax.TokenComment, Bytes: []byte("  //" + s + "\n")},
		{Type: hclsyntax.TokenNewline, Bytes: []byte("  ")},
	}
}

func buildDependsOn(depIDs []string, steps []model.FlowStep, currentType string) []hclwrite.Tokens {
	var deps []hclwrite.Tokens
	for _, depID := range depIDs {
		var depStep *model.FlowStep
		for i := range steps {
			if steps[i].ID == depID {
				depStep = &steps[i]
				break
			}
		}
		if depStep == nil || stringsEqualFold(depStep.Type, "input") {
			continue
		}
		ref := "step." + stepTypeKey(depStep.Type) + "." + normalizeStepName(depStep.Label, depStep.ID)
		traversal := traversalFromPath(ref)
		if traversal != nil {
			deps = append(deps, hclwrite.TokensForTraversal(traversal))
		}
	}
	return deps
}

func emitStepConfig(sb *hclwrite.Body, step StepIR, flow *model.Flow, stepIndex map[string]*model.FlowStep, defaultDBID string) error {
	emitter, ok := stepEmitters[step.Type]
	if !ok {
		return fmt.Errorf("unsupported step type: %s", step.Type)
	}
	return emitter(sb, step, flow, stepIndex, defaultDBID)
}

type stepEmitterFunc func(*hclwrite.Body, StepIR, *model.Flow, map[string]*model.FlowStep, string) error

var stepEmitters = map[string]stepEmitterFunc{
	"http":      emitHTTP,
	"query":     emitQuery,
	"message":   emitMessage,
	"sleep":     emitSleep,
	"transform": emitTransform,
	"container": emitContainer,
	"pipeline":  emitPipelineStep,
}

func emitHTTP(sb *hclwrite.Body, step StepIR, _ *model.Flow, _ map[string]*model.FlowStep, _ string) error {
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

	restSvc := rest.NewService()
	entry, err := restSvc.GetEntry(restID)
	if err == nil && entry != nil && entry.BaseURL != "" {
		targetURL := strings.TrimSuffix(entry.BaseURL, "/") + "/" + strings.TrimPrefix(path, "/")
		sb.SetAttributeValue("url", cty.StringVal(targetURL))
		sb.SetAttributeValue("method", cty.StringVal(strings.ToLower(method)))
		if body != "" {
			sb.SetAttributeValue("request_body", cty.StringVal(escapeString(body)))
		}
		hasHeaders := body != "" || entry.Auth != nil
		if hasHeaders {
			attrs := []hclwrite.ObjectAttrTokens{}
			if body != "" {
				attrs = append(attrs, hclwrite.ObjectAttrTokens{
					Name:  hclwrite.TokensForValue(cty.StringVal("Content-Type")),
					Value: hclwrite.TokensForValue(cty.StringVal("application/json")),
				})
			}
			if entry.Auth != nil {
				switch entry.Auth.Type {
				case config.RestAuthBasic:
					val := fmt.Sprintf("Basic ${base64encode(\"%s:%s\")}", entry.Auth.Username, entry.Auth.Password)
					attrs = append(attrs, hclwrite.ObjectAttrTokens{
						Name:  hclwrite.TokensForValue(cty.StringVal("Authorization")),
						Value: tokensFromExpression(val),
					})
				case config.RestAuthBearer:
					attrs = append(attrs, hclwrite.ObjectAttrTokens{
						Name:  hclwrite.TokensForValue(cty.StringVal("Authorization")),
						Value: hclwrite.TokensForValue(cty.StringVal("Bearer " + entry.Auth.Token)),
					})
				case config.RestAuthAPIKey:
					name := entry.Auth.Name
					if name == "" {
						name = "X-API-Key"
					}
					if strings.ToLower(entry.Auth.In) != "query" {
						attrs = append(attrs, hclwrite.ObjectAttrTokens{
							Name:  hclwrite.TokensForValue(cty.StringVal(name)),
							Value: hclwrite.TokensForValue(cty.StringVal(entry.Auth.Value)),
						})
					}
				}
			}
			if len(attrs) > 0 {
				sb.SetAttributeRaw("request_headers", hclwrite.TokensForObject(attrs))
			}
		}
		return nil
	}

	// Fallback: Bench API Proxy
	apiURL := os.Getenv("BENCH_API_URL")
	if apiURL == "" {
		apiURL = "http://localhost:8080"
	} else if !strings.HasPrefix(apiURL, "http://") && !strings.HasPrefix(apiURL, "https://") {
		apiURL = "http://" + apiURL
	}
	proxyURL := apiURL + "/api/rest/" + restID + "/proxy"
	bodyArg := ""
	headersArg := ""
	if body != "" {
		bodyArg = fmt.Sprintf(`, body = %q`, escapeString(body))
		headersArg = `, headers = { "Content-Type" = "application/json" }`
	}
	proxyObj := fmt.Sprintf(`{ method = %q, path = %q%s%s }`, strings.ToUpper(method), path, bodyArg, headersArg)

	sb.SetAttributeValue("url", cty.StringVal(proxyURL))
	sb.SetAttributeValue("method", cty.StringVal("post"))
	sb.SetAttributeRaw("request_body", tokensFromExpression("jsonencode("+proxyObj+")"))
	attrs := []hclwrite.ObjectAttrTokens{{
		Name:  hclwrite.TokensForValue(cty.StringVal("Content-Type")),
		Value: hclwrite.TokensForValue(cty.StringVal("application/json")),
	}}
	sb.SetAttributeRaw("request_headers", hclwrite.TokensForObject(attrs))
	return nil
}

func emitQuery(sb *hclwrite.Body, step StepIR, _ *model.Flow, _ map[string]*model.FlowStep, defaultDBID string) error {
	sql, _ := step.Config["sql"].(string)
	dbID, _ := step.Config["databaseId"].(string)

	if sql == "" {
		sql = "SELECT 1"
	}
	if dbID == "" {
		dbID = defaultDBID
	}
	if dbID == "" {
		return fmt.Errorf("no database configured; select a database in step config")
	}
	sb.SetAttributeValue("sql", cty.StringVal(escapeString(sql)))
	sb.SetAttributeRaw("database", tokensFromExpression("connection.postgres[param.conn_"+dbID+"]"))

	argsRaw, _ := step.Config["args"]
	if argsRaw != nil {
		if args, ok := argsRaw.([]any); ok && len(args) > 0 {
			var argToks []hclwrite.Tokens
			for _, a := range args {
				s, ok := a.(string)
				if !ok {
					continue
				}
				if strings.HasPrefix(s, "param.") || strings.HasPrefix(s, "step.") {
					traversal := traversalFromPath(s)
					if traversal != nil {
						argToks = append(argToks, hclwrite.TokensForTraversal(traversal))
					}
				} else {
					argToks = append(argToks, hclwrite.TokensForValue(cty.StringVal(escapeString(s))))
				}
			}
			if len(argToks) > 0 {
				sb.SetAttributeRaw("args", hclwrite.TokensForTuple(argToks))
			}
		}
	}
	return nil
}

func emitMessage(sb *hclwrite.Body, step StepIR, _ *model.Flow, _ map[string]*model.FlowStep, _ string) error {
	notifier, _ := step.Config["notifier"].(string)
	text, _ := step.Config["text"].(string)

	if notifier == "" {
		notifier = "notifier.default"
	} else if !strings.HasPrefix(notifier, "notifier.") {
		notifier = "notifier." + notifier
	}
	if text == "" {
		text = "Hello from bench!"
	}

	sb.SetAttributeRaw("notifier", tokensFromExpression(notifier))
	sb.SetAttributeValue("text", cty.StringVal(escapeString(text)))
	return nil
}

func emitSleep(sb *hclwrite.Body, step StepIR, _ *model.Flow, _ map[string]*model.FlowStep, _ string) error {
	duration, _ := step.Config["duration"].(string)
	if duration == "" {
		duration = "5s"
	}
	sb.SetAttributeValue("duration", cty.StringVal(escapeString(duration)))
	return nil
}

func emitTransform(sb *hclwrite.Body, step StepIR, _ *model.Flow, _ map[string]*model.FlowStep, _ string) error {
	value, _ := step.Config["value"].(string)
	if value == "" {
		value = "null"
	}
	value = strings.TrimSpace(value)
	if value == "" {
		value = "null"
	}
	sb.SetAttributeRaw("value", tokensForExpression(value))
	return nil
}

func emitContainer(sb *hclwrite.Body, step StepIR, _ *model.Flow, _ map[string]*model.FlowStep, _ string) error {
	image, _ := step.Config["image"].(string)
	source, _ := step.Config["source"].(string)
	cmdRaw, _ := step.Config["cmd"]

	if image == "" && source == "" {
		image = "alpine:latest"
	}
	if image != "" {
		sb.SetAttributeValue("image", cty.StringVal(escapeString(image)))
	}
	if source != "" {
		sb.SetAttributeValue("source", cty.StringVal(escapeString(source)))
	}
	if cmdRaw != nil {
		if cmd, ok := cmdRaw.([]any); ok && len(cmd) > 0 {
			var parts []hclwrite.Tokens
			for _, c := range cmd {
				if str, ok := c.(string); ok {
					parts = append(parts, hclwrite.TokensForValue(cty.StringVal(escapeString(str))))
				}
			}
			if len(parts) > 0 {
				sb.SetAttributeRaw("cmd", hclwrite.TokensForTuple(parts))
			}
		}
	}
	envRaw, hasEnv := step.Config["env"]
	if hasEnv && envRaw != nil {
		if envMap, ok := envRaw.(map[string]any); ok && len(envMap) > 0 {
			keys := make([]string, 0, len(envMap))
			for k := range envMap {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			attrs := make([]hclwrite.ObjectAttrTokens, 0, len(keys))
			for _, k := range keys {
				if vs, ok := envMap[k].(string); ok {
					attrs = append(attrs, hclwrite.ObjectAttrTokens{
						Name:  hclwrite.TokensForValue(cty.StringVal(k)),
						Value: hclwrite.TokensForValue(cty.StringVal(escapeString(vs))),
					})
				}
			}
			if len(attrs) > 0 {
				sb.SetAttributeRaw("env", hclwrite.TokensForObject(attrs))
			}
		}
	}
	return nil
}

func emitPipelineStep(sb *hclwrite.Body, step StepIR, _ *model.Flow, _ map[string]*model.FlowStep, _ string) error {
	pipelineRef, _ := step.Config["pipelineRef"].(string)
	argsRaw, _ := step.Config["args"]

	if pipelineRef == "" {
		return fmt.Errorf("pipeline reference is required")
	}
	sb.SetAttributeRaw("pipeline", tokensFromExpression("pipeline."+pipelineRef))

	if argsRaw != nil {
		if args, ok := argsRaw.(map[string]any); ok && len(args) > 0 {
			keys := make([]string, 0, len(args))
			for k := range args {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			attrs := make([]hclwrite.ObjectAttrTokens, 0, len(keys))
			for _, k := range keys {
				v := args[k]
				var valToks hclwrite.Tokens
				switch val := v.(type) {
				case string:
					if strings.HasPrefix(val, "param.") || strings.HasPrefix(val, "step.") {
						valToks = tokensForExpression(val)
					} else {
						valToks = hclwrite.TokensForValue(cty.StringVal(escapeString(val)))
					}
				case float64:
					valToks = hclwrite.TokensForValue(cty.NumberFloatVal(val))
				case bool:
					valToks = hclwrite.TokensForValue(cty.BoolVal(val))
				default:
					continue
				}
				attrs = append(attrs, hclwrite.ObjectAttrTokens{
					Name:  hclwrite.TokensForValue(cty.StringVal(k)),
					Value: valToks,
				})
			}
			if len(attrs) > 0 {
				sb.SetAttributeRaw("args", hclwrite.TokensForObject(attrs))
			}
		}
	}
	return nil
}

func emitCommonAttrs(sb *hclwrite.Body, c *CommonAttrsIR) {
	if c.Title != "" {
		sb.SetAttributeValue("title", cty.StringVal(escapeString(c.Title)))
	}
	if c.Description != "" {
		sb.SetAttributeValue("description", cty.StringVal(escapeString(c.Description)))
	}
	if c.Timeout != "" {
		sb.SetAttributeValue("timeout", cty.StringVal(escapeString(c.Timeout)))
	}
	if c.TimeoutSeconds > 0 {
		sb.SetAttributeValue("timeout", cty.NumberIntVal(int64(c.TimeoutSeconds)))
	}
	if c.If != "" {
		sb.SetAttributeRaw("if", tokensForExpression(c.If))
	}
	if c.ForEach != "" {
		sb.SetAttributeRaw("for_each", tokensForExpression(c.ForEach))
	}
	if c.MaxConcurrency > 0 {
		sb.SetAttributeValue("max_concurrency", cty.NumberIntVal(int64(c.MaxConcurrency)))
	}
	if c.Error != nil {
		eb := sb.AppendNewBlock("error", nil)
		ebBody := eb.Body()
		if c.Error.Ignore {
			ebBody.SetAttributeValue("ignore", cty.True)
		}
		if c.Error.If != "" {
			ebBody.SetAttributeRaw("if", tokensForExpression(c.Error.If))
		}
	}
	if c.Loop != nil {
		lb := sb.AppendNewBlock("loop", nil)
		if c.Loop.Until != "" {
			lb.Body().SetAttributeRaw("until", tokensForExpression(c.Loop.Until))
		}
	}
	if c.Retry != nil {
		rb := sb.AppendNewBlock("retry", nil)
		if c.Retry.MaxAttempts > 0 {
			rb.Body().SetAttributeValue("max_attempts", cty.NumberIntVal(int64(c.Retry.MaxAttempts)))
		}
		if c.Retry.Strategy != "" {
			rb.Body().SetAttributeValue("strategy", cty.StringVal(escapeString(c.Retry.Strategy)))
		}
		if c.Retry.MinInterval > 0 {
			rb.Body().SetAttributeValue("min_interval", cty.NumberIntVal(int64(c.Retry.MinInterval)))
		}
		if c.Retry.If != "" {
			rb.Body().SetAttributeRaw("if", tokensForExpression(c.Retry.If))
		}
	}
	if c.Throw != nil {
		tb := sb.AppendNewBlock("throw", nil)
		if c.Throw.If != "" {
			tb.Body().SetAttributeRaw("if", tokensForExpression(c.Throw.If))
		}
		if c.Throw.Message != "" {
			tb.Body().SetAttributeValue("message", cty.StringVal(escapeString(c.Throw.Message)))
		}
	}
	if c.Output != nil {
		for _, o := range c.Output.Outputs {
			ob := sb.AppendNewBlock("output", []string{o.Name})
			ob.Body().SetAttributeRaw("value", tokensForExpression(o.Value))
		}
	}
}

func escapeString(s string) string {
	return strings.ReplaceAll(s, `\`, `\\`)
}
