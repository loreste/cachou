package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

func main() {
	if os.Getenv("CACHOU_COMPILER_LEGACY") != "1" {
		if err := runCanonicalCompiler(); err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				os.Exit(exitErr.ExitCode())
			}
			fmt.Fprintf(os.Stderr, "Error starting canonical JS compiler: %v\n", err)
			os.Exit(1)
		}
		return
	}
	legacyMain()
}

// runCanonicalCompiler keeps the Go entrypoint behavior identical to the
// portable JavaScript compiler. The old Go implementation remains available
// only for explicit compatibility/debugging via CACHOU_COMPILER_LEGACY=1.
func runCanonicalCompiler() error {
	compiler, err := findCanonicalCompiler()
	if err != nil {
		return err
	}
	node, err := exec.LookPath("node")
	if err != nil {
		return fmt.Errorf("Node.js is required for the canonical compiler: %w", err)
	}
	args := append([]string{compiler}, os.Args[1:]...)
	cmd := exec.Command(node, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	return cmd.Run()
}

func findCanonicalCompiler() (string, error) {
	var candidates []string
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(cwd, "packages", "compiler", "bin", "cachou-compiler.js"))
	}
	if executable, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(executable)
		candidates = append(candidates,
			filepath.Join(exeDir, "..", "packages", "compiler", "bin", "cachou-compiler.js"),
			filepath.Join(exeDir, "packages", "compiler", "bin", "cachou-compiler.js"),
		)
	}
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("canonical compiler not found; expected packages/compiler/bin/cachou-compiler.js")
}

func legacyMain() {
	inputDir := flag.String("dir", "", "Directory containing .cachou files to compile")
	inputFile := flag.String("file", "", "Specific .cachou file to compile")
	outputDir := flag.String("out", "", "Output directory for compiled .js files")
	runtimeImport := flag.String("runtime", "cachoujs", "Module specifier used for the framework import (default: cachoujs)")
	flag.Parse()

	if *inputDir == "" && *inputFile == "" {
		fmt.Println("Usage: go run compiler.go -file <file.cachou> OR -dir <directory> [-out <dir>] [-runtime cachoujs]")
		os.Exit(1)
	}

	failed := false

	if *inputFile != "" {
		err := compileFile(*inputFile, *outputDir, *runtimeImport)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error compiling file %s: %v\n", *inputFile, err)
			failed = true
		}
	}

	if *inputDir != "" {
		err := filepath.Walk(*inputDir, func(path string, info os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if info.IsDir() || !strings.HasSuffix(info.Name(), ".cachou") {
				return nil
			}

			outDir := *outputDir
			if outDir != "" {
				relDir, err := filepath.Rel(*inputDir, filepath.Dir(path))
				if err != nil {
					return err
				}
				outDir = filepath.Join(outDir, relDir)
			}

			err := compileFile(path, outDir, *runtimeImport)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error compiling file %s: %v\n", path, err)
				failed = true
			}
			return nil
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error reading directory %s: %v\n", *inputDir, err)
			os.Exit(1)
		}
	}

	if failed {
		os.Exit(1)
	}
}

