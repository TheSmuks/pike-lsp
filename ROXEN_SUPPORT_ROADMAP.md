# Roxen Framework Support - Complete Implementation Roadmap

**Status:** Phase 1 Complete (Pike Module Support) | WIP for Full Framework Support

**Last Updated:** 2026-02-08

---

## Current Implementation (Phase 1 - COMPLETE)

### What Works Now

**File Type:** `.pike` files (Roxen server-side modules), plus any extension mapped to Pike via `files.associations`

**Detection Trigger:** Content-based patterns (6 fast-path markers)
```pike
inherit "module";                   // Triggers Roxen module detection
inherit 'module';                   // Single-quote variant
inherit "filesystem";               // Filesystem module detection
inherit 'filesystem';               // Single-quote variant
#include <module.h>                 // Header include trigger
constant module_type = MODULE_;     // Direct module type declaration
```

> **Note:** Both TS-side (`detector.ts:hasMarkers()`) and Pike-side (`has_fast_path_markers()`) check all 6 patterns for parity.

**Features Implemented:**
- Module type detection (MODULE_TAG, MODULE_LOCATION, MODULE_FILTER, etc.)
- defvar variable extraction and symbol grouping
- RXML tag function detection (simpletag_*, container_*)
- RXML.Tag class-based tag detection
- Lifecycle callback detection (create(), start(), etc.)
- Diagnostic validation (missing required callbacks, 500ms debounce)
- MODULE_*/TYPE_*/VAR_* constant completions
- RequestID member completions (23 items: properties like `conf`, `variables`, `cookies`, `remoteaddr`; methods like `set_max_cache()`, `url_base()`)
- Real source positions (line/column tracking)
- Document symbols with "Roxen Module" container
- Fast-path detection and caching (see note above about TS/Pike gap)

**Test Coverage:** 74 tests across 3 layers
- Pike-side: 21 tests (7 detect, 4 defvar, 5 module_detection, 5 tags)
- Bridge: 14 tests (detect, parse tags, parse vars, callbacks, validate)
- TS-side: 39 tests (8 completion, 10 constants, 5 diagnostics, 10 integration, 6 symbols)

**Known Issues:**
- TS-side fast-path checks fewer patterns than Pike-side (see Detection Trigger note)
- Pike-side analysis uses `Parser.Pike.split()` (ADR-001 compliant); TS-side completion triggers use regex prefix matching (intentional for line-level triggering)

---

## Custom File Extensions

For file types like `.rjs` or `.inc`, users can add file associations in VSCode settings:

```json
// .vscode/settings.json (workspace) or User settings
{
  "files.associations": {
    "*.rjs": "pike",
    "*.inc": "pike"
  }
}
```

This tells VSCode to treat these files as Pike, enabling full LSP support including Roxen module detection. Phase 2 will add dedicated RXML language support for `.inc` files with pure RXML content.

---

## What's Missing (Phases 2-6)

### Phase 2: RXML Template Support (HTML/XML/INC Files)

**File Types:** `.html`, `.xml`, `.inc`, `.pike` (template mode)

**Detection Needed:**
```html
<!-- RXML tags in HTML/XML -->
<roxen>
  <container name="box">
    <contents>...</contents>
  </container>
</roxen>

<!-- OR inline RXML -->
<set variable="foo">value</set>
<emit source="sql">...</emit>
```

**Features to Implement:**

1. **Tag Detection**
   - Parse XML/HTML for RXML tag names
   - Detect container tags vs simple tags
   - Extract tag attributes and their types

2. **Completions**
   - RXML tag names (<roxen>, <set>, <emit>, <if>, <elseif>, etc.)
   - Tag-specific attributes based on tag type
   - Attribute value suggestions (e.g., source="sql|file|dir")

3. **Diagnostics**
   - Unknown RXML tags
   - Missing required attributes
   - Invalid attribute values
   - Unclosed container tags

4. **Document Symbols**
   - RXML tags as symbol tree
   - Container hierarchy (nesting)

**Technical Approach:**
- Use XML/HTML parser for template files
- Map RXML tag catalog to completion items
- Validate against Roxen's tag registry

