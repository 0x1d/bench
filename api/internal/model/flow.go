package model

// FlowStep represents a single step in a flow.
type FlowStep struct {
	ID        string            `json:"id"`
	Type      string            `json:"type"` // "http", "query", etc.
	Label     string            `json:"label"`
	Config    map[string]any    `json:"config"`
	DependsOn []string          `json:"dependsOn,omitempty"` // step IDs this step depends on
	Position  *FlowStepPosition `json:"position,omitempty"`
}

// FlowStepPosition holds React Flow node position.
type FlowStepPosition struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// FlowEdge represents a connection between steps (for React Flow).
type FlowEdge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
}

// Flow represents a flow definition.
type Flow struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	Steps       []FlowStep `json:"steps"`
	Edges       []FlowEdge `json:"edges,omitempty"`
	Triggers    []string   `json:"triggers,omitempty"` // list of trigger IDs attached to this flow
}

// FlowStepConfigHTTP holds config for an HTTP step (REST).
type FlowStepConfigHTTP struct {
	RestID  string            `json:"restId"`
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Body    string            `json:"body,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
}

// FlowStepConfigQuery holds config for a query step (database).
type FlowStepConfigQuery struct {
	DatabaseID string   `json:"databaseId"`
	SQL        string   `json:"sql"`
	Args       []string `json:"args,omitempty"` // step references like "step.http.foo.response_body.id"
}