func compileFile(path string, outDir string, runtimeImport string) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	// Determine output filename and component name
	base := filepath.Base(path)
	ext := filepath.Ext(base)
	nameWithoutExt := strings.TrimSuffix(base, ext)
	componentName := uppercaseFirst(nameWithoutExt)

	// Determine output path first
	var outputPath string
	if outDir != "" {
		err := os.MkdirAll(outDir, 0755)
		if err != nil {
			return err
		}
		outputPath = filepath.Join(outDir, nameWithoutExt+".js")
	} else {
		outputPath = filepath.Join(filepath.Dir(path), nameWithoutExt+".js")
	}

	if runtimeImport == "" {
		runtimeImport = "cachoujs"
	}

	// Parse sections
	sections, err := parseComponentSections(string(content))
	if err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	scriptContent := sections.Script
	styleContent := sections.Style
	styleScoped := sections.StyleScoped
	htmlContent := strings.TrimSpace(sections.Template)

	// Scope HTML template and CSS styles
	scopeID := "data-c-" + sanitizeScopeID(nameWithoutExt)
	var scopedHTML string
	var scopedCSS string
	if err := validateTemplateTags(htmlContent); err != nil {
		line, col := lineCol(htmlContent, 0)
		return fmt.Errorf("%s: template validation failed near %d:%d: %w", path, line, col, err)
	}
	if styleContent != "" {
		if styleScoped {
			scopedHTML, err = scopeTemplate(htmlContent, scopeID)
			if err != nil {
				return fmt.Errorf("%s: %w", path, err)
			}
			scopedCSS, err = scopeCSS(styleContent, scopeID)
			if err != nil {
				return fmt.Errorf("%s: %w", path, err)
			}
		} else {
			if err := validateCSS(styleContent); err != nil {
				return fmt.Errorf("%s: %w", path, err)
			}
			scopedHTML = htmlContent
			scopedCSS = strings.TrimSpace(styleContent)
		}
	} else {
		scopedHTML = htmlContent
	}

	// CSS reactive binding: transform bind(expr) in styles to CSS custom
	// properties and generate reactive JS that sets them on the component root.
	var vBindSetup string
	if scopedCSS != "" {
		scopedCSS, vBindSetup = compileVBindCSS(scopedCSS)
	}

	// Replace JSX-style {expression} with template literal ${expression}
	compiledHTML, err := compileTemplateExpressions(scopedHTML)
	if err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}

	styleImport := ""
	if scopedCSS != "" {
		cssOutputPath := filepath.Join(filepath.Dir(outputPath), nameWithoutExt+".css")
		err = os.WriteFile(cssOutputPath, []byte(scopedCSS+"\n"), 0644)
		if err != nil {
			return err
		}
		// Keep generated components importable by raw Node SSR. Vite/browser
		// builds still load the sibling CSS, while Node never evaluates it.
		styleImport = fmt.Sprintf("if (typeof document !== \"undefined\") import(\"./%s.css\");\n", nameWithoutExt)
	}

	// Dead code elimination: skip setup section if script is empty
	setupSection := ""
	if strings.TrimSpace(scriptContent) != "" || vBindSetup != "" {
		combinedSetup := scriptContent
		if vBindSetup != "" {
			if combinedSetup != "" {
				combinedSetup += "\n\n  // --- CSS v-bind reactive bindings ---\n" + vBindSetup
			} else {
				combinedSetup = "// --- CSS v-bind reactive bindings ---\n" + vBindSetup
			}
		}
		setupSection = "\n  // --- Component Setup ---\n" + indentLines(combinedSetup, "  ") + "\n"
	}

	// Format JS Component output
	mapFile := nameWithoutExt + ".js.map"
	outputJS := fmt.Sprintf(`// Generated by CachouJS Compiler - DO NOT EDIT
// Source: %s
import * as Cachou from "%s";
%s
const {
  signal,
  effect,
  createRoot,
  memo,
  store,
  batch,
  onCleanup,
  onMount,
  html,
  mapArray,
  createResource,
  htmlStatic,
  Router,
  Route,
  Layout,
  Outlet,
  Link,
  navigate,
  getPath,
  getQueryParams,
  getRouteData,
  useRouteData,
  useHead,
  Show,
  Switch,
  Match
} = Cachou;

export default function %s(props = {}) {%s
  // --- Render ---
  return %s;
}
//# sourceMappingURL=%s
`, filepath.ToSlash(base), runtimeImport, styleImport, componentName, setupSection, renderExpression(compiledHTML), mapFile)

	err = os.WriteFile(outputPath, []byte(outputJS), 0644)
	if err != nil {
		return err
	}

	// External source map with original sourcesContent for editor navigation.
	if err := writeSourceMap(outputPath+".map", filepath.Base(outputPath), base, string(content), outputJS); err != nil {
		return err
	}

	fmt.Printf("Compiled: %s -> %s (Component: %s)\n", path, outputPath, componentName)
	return nil
}

