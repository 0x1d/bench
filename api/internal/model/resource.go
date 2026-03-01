package model

// Root represents a configurable root path for resource browsing.
type Root struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Path  string `json:"-"` // Server-side only, not exposed to client
}

// ResourceEntry represents a file or directory in a listing.
type ResourceEntry struct {
	Name   string `json:"name"`
	Path   string `json:"path"`
	IsDir  bool   `json:"isDir"`
	Size   int64  `json:"size,omitempty"`
	Mtime  int64  `json:"mtime,omitempty"`
}

// RootsResponse is the response for GET /api/resources/roots.
type RootsResponse struct {
	Roots []Root `json:"roots"`
}

// ListResponse is the response for GET /api/resources (list).
type ListResponse struct {
	Entries []ResourceEntry `json:"entries"`
	Roots   []Root          `json:"roots"`
}

// TreeEntry represents a file or directory in a recursive tree listing.
type TreeEntry struct {
	Name     string      `json:"name"`
	Path     string      `json:"path"`
	IsDir    bool        `json:"isDir"`
	Size     int64       `json:"size,omitempty"`
	Mtime    int64       `json:"mtime,omitempty"`
	Children []TreeEntry `json:"children,omitempty"`
}

// TreeResponse is the response for GET /api/resources?recursive=true.
type TreeResponse struct {
	Entries []TreeEntry `json:"entries"`
	Roots   []Root      `json:"roots"`
}

// RenameRequest is the request body for PATCH /api/resources.
type RenameRequest struct {
	Root    string `json:"root"`
	Path    string `json:"path"`
	NewName string `json:"newName"`
}

// MoveRequest is the request body for PUT /api/resources (move).
type MoveRequest struct {
	Root        string `json:"root"`
	Path        string `json:"path"`
	Destination string `json:"destination"`
}

// CreateDirRequest is the request body for POST when creating a folder.
type CreateDirRequest struct {
	Action string `json:"action"`
	Name   string `json:"name"`
}
