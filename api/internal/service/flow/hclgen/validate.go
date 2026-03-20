package hclgen

import (
	"fmt"

	"github.com/hashicorp/hcl/v2"
	"github.com/hashicorp/hcl/v2/hclparse"
)

// ValidateHCL parses the generated HCL and returns an error if it's invalid.
// Use before writing to catch generation bugs early.
func ValidateHCL(src []byte, filename string) error {
	parser := hclparse.NewParser()
	_, diags := parser.ParseHCL(src, filename)
	if diags.HasErrors() {
		return fmt.Errorf("invalid HCL: %w", diags)
	}
	return nil
}

// ValidateHCLDiags returns diagnostics for more detailed error reporting.
func ValidateHCLDiags(src []byte, filename string) hcl.Diagnostics {
	parser := hclparse.NewParser()
	_, diags := parser.ParseHCL(src, filename)
	return diags
}