func vlqEncode(value int) string {
	const vlqBase = 32
	const vlqBaseMask = vlqBase - 1
	const vlqContinuationBit = vlqBase
	const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

	vlq := value << 1
	if value < 0 {
		vlq = ((-value) << 1) | 1
	}
	var encoded strings.Builder
	for {
		digit := vlq & vlqBaseMask
		vlq >>= 5
		if vlq > 0 {
			digit |= vlqContinuationBit
		}
		encoded.WriteByte(base64Chars[digit])
		if vlq == 0 {
			break
		}
	}
	return encoded.String()
}

func writeSourceMap(mapPath, fileName, sourceName, sourceContent, generated string) error {
	// Line-level identity mapping: each generated line maps back to the same line
	// number in the .cachou source when possible (best-effort for navigation).
	genLines := strings.Split(generated, "\n")
	srcLines := strings.Split(sourceContent, "\n")
	var mappings []string
	prevSrcLine := 0
	for i := range genLines {
		srcLine := i
		if srcLine >= len(srcLines) {
			srcLine = len(srcLines) - 1
		}
		if srcLine < 0 {
			srcLine = 0
		}
		// VLQ: genCol=0, sourceIdx=0, srcLine=delta, srcCol=0
		segment := vlqEncode(0) + vlqEncode(0) + vlqEncode(srcLine-prevSrcLine) + vlqEncode(0)
		prevSrcLine = srcLine
		mappings = append(mappings, segment)
	}

	escapedSource, err := jsonQuote(sourceContent)
	if err != nil {
		return err
	}
	payload := fmt.Sprintf(
		`{"version":3,"file":%s,"sources":[%s],"sourcesContent":[%s],"names":[],"mappings":%s}`,
		strconv.Quote(fileName),
		strconv.Quote(filepath.ToSlash(sourceName)),
		escapedSource,
		strconv.Quote(strings.Join(mappings, ";")),
	)
	return os.WriteFile(mapPath, []byte(payload+"\n"), 0644)
}

