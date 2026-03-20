package hclgen

// Schema exposes step types and attributes for HCL expression autocomplete.
// Aligns with stepEmitters in builder.go and Flowpipe step output schemas.

// StepTypes returns the supported Flowpipe step block types (e.g. http, query).
func StepTypes() []string {
	return []string{"http", "query", "message", "sleep", "transform", "container", "pipeline"}
}

// StepAttributes returns output attributes per step type for step.<type>.<name>.<attr>.
// Keys match StepTypes(); values are the attribute names available on each step output.
func StepAttributes() map[string][]string {
	return map[string][]string{
		"http":      {"response_body", "response_status", "request_body"},
		"query":     {"rows"},
		"message":   {},
		"transform": {"output"},
		"container": {"stdout", "stderr", "lines", "exit_code", "container_id"},
		"pipeline":  {"output"},
		"sleep":     {},
	}
}