---

### Phase 3: Roxen JavaScript (.rjs) Support

**File Type:** `.rjs` (Roxen + JavaScript mixed content files)

**Background:** Some Roxen deployments use `.rjs` files that combine Roxen/Pike server-side patterns with JavaScript. These files may contain Pike-style constructs (e.g., `inherit`, `defvar()`) alongside JavaScript code.

**Detection:** File extension via `files.associations` + content-based patterns

**Features Needed:**

1. **Roxen API Completions in .rjs context**
   ```
   Roxen.             // Complete global Roxen APIs
   request_id->       // Complete RequestID methods
   ```

2. **Mixed Content Handling**
   - Detect Roxen/Pike patterns within .rjs files
   - Provide Roxen-specific completions alongside JS
   - `defvar()` calls
   - Tag function definitions

**Technical Approach:**
- Treat `.rjs` as Pike via `files.associations` for basic support (works today)
- For full mixed-content support: detect Pike regions vs JS regions
- Reuse existing Roxen detection for `inherit "module"` patterns
- Add Roxen-specific API completions

**Open Questions:**
- What is the exact syntax boundary between Roxen/Pike and JS regions in .rjs files?
- Should .rjs get its own language ID or remain mapped to Pike?

---

### Phase 4: Mixed Pike + RXML Files

**File Types:** `.pike` files with embedded RXML

**Example:**
```pike
// my_template.pike
inherit "module";
constant module_type = MODULE_TAG;

string simpletag_foo(string tag_name, mapping args, string contents, RequestID id) {
  return "<html>" + contents + "</html>";
}

// OR inline RXML processing
constant rxml_content = #"
  <set variable='foo'>bar</set>
  <emit source='sql'>SELECT * FROM table</emit>
";
```

**Features Needed:**

1. **Dual Syntax Highlighting**
   - Pike code regions
   - RXML string regions

2. **Context-Aware Completions**
   - Pike completions in code regions
   - RXML completions in string regions
   - Tag function signatures