func jsonQuote(s string) (string, error) {
	b, err := jsonMarshalString(s)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func jsonMarshalString(s string) ([]byte, error) {
	// Minimal JSON string marshal without encoding/json import churn in older paths.
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"', '\\':
			b.WriteByte('\\')
			b.WriteRune(r)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				b.WriteString(fmt.Sprintf(`\u%04x`, r))
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return []byte(b.String()), nil
}

func renderExpression(compiledHTML string) string {
	if !strings.Contains(compiledHTML, "${") {
		return "htmlStatic(" + strconv.Quote(compiledHTML) + ")"
	}

	// Static hoisting: if the template has large static regions around dynamic
	// parts, try to split top-level sibling elements into static fragments
	// where possible.  We look for top-level elements that contain no ${} and
	// hoist them to htmlStatic() calls, wrapping the remaining dynamic parts
	// in html`` and combining via an array.
	fragments := splitStaticFragments(compiledHTML)
	if len(fragments) > 1 {
		var parts []string
		for _, f := range fragments {
			if f.dynamic {
				parts = append(parts, "html`"+f.content+"`")
			} else {
				parts = append(parts, "htmlStatic("+strconv.Quote(f.content)+")")
			}
		}
		return "[" + strings.Join(parts, ", ") + "]"
	}

	return "html`" + "\n" + compiledHTML + "\n" + "`"
}

type templateFragment struct {
	content string
	dynamic bool
}

// splitStaticFragments splits a compiled HTML template into top-level
// sibling fragments, marking each as static or dynamic based on whether
// it contains ${} expressions.  Only splits when there are multiple
// top-level elements (siblings) to avoid breaking single-root templates.
func splitStaticFragments(html string) []templateFragment {
	// Find top-level element boundaries.
	type elementSpan struct {
		start int
		end   int
	}
	var spans []elementSpan
	i := 0
	for i < len(html) {
		// Skip whitespace between top-level elements
		for i < len(html) && isWhitespace(html[i]) {
			i++
		}
		if i >= len(html) {
			break
		}
		if html[i] != '<' {
			// Text or expression at top level — not safe to split
			return nil
		}
		if i+1 < len(html) && html[i+1] == '!' {
			// Comment node — skip to end
			endComment := strings.Index(html[i:], "-->")
			if endComment == -1 {
				return nil
			}
			i += endComment + 3
			continue
		}
		// Find the tag name
		tagStart := i
		tagEnd := findTagEnd(html, i+1)
		if tagEnd == -1 {
			return nil
		}
		tagName := readTagName(html[i : tagEnd+1])
		if tagName == "" {
			return nil
		}
		// Self-closing?
		if html[tagEnd-1] == '/' || isVoidElement(tagName) {
			spans = append(spans, elementSpan{tagStart, tagEnd + 1})
			i = tagEnd + 1
			continue
		}
		// Find matching close tag
		closeIdx := findTopLevelCloseTag(html, tagName, tagEnd+1)
		if closeIdx == -1 {
			return nil
		}
		closeEnd := closeIdx + len(tagName) + 3 // len("</") + tagName + len(">")
		spans = append(spans, elementSpan{tagStart, closeEnd})
		i = closeEnd
	}

	if len(spans) < 2 {
		return nil
	}

	hasStatic := false
	hasDynamic := false
	var fragments []templateFragment
	for _, span := range spans {
		content := html[span.start:span.end]
		isDynamic := strings.Contains(content, "${")
		fragments = append(fragments, templateFragment{content: content, dynamic: isDynamic})
		if isDynamic {
			hasDynamic = true
		} else {
			hasStatic = true
		}
	}

	// Only split if there's a mix of static and dynamic
	if !hasStatic || !hasDynamic {
		return nil
	}

	return fragments
}

func isVoidElement(tag string) bool {
	switch strings.ToLower(tag) {
	case "area", "base", "br", "col", "embed", "hr", "img", "input",
		"link", "meta", "param", "source", "track", "wbr":
		return true
	}
	return false
}

// findTopLevelCloseTag finds the closing </tagName> for a top-level element,
// accounting for nested elements with the same tag name.
func findTopLevelCloseTag(html string, tagName string, start int) int {
	depth := 1
	lowerName := strings.ToLower(tagName)
	i := start
	for i < len(html) {
		if html[i] != '<' {
			i++
			continue
		}
		end := findTagEnd(html, i+1)
		if end == -1 {
			return -1
		}
		tag := html[i : end+1]
		name := strings.ToLower(readTagName(tag))
		if name == lowerName {
			if len(tag) > 1 && tag[1] == '/' {
				depth--
				if depth == 0 {
					return i
				}
			} else if tag[len(tag)-2] != '/' {
				depth++
			}
		}
		i = end + 1
	}
	return -1
}

type componentSections struct {
	Script      string
	Style       string
	StyleScoped bool
	Template    string
}

func parseComponentSections(content string) (componentSections, error) {
	var sections componentSections
	remaining := content

	var err error
	remaining, sections.Script, err = extractTopLevelSection(remaining, "script")
	if err != nil {
		return sections, err
	}

	var styleAttrs string
	remaining, sections.Style, styleAttrs, err = extractTopLevelSectionWithAttrs(remaining, "style")
	if err != nil {
		return sections, err
	}
	sections.StyleScoped = hasBooleanAttr(styleAttrs, "scoped")

	sections.Script = strings.TrimSpace(sections.Script)
	sections.Style = strings.TrimSpace(sections.Style)
	sections.Template = strings.TrimSpace(remaining)
	return sections, nil
}

func extractTopLevelSection(content string, tagName string) (string, string, error) {
	remaining, inner, _, err := extractTopLevelSectionWithAttrs(content, tagName)
	return remaining, inner, err
}

func extractTopLevelSectionWithAttrs(content string, tagName string) (string, string, string, error) {
	openStart, openEnd := findTopLevelOpenTag(content, tagName)
	if openStart == -1 {
		return content, "", "", nil
	}

	closeStart := findClosingTag(content, tagName, openEnd)
	if closeStart == -1 {
		line, col := lineCol(content, openStart)
		return content, "", "", fmt.Errorf("missing closing </%s> for <%s> at %d:%d", tagName, tagName, line, col)
	}

	closeEnd := closeStart + len(tagName) + 3
	inner := content[openEnd:closeStart]
	openTag := content[openStart:openEnd]
	attrs := strings.TrimSpace(openTag[1+len(tagName) : len(openTag)-1])
	next := strings.TrimSpace(content[:openStart] + content[closeEnd:])
	return next, inner, attrs, nil
}

func findTopLevelOpenTag(content string, tagName string) (int, int) {
	lowerName := strings.ToLower(tagName)
	for i := 0; i < len(content); i++ {
		if content[i] != '<' || i+1 >= len(content) || content[i+1] == '/' {
			continue
		}
		end := findTagEnd(content, i+1)
		if end == -1 {
			return -1, -1
		}
		tag := content[i : end+1]
		if strings.ToLower(readTagName(tag)) == lowerName {
			return i, end + 1
		}
		i = end
	}
	return -1, -1
}

func findClosingTag(content string, tagName string, start int) int {
	needle := "</" + strings.ToLower(tagName) + ">"
	lower := strings.ToLower(content)
	idx := strings.Index(lower[start:], needle)
	if idx == -1 {
		return -1
	}
	return idx + start
}

func readTagName(tag string) string {
	if len(tag) < 3 || tag[0] != '<' {
		return ""
	}
	start := 1
	if tag[start] == '/' {
		start++
	}
	end := start
	for end < len(tag) {
		ch := tag[end]
		if ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' || ch == '/' || ch == '>' {
			break
		}
		end++
	}
	return tag[start:end]
}

