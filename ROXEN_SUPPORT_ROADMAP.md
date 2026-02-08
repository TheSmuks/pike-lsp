# Roxen Framework Support - Complete Implementation Roadmap

**Status:** Phase 1 Complete (Pike Module Support) | WIP for Full Framework Support

**Last Updated:** 2026-02-08

---

## Current Implementation (Phase 1 - COMPLETE ✅)

### What Works Now

**File Type:** `.pike` files (Roxen server-side modules)

**Detection Trigger:** Content-based patterns
```pike
inherit "module";        // Triggers Roxen module detection
#include <module.h>";    // Also triggers detection
```

**Features Implemented:**
- ✅ Module type detection (MODULE_TAG, MODULE_LOCATION, MODULE_FILTER, etc.)
- ✅ defvar variable extraction and symbol grouping
- ✅ RXML tag function detection (simpletag_*, container_*)
- ✅ RXML.Tag class-based tag detection
- ✅ Lifecycle callback detection (create(), start(), etc.)
- ✅ Diagnostic validation (missing required callbacks)
- ✅ MODULE_*/TYPE_*/VAR_* constant completions
- ✅ Real source positions (line/column tracking)
- ✅ Document symbols with "Roxen Module" container
- ✅ Fast-path detection and caching

**Test Coverage:** 16 tests (detect, defvar, tags, integration)

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

**File Type:** `.rjs`

**Detection:** File extension + specific Roxen JS API patterns

**Features Needed:**

1. **Roxen JS API Completions**
   ```javascript
   // Roxen global objects
   Roxen.             // Complete global APIs
   request_id->       // Complete RequestID methods
   this->             // Complete module methods
   ```

2. **Common .rjs Patterns**
   - `class MyClass { inherit "module"; ... }` - Detect in JS syntax
   - `defvar()` calls in JS
   - Tag function definitions

**Technical Approach:**
- Extend Pike LSP to understand .rjs as Pike-with-JS syntax
- Reuse existing Roxen detection for `inherit "module"` patterns
- Add JS-specific Roxen API completions

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

**Current State:** Tag catalog deleted (696KB dead code in Phase 1)

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
- Bridge method: `roxenGetTagCatalog()` → fetch from server
- Parse module files for simpletag_*/container_* definitions
- Merge server tags with custom module tags

---

### Phase 6: Advanced Features

**6.1 Go-to-Definition for Tags**
- From template tag usage → Tag definition in .pike file
- From defvar usage → defvar declaration
- From callback reference → Function definition

**6.2 Find References**
- Find all usages of a tag across templates
- Find all references to a defvar
- Find all modules using a specific tag

**6.3 Rename Symbol**
- Rename tag functions across all files
- Rename defvar with safe refactoring
- Update all template usages

**6.4 Hover Documentation**
- Hover over tag → Show tag documentation
- Hover over defvar → Show type and description
- Hover over MODULE_* constant → Show description

**6.5 Code Actions**
- "Add missing query_location()" for MODULE_LOCATION
- "Add missing start()/stop()" for modules with lifecycle
- "Extract to custom tag" refactoring

---

### Phase 7: Testing & Tooling

**7.1 E2E Test Coverage**
- Test Roxen module file editing
- Test RXML template editing
- Test .rjs file editing
- Test mixed Pike+RXML files

**7.2 Roxen Server Integration**
- Option to connect to live Roxen instance
- Load tag catalog from server
- Validate against server's module configuration

**7.3 Documentation**
- VSCode extension README updates
- Roxen-specific feature documentation
- Example Roxen module with LSP features

---

## Implementation Priority

| Phase | Effort | Value | Priority | Dependencies |
|-------|--------|-------|----------|--------------|
| Phase 2 (RXML Templates) | High | High | **P1** | None |
| Phase 5 (Tag Catalog) | Medium | High | **P1** | Phase 2 |
| Phase 3 (.rjs Support) | Medium | Medium | P2 | None |
| Phase 4 (Mixed Files) | High | Medium | P2 | Phase 2 |
| Phase 6 (Advanced) | High | High | P3 | Phases 2-5 |
| Phase 7 (Testing) | Medium | High | **P1** | All phases |

**Recommended Order:**
1. Phase 2 → Phase 5 → Phase 7 (Minimum viable RXML support)
2. Phase 3 → Phase 4 → Phase 6 → Phase 7 (Complete framework support)

---

## Technical Considerations

### File Extension Registration

**VSCode Extension (package.json):**
```json
"languages": [{
  "id": "pike",
  "aliases": ["Pike", "roxen"],
  "extensions": [".pike", ".pmod"],
  "configuration": "./language-configuration.json"
}, {
  "id": "rxml",
  "aliases": ["RXML", "Roxen Template"],
  "extensions": [".inc", ".rxml", ".roxen"],
  "configuration": "./rxml-language-configuration.json"
}]
```

### Language Server Configuration

**Document Selectors:**
```typescript
// For .pike Roxen modules
{ scheme: 'file', language: 'pike', pattern: '**/*.pike' }

// For RXML templates (future)
{ scheme: 'file', language: 'rxml', pattern: '**/*.{inc,rxml,roxen}' }

// For .rjs files (future)
{ scheme: 'file', language: 'javascript', pattern: '**/*.rjs' }
```

### Bridge Methods Needed

```typescript
// Future bridge methods for full support
bridge.roxenParseTemplate(code: string, uri: string): Promise<RXMLTag[]>;
bridge.roxenGetTagCatalog(): Promise<RoxenTagInfo[]>;
bridge.roxenValidateTemplate(code: string): Promise<RoxenDiagnostic[]>;
```

---

## Estimated Effort

| Phase | Files | Tests | Time |
|-------|-------|-------|------|
| Phase 2 (RXML) | ~15 | ~30 | 2-3 days |
| Phase 3 (.rjs) | ~8 | ~15 | 1-2 days |
| Phase 4 (Mixed) | ~10 | ~20 | 2 days |
| Phase 5 (Catalog) | ~5 | ~10 | 1 day |
| Phase 6 (Advanced) | ~20 | ~40 | 3-4 days |
| Phase 7 (Testing) | ~10 | ~25 | 1-2 days |
| **TOTAL** | **~68** | **~140** | **10-14 days** |

---

## Current Status Summary

**Completed:** Phase 1 (Pike Module Support)
- ✅ 36 files changed, 3817 insertions
- ✅ 1738 tests passing
- ✅ Architect verification: PASS
- ✅ Branch: `feat/roxen-module-lsp`

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
- Pike Bridge: `packages/pike-bridge/src/roxen.ts`
