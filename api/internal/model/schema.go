package model

// SchemaSource is the on-disk location of a schema file. Paths are relative to the config directory.
type SchemaSource struct {
	// Path is the path to the schema file, relative to the Bench config directory.
	Path string `json:"path"`
}

// SchemaResource is a registered schema returned by the schema registry API.
type SchemaResource struct {
	// ID is the stable identifier from config.
	ID string `json:"id"`
	// Label is the human-readable name; defaults to ID when unset in config.
	Label string `json:"label"`
	// Type is the schema kind: openapi, asyncapi, or json-schema.
	Type string `json:"type"`
	// Source locates the schema file on disk.
	Source SchemaSource `json:"source"`
}