func lineCol(content string, index int) (int, int) {
	line := 1
	col := 1
	for i := 0; i < len(content) && i < index; i++ {
		if content[i] == '\n' {
			line++
			col = 1
		} else {
			col++
		}
	}
	return line, col
}

func compileTemplateExpressions(template string) (string, error) {
	var out strings.Builder
	for i := 0; i < len(template); i++ {
		// Literal braces: {{ → { and }} → }
		if template[i] == '{' && i+1 < len(template) && template[i+1] == '{' {
			out.WriteByte('{')
			i++
			continue
		}
		if template[i] == '}' && i+1 < len(template) && template[i+1] == '}' {
			out.WriteByte('}')
			i++
			continue
		}
		if template[i] != '{' {
			out.WriteByte(template[i])
			continue
		}
		end, err := findExpressionEnd(template, i)
		if err != nil {
			return "", err
		}
		expr := strings.TrimSpace(template[i+1 : end])
		if expr == "" {
			line, col := lineCol(template, i)
			return "", fmt.Errorf("empty template expression at %d:%d (use {{ and }} for literal braces)", line, col)
		}
		out.WriteString("${")
		out.WriteString(expr)
		out.WriteByte('}')
		i = end
	}
	return out.String(), nil
}

func findExpressionEnd(template string, start int) (int, error) {
	depth := 0
	var quote byte
	escaped := false
	for i := start; i < len(template); i++ {
		ch := template[i]
		if quote != 0 {
			if escaped {
				escaped = false
				continue
			}
			if ch == '\\' {
				escaped = true
				continue
			}
			if ch == quote {
				quote = 0
			}
			continue
		}
		if ch == '"' || ch == '\'' || ch == '`' {
			quote = ch
			continue
		}
		if ch == '{' {
			depth++
			continue
		}
		if ch == '}' {
			depth--
			if depth == 0 {
				return i, nil
			}
			if depth < 0 {
				break
			}
		}
	}
	line, col := lineCol(template, start)
	return -1, fmt.Errorf("unclosed template expression at %d:%d", line, col)
}

func validateTemplateTags(html string) error {
	for i := 0; i < len(html); i++ {
		if html[i] != '<' || i+1 >= len(html) || html[i+1] == '!' || html[i+1] == '?' {
			continue
		}
		end := findTagEnd(html, i+1)
		if end == -1 {
			line, col := lineCol(html, i)
			return fmt.Errorf("unclosed HTML tag at %d:%d", line, col)
		}
		i = end
	}
	return nil
}

