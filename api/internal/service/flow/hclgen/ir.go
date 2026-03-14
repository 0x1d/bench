package hclgen

import (
	"github.com/0x1d/bench/api/internal/model"
)

// generatorVersion is the version of the HCL generator contract.
// Increment when step schemas or emission rules change.
const generatorVersion = 1

// PipelineIR is the typed intermediate representation for a Flowpipe pipeline.
// Built from model.Flow after normalization and validation.
type PipelineIR struct {
	Name    string
	Title   string
	Params  []ParamIR
	Steps   []StepIR
	Outputs []OutputIR
}

// ParamIR represents a pipeline param block.
type ParamIR struct {
	Name        string
	Type        string
	Description string
	Default     any // string, float64, bool, or nil
}

// StepIR represents a step block (http, query, message, etc.).
type StepIR struct {
	Type        string
	Label       string
	ID          string
	Config      map[string]any
	DependsOn   []string
	CommonAttrs *CommonAttrsIR
}

// OutputIR represents a pipeline output block.
type OutputIR struct {
	Name  string
	Value string // HCL expression (e.g. step.transform.foo.result)
}

// CommonAttrsIR holds common step attributes (title, description, if, for_each, etc.).
type CommonAttrsIR struct {
	Title          string
	Description    string
	Timeout        string // e.g. "30s" when from string config
	TimeoutSeconds int    // when from numeric config (e.g. 30)
	If             string
	ForEach        string
	MaxConcurrency int
	Error          *ErrorBlockIR
	Loop           *LoopBlockIR
	Retry          *RetryBlockIR
	Throw          *ThrowBlockIR
	Output         *StepOutputBlockIR
}

// ErrorBlockIR holds error block config.
type ErrorBlockIR struct {
	Ignore bool
	If     string
}

// LoopBlockIR holds loop block config.
type LoopBlockIR struct {
	Until string
}

// RetryBlockIR holds retry block config.
type RetryBlockIR struct {
	MaxAttempts int
	Strategy    string
	MinInterval int
	If          string
}

// ThrowBlockIR holds throw block config.
type ThrowBlockIR struct {
	If      string
	Message string
}

// StepOutputBlockIR holds per-step output block config.
type StepOutputBlockIR struct {
	Outputs []OutputIR
}

// BuildIR converts a model.Flow to PipelineIR after normalization.
// Uses deterministic ordering for map-based fields (env, args, etc.).
func BuildIR(flow *model.Flow, defaultDBID string) (*PipelineIR, error) {
	if flow == nil {
		return nil, nil
	}
	ir := &PipelineIR{
		Name:    pipelineName(flow),
		Title:   flow.Name,
		Params:  nil,
		Steps:   nil,
		Outputs: nil,
	}

	// Collect param blocks from input steps
	for _, step := range flow.Steps {
		if !isVirtualStep(step.Type) {
			continue
		}
		if stringsEqualFold(step.Type, "input") {
			params := paramsFromInput(step)
			ir.Params = append(ir.Params, params...)
		}
	}

	// Add connection params for used databases
	usedDBs := usedConnectionParamIDs(flow, defaultDBID)
	for _, dbID := range sortedKeys(usedDBs) {
		ir.Params = append(ir.Params, ParamIR{Name: "conn_" + dbID, Type: "string"})
	}

	// Build step IRs (skip virtual steps)
	for _, step := range flow.Steps {
		if isVirtualStep(step.Type) {
			continue
		}
		stepIR := stepToIR(step)
		ir.Steps = append(ir.Steps, stepIR)
	}

	// Collect output blocks from output steps
	for _, step := range flow.Steps {
		if !stringsEqualFold(step.Type, "output") {
			continue
		}
		outputs := outputsFromStep(step)
		ir.Outputs = append(ir.Outputs, outputs...)
	}

	return ir, nil
}