**Technical Approach:**
- Detect RXML strings (multiline #"...") in Pike code
- Apply RXML parsing within string regions
- Merge Pike and RXML symbol trees

---

### Phase 5: Tag Catalog Integration

**Needed:**

1. **Dynamic Tag Loading**
   - Load available tags from running Roxen server
   - Cache tag definitions (name, attributes, types)
   - Invalidate cache on server restart

2. **Custom Module Tags**
   - Detect tags defined in modules
   - Complete custom tag names
   - Show tag documentation

**Technical Approach:**
- Bridge method: `roxenGetTagCatalog()` to fetch from server
- Parse module files for simpletag_*/container_* definitions
- Merge server tags with custom module tags

**Dependencies:** Phase 2, running Roxen server instance

---

### Phase 6: Advanced Features

**6.1 Go-to-Definition for Tags**
- From template tag usage to tag definition in .pike file
- From defvar usage to defvar declaration
- From callback reference to function definition

**6.2 Find References**
- Find all usages of a tag across templates
- Find all references to a defvar
- Find all modules using a specific tag

**6.3 Rename Symbol**
- Rename tag functions across all files
- Rename defvar with safe refactoring
- Update all template usages

**6.4 Hover Documentation**
- Hover over tag to show tag documentation
- Hover over defvar to show type and description
- Hover over MODULE_* constant to show description

**6.5 Code Actions**
- "Add missing query_location()" for MODULE_LOCATION
- "Add missing start()/stop()" for modules with lifecycle
- "Extract to custom tag" refactoring

---

### Testing Strategy

Testing is integrated into each phase rather than a separate phase. Each phase includes:

**Per-Phase Testing:**
- E2E tests for the file types introduced in that phase
- Unit tests for new provider logic
- Bridge tests for new Pike-side methods

**Cross-Cutting Testing (after Phase 5):**
- Roxen server integration tests (requires live instance)
- Cross-file reference tests (tags used across templates and modules)

**Documentation (before each release):**
- VSCode extension README updates
- Roxen-specific feature documentation
- Example Roxen module with LSP features

---

## Implementation Priority

| Phase | Effort | Value | Priority | Dependencies |
|-------|--------|-------|----------|--------------|
| Phase 2 (RXML Templates) | High | High | **P1** | None |
| Phase 5 (Tag Catalog) | Medium | High | **P1** | Phase 2, Roxen server |
| Phase 3 (.rjs Support) | Medium | Medium | P2 | None |
| Phase 4 (Mixed Files) | High | Medium | P2 | Phase 2 |
| Phase 6 (Advanced) | High | High | P3 | Phases 2-5 |

**Recommended Order:**
1. Phase 2 + Phase 5 (Minimum viable RXML support)
2. Phase 3 + Phase 4 + Phase 6 (Complete framework support)

---

## Technical Considerations

### File Extension Registration

**VSCode Extension (package.json) - current:**
```json
"languages": [{
  "id": "pike",
  "aliases": ["Pike", "pike"],
  "extensions": [".pike", ".pmod"],
  "configuration": "./language-configuration.json"
}]
```

**Future (Phase 2) - add RXML language:**
```json
{
  "id": "rxml",
  "aliases": ["RXML", "Roxen Template"],
  "extensions": [".rxml", ".roxen"],
  "configuration": "./rxml-language-configuration.json"
}
```

> **Note:** `.inc` and `.rjs` are generic extensions used by other ecosystems. These should be configured via `files.associations` in user/workspace settings rather than registered globally in `package.json`.

### Language Server Configuration

**Document Selectors:**
```typescript
// For .pike Roxen modules (current)
{ scheme: 'file', language: 'pike', pattern: '**/*.pike' }

// For RXML templates (future - Phase 2)
{ scheme: 'file', language: 'rxml', pattern: '**/*.{rxml,roxen}' }
```

### Bridge Methods Needed

```typescript
// Existing bridge methods (Phase 1)
bridge.roxenDetect(code, filename): Promise<RoxenModuleInfo>;
bridge.roxenParseTags(code, filename): Promise<RoxenTagResult>;
bridge.roxenParseVars(code, filename): Promise<RoxenVarResult>;
bridge.roxenGetCallbacks(code, filename): Promise<RoxenCallbackResult>;
bridge.roxenValidate(code, filename): Promise<RoxenValidationResult>;

// Future bridge methods
bridge.roxenParseTemplate(code, uri): Promise<RXMLTag[]>;
bridge.roxenGetTagCatalog(): Promise<RoxenTagInfo[]>;
bridge.roxenValidateTemplate(code): Promise<RoxenDiagnostic[]>;
```

---

## Estimated Effort

| Phase | Files | Tests | Estimate |
|-------|-------|-------|----------|
| Phase 2 (RXML) | ~15 | ~30 | 2-3 days |
| Phase 3 (.rjs) | ~8 | ~15 | 1-2 days |
| Phase 4 (Mixed) | ~10 | ~20 | 2 days |
| Phase 5 (Catalog) | ~5 | ~10 | 1 day |
| Phase 6 (Advanced) | ~20 | ~40 | 3-4 days |
| **TOTAL** | **~58** | **~115** | **9-12 days** |

> Estimates are rough and do not account for unforeseen complexity.

---

## Current Status Summary

**Completed:** Phase 1 (Pike Module Support)
- 39 files changed, 3739 insertions(+), 1371 deletions(-)
- 74 Roxen-specific tests passing (project-wide: 1738+)
- Architect verification: PASS
- Merged via PR #18 (`feat/roxen-module-lsp`)

**Next Steps:**
1. Release Phase 1 as "WIP - Pike Module Support"
2. Gather user feedback from real Roxen developers
3. Prioritize Phase 2 (RXML Templates) based on demand
4. Incremental releases for each phase

---

## References

- Roxen Module Documentation: `/home/smuks/OpenCode/Roxen/`
- Current Implementation: `.omc/plans/roxen-lsp-v3-improvements.md`
- Test Suite: `packages/pike-lsp-server/src/tests/features/roxen/`
- Pike Bridge: `packages/pike-bridge/src/roxen.test.ts`
- Correctness Review: `.omc/plans/roxen-roadmap-review.md`