func scopeTemplate(html string, scopeAttr string) (string, error) {
	var out strings.Builder
	for i := 0; i < len(html); {
		if html[i] != '<' || i+1 >= len(html) || html[i+1] == '/' || html[i+1] == '!' || html[i+1] == '?' {
			out.WriteByte(html[i])
			i++
			continue
		}

		end := findTagEnd(html, i+1)
		if end == -1 {
			line, col := lineCol(html, i)
			return "", fmt.Errorf("unclosed HTML tag at %d:%d", line, col)
		}

		out.WriteString(addScopeAttrToTag(html[i:end+1], scopeAttr))
		i = end + 1
	}
	return out.String(), nil
}

func findTagEnd(html string, start int) int {
	var quote byte
	escaped := false
	expressionDepth := 0
	for i := start; i < len(html); i++ {
		ch := html[i]
		if quote != 0 {
			if escaped {
				escaped = false
				continue
			}
			if ch == '\\' {
				escaped = true
				continue
			}
			if ch == quote {
				quote = 0
			}
			continue
		}
		if ch == '"' || ch == '\'' || (expressionDepth > 0 && ch == '`') {
			quote = ch
			continue
		}
		if ch == '{' {
			expressionDepth++
			continue
		}
		if ch == '}' && expressionDepth > 0 {
			expressionDepth--
			continue
		}
		if ch == '>' {
			if expressionDepth == 0 {
				return i
			}
		}
	}
	return -1
}

func addScopeAttrToTag(tag string, scopeAttr string) string {
	tagNameEnd := 1
	for tagNameEnd < len(tag) {
		ch := tag[tagNameEnd]
		if ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' || ch == '/' || ch == '>' {
			break
		}
		tagNameEnd++
	}

	tagName := strings.ToLower(tag[1:tagNameEnd])
	if tagName == "script" || tagName == "style" {
		return tag
	}
	if regexp.MustCompile(`(?i)\s` + regexp.QuoteMeta(scopeAttr) + `(?:\s|=|>|/)`).MatchString(tag) {
		return tag
	}

	insertAt := len(tag) - 1
	if insertAt > 0 && tag[insertAt-1] == '/' {
		insertAt--
	}
	return tag[:insertAt] + ` ` + scopeAttr + tag[insertAt:]
}

func scopeCSS(css string, scopeAttr string) (string, error) {
	return scopeCSSBlock(css, scopeAttr, false)
}

func validateCSS(css string) error {
	_, err := scopeCSSBlock(css, "data-c-validate", false)
	return err
}

func scopeCSSBlock(css string, scopeAttr string, inKeyframes bool) (string, error) {
	var out strings.Builder
	for i := 0; i < len(css); {
		for i < len(css) && isWhitespace(css[i]) {
			i++
		}
		if i >= len(css) {
			break
		}

		headerStart := i
		open := findCSSOpenBrace(css, i)
		if open == -1 {
			remaining := strings.TrimSpace(css[i:])
			if remaining != "" {
				line, col := lineCol(css, i)
				return "", fmt.Errorf("CSS rule missing opening brace near %d:%d", line, col)
			}
			break
		}
		close := findMatchingBrace(css, open)
		if close == -1 {
			line, col := lineCol(css, open)
			return "", fmt.Errorf("unclosed CSS block for %q at %d:%d", strings.TrimSpace(css[headerStart:open]), line, col)
		}

		header := strings.TrimSpace(css[headerStart:open])
		body := strings.TrimSpace(css[open+1 : close])
		lowerHeader := strings.ToLower(header)

		if strings.HasPrefix(header, "@") {
			if strings.HasPrefix(lowerHeader, "@media") || strings.HasPrefix(lowerHeader, "@supports") || strings.HasPrefix(lowerHeader, "@container") || strings.HasPrefix(lowerHeader, "@layer") {
				out.WriteString(header)
				out.WriteString(" { ")
				scopedBody, err := scopeCSSBlock(body, scopeAttr, false)
				if err != nil {
					return "", err
				}
				out.WriteString(scopedBody)
				out.WriteString(" }\n")
			} else {
				out.WriteString(header)
				out.WriteString(" { ")
				out.WriteString(body)
				out.WriteString(" }\n")
			}
		} else if inKeyframes {
			out.WriteString(header)
			out.WriteString(" { ")
			out.WriteString(body)
			out.WriteString(" }\n")
		} else {
			out.WriteString(scopeSelectorList(header, scopeAttr))
			out.WriteString(" { ")
			out.WriteString(body)
			out.WriteString(" }\n")
		}

		i = close + 1
	}
	return strings.TrimSpace(out.String()), nil
}

