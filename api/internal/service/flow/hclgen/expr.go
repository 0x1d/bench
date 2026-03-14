package hclgen

import (
	"strconv"
	"strings"

	"github.com/hashicorp/hcl/v2"
	"github.com/hashicorp/hcl/v2/hclsyntax"
	"github.com/hashicorp/hcl/v2/hclwrite"
	"github.com/zclconf/go-cty/cty"
)

// traversalFromPath builds an hcl.Traversal from a dot-separated path like "step.transform.foo".
// Returns nil if path is empty.
func traversalFromPath(path string) hcl.Traversal {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil
	}
	parts := strings.Split(path, ".")
	if len(parts) == 0 || parts[0] == "" {
		return nil
	}
	zeroRange := hcl.Range{}
	traversal := hcl.Traversal{
		hcl.TraverseRoot{Name: parts[0], SrcRange: zeroRange},
	}
	for i := 1; i < len(parts); i++ {
		if parts[i] != "" {
			traversal = append(traversal, hcl.TraverseAttr{Name: parts[i], SrcRange: zeroRange})
		}
	}
	return traversal
}

// tokensForExpression returns tokens for a value that may be a literal or expression.
//   - If s looks like a reference (param.x, step.type.name, notifier.x, connection.x, pipeline.x),
//     use traversal.
//   - Otherwise treat as literal (string or HCL expression like jsonencode(...)).
func tokensForExpression(s string) hclwrite.Tokens {
	s = strings.TrimSpace(s)
	if s == "" {
		return hclwrite.TokensForValue(cty.NullVal(cty.DynamicPseudoType))
	}
	// Simple traversals (no brackets): param.x, step.type.name, notifier.x, pipeline.x
	// connection.postgres[param.conn_local] has brackets - use raw lexing
	if !strings.Contains(s, "[") && !strings.Contains(s, "(") &&
		(strings.HasPrefix(s, "param.") || strings.HasPrefix(s, "step.") ||
			strings.HasPrefix(s, "notifier.") || strings.HasPrefix(s, "pipeline.")) {
		traversal := traversalFromPath(s)
		if traversal != nil {
			return hclwrite.TokensForTraversal(traversal)
		}
	}
	// Literal string or complex HCL expression - parse as raw.
	// For simple quoted strings we use cty.StringVal.
	// For expressions like jsonencode({...}) we need SetAttributeRaw.
	// Check if it's a simple string (starts and ends with quote, no interpolation)
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		// Already quoted - unescape and re-emit as proper HCL string
		inner := s[1 : len(s)-1]
		return hclwrite.TokensForValue(cty.StringVal(unescapeHCLInner(inner)))
	}
	// Number
	if isNumericLiteral(s) {
		if v, err := parseIntOrFloat(s); err == nil {
			return hclwrite.TokensForValue(v)
		}
	}
	// Boolean
	if s == "true" {
		return hclwrite.TokensForValue(cty.True)
	}
	if s == "false" {
		return hclwrite.TokensForValue(cty.False)
	}
	// Complex expression (jsonencode, etc.) - lex and convert to hclwrite tokens
	if toks := tokensFromExpression(s); len(toks) > 0 {
		return toks
	}
	// Fallback: treat as literal string (will be quoted)
	return hclwrite.TokensForValue(cty.StringVal(s))
}

// tokensForStringValue returns tokens for a string value.
// If the input contains template interpolation (${...}), emit as a quoted HCL
// template expression so interpolation is preserved in generated .fp output.
func tokensForStringValue(s string) hclwrite.Tokens {
	if strings.Contains(s, "${") {
		if toks := tokensFromExpression(strconv.Quote(s)); len(toks) > 0 {
			return toks
		}
	}
	return hclwrite.TokensForValue(cty.StringVal(escapeString(s)))
}

func setStringAttribute(body *hclwrite.Body, key, value string) {
	body.SetAttributeRaw(key, tokensForStringValue(value))
}

func tokensForTypeSpec(s string) hclwrite.Tokens {
	t := strings.TrimSpace(strings.ToLower(s))
	switch t {
	case "":
		t = "string"
	case "boolean":
		t = "bool"
	case "integer":
		t = "number"
	}
	if toks := tokensFromExpression(t); len(toks) > 0 {
		return toks
	}
	return tokensFromExpression("string")
}

// tokensFromExpression lexes s as HCL expression and returns hclwrite tokens.
// Returns nil if lexing fails or produces no meaningful tokens.
func tokensFromExpression(s string) hclwrite.Tokens {
	src := []byte(s)
	tokens, diags := hclsyntax.LexExpression(src, "", hcl.Pos{})
	if diags.HasErrors() || len(tokens) == 0 {
		return nil
	}
	out := make(hclwrite.Tokens, 0, len(tokens))
	for _, t := range tokens {
		if t.Type == hclsyntax.TokenEOF {
			continue
		}
		out = append(out, &hclwrite.Token{
			Type:  t.Type,
			Bytes: t.Bytes,
		})
	}
	return out
}

func unescapeHCLInner(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+1 < len(s) {
			i++
			b.WriteByte(s[i])
		} else {
			b.WriteByte(s[i])
		}
	}
	return b.String()
}

func isNumericLiteral(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c != '.' && c != '-' && (c < '0' || c > '9') {
			return false
		}
	}
	return true
}

func parseIntOrFloat(s string) (cty.Value, error) {
	if strings.Contains(s, ".") {
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return cty.NullVal(cty.Number), err
		}
		return cty.NumberFloatVal(f), nil
	}
	i, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return cty.NullVal(cty.Number), err
	}
	return cty.NumberIntVal(i), nil
}
