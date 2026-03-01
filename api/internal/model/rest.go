package model

// RestResource represents a REST resource for list response.
type RestResource struct {
	ID           string `json:"id"`
	Label        string `json:"label"`
	BaseURL      string `json:"baseUrl"`
	OpenAPISpec  string `json:"openapiSpec,omitempty"`
}