func findCSSOpenBrace(css string, start int) int {
	var quote byte
	escaped := false
	for i := start; i < len(css); i++ {
		ch := css[i]
		if quote != 0 {
			if escaped {
				escaped = false
				continue
			}
			if ch == '\\' {
				escaped = true
				continue
			}
			if ch == quote {
				quote = 0
			}
			continue
		}
		if ch == '"' || ch == '\'' {
			quote = ch
			continue
		}
		if ch == '{' {
			return i
		}
	}
	return -1
}

func findMatchingBrace(css string, open int) int {
	depth := 0
	var quote byte
	escaped := false
	for i := open; i < len(css); i++ {
		ch := css[i]
		if quote != 0 {
			if escaped {
				escaped = false
				continue
			}
			if ch == '\\' {
				escaped = true
				continue
			}
			if ch == quote {
				quote = 0
			}
			continue
		}
		if ch == '"' || ch == '\'' {
			quote = ch
			continue
		}
		if ch == '{' {
			depth++
		} else if ch == '}' {
			depth--
			if depth == 0 {
				return i
			}
		}
	}
	return -1
}

func scopeSelectorList(selectorList string, scopeAttr string) string {
	selectors := splitSelectorList(selectorList)
	var scoped []string
	for _, sel := range selectors {
		selTrim := strings.TrimSpace(sel)
		if selTrim == "" {
			continue
		}
		if strings.Contains(selTrim, ":global(") {
			scoped = append(scoped, unwrapGlobalSelector(selTrim))
		} else if strings.Contains(selTrim, ":host") {
			scoped = append(scoped, strings.ReplaceAll(selTrim, ":host", "["+scopeAttr+"]"))
		} else {
			scoped = append(scoped, appendScopeAttrToSelector(selTrim, scopeAttr))
		}
	}
	return strings.Join(scoped, ", ")
}

func appendScopeAttrToSelector(selector string, scopeAttr string) string {
	attr := "[" + scopeAttr + "]"
	trimmed := strings.TrimSpace(selector)
	if trimmed == "" {
		return trimmed
	}
	insertAt := len(trimmed)
	for i := len(trimmed) - 1; i >= 0; i-- {
		if trimmed[i] == ':' {
			insertAt = i
			if i > 0 && trimmed[i-1] == ':' {
				insertAt = i - 1
			}
			break
		}
	}
	if insertAt == len(trimmed) {
		return trimmed + attr
	}
	return trimmed[:insertAt] + attr + trimmed[insertAt:]
}

func splitSelectorList(selectorList string) []string {
	var parts []string
	var current strings.Builder
	depth := 0
	var quote byte
	for i := 0; i < len(selectorList); i++ {
		ch := selectorList[i]
		if quote != 0 {
			current.WriteByte(ch)
			if ch == quote {
				quote = 0
			}
			continue
		}
		if ch == '"' || ch == '\'' {
			quote = ch
			current.WriteByte(ch)
			continue
		}
		if ch == '(' || ch == '[' {
			depth++
		} else if ch == ')' || ch == ']' {
			depth--
		}
		if ch == ',' && depth == 0 {
			parts = append(parts, current.String())
			current.Reset()
			continue
		}
		current.WriteByte(ch)
	}
	parts = append(parts, current.String())
	return parts
}

func unwrapGlobalSelector(selector string) string {
	out := selector
	for {
		start := strings.Index(out, ":global(")
		if start == -1 {
			return out
		}
		contentStart := start + len(":global(")
		end := findSelectorParenEnd(out, contentStart-1)
		if end == -1 {
			return out
		}
		out = out[:start] + out[contentStart:end] + out[end+1:]
	}
}

func findSelectorParenEnd(input string, open int) int {
	depth := 0
	for i := open; i < len(input); i++ {
		if input[i] == '(' {
			depth++
		} else if input[i] == ')' {
			depth--
			if depth == 0 {
				return i
			}
		}
	}
	return -1
}

func isWhitespace(ch byte) bool {
	return ch == ' ' || ch == '\n' || ch == '\t' || ch == '\r'
}

func hasBooleanAttr(attrs string, name string) bool {
	re := regexp.MustCompile(`(?i)(^|\s)` + regexp.QuoteMeta(name) + `(\s|=|$)`)
	return re.MatchString(attrs)
}

func sanitizeScopeID(name string) string {
	var out strings.Builder
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			out.WriteRune(r)
		} else {
			out.WriteByte('-')
		}
	}
	id := strings.Trim(out.String(), "-")
	if id == "" {
		return "component"
	}
	return id
}

func uppercaseFirst(str string) string {
	if len(str) == 0 {
		return ""
	}
	return strings.ToUpper(str[:1]) + str[1:]
}

func indentLines(str string, indent string) string {
	lines := strings.Split(str, "\n")
	for i, line := range lines {
		if line != "" {
			lines[i] = indent + line
		}
	}
	return strings.Join(lines, "\n")
}

// compileVBindCSS finds bind(expr) patterns in CSS, replaces them with
// CSS custom properties (var(--cachou-v-<name>)), and returns the updated
// CSS along with JS code that creates an effect to set those properties.
//
//	Input CSS:  .box { color: v-bind(textColor); }
//	Output CSS: .box { color: var(--cachou-v-textColor); }
//	Output JS:  effect(() => { const _el = document.querySelector("[data-c-...]");
//	              if (_el) _el.style.setProperty("--cachou-v-textColor", textColor); });
func compileVBindCSS(css string) (string, string) {
	re := regexp.MustCompile(`bind\(([^)]+)\)`)
	matches := re.FindAllStringSubmatch(css, -1)
	if len(matches) == 0 {
		return css, ""
	}

	// Deduplicate bindings
	seen := make(map[string]bool)
	type binding struct {
		expr    string
		varName string
	}
	var bindings []binding

	result := re.ReplaceAllStringFunc(css, func(match string) string {
		sub := re.FindStringSubmatch(match)
		expr := strings.TrimSpace(sub[1])
		// Sanitize expression to create a valid CSS custom property name
		varName := sanitizeVBindName(expr)
		if !seen[varName] {
			seen[varName] = true
			bindings = append(bindings, binding{expr: expr, varName: varName})
		}
		return "var(--cachou-v-" + varName + ")"
	})

	if len(bindings) == 0 {
		return result, ""
	}

	// Generate reactive JS that sets the CSS custom properties on the root
	// element.  The component root is the first child rendered, so we use a
	// ref-style approach: onMount sets properties via the returned element.
	var js strings.Builder
	js.WriteString("onMount(() => {\n")
	js.WriteString("  const _root = document.querySelector('[data-cachou-vbind]') || document.body;\n")
	js.WriteString("  effect(() => {\n")
	for _, b := range bindings {
		// If the expression is a simple identifier (signal getter), auto-call it.
		// If it already contains () or . or [], use as-is.
		expr := b.expr
		if isSimpleIdentifier(expr) {
			expr = expr + "()"
		}
		js.WriteString(fmt.Sprintf("    _root.style.setProperty('--cachou-v-%s', String(%s));\n", b.varName, expr))
	}
	js.WriteString("  });\n")
	js.WriteString("});\n")

	return result, js.String()
}

// isSimpleIdentifier checks if a string is a plain JS identifier (no dots, brackets, parens).
func isSimpleIdentifier(s string) bool {
	if s == "" {
		return false
	}
	for i, r := range s {
		if i == 0 && !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || r == '_' || r == '$') {
			return false
		}
		if i > 0 && !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '$') {
			return false
		}
	}
	return true
}

// sanitizeVBindName creates a valid CSS custom property suffix from a JS expression.
func sanitizeVBindName(expr string) string {
	var out strings.Builder
	for _, r := range expr {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			out.WriteRune(r)
		} else if r == '.' || r == '[' || r == ']' || r == '(' || r == ')' {
			out.WriteByte('-')
		}
	}
	result := strings.Trim(out.String(), "-")
	if result == "" {
		return "binding"
	}
	return result
}
