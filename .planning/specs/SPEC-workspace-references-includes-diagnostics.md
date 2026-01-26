# Specification: Workspace-Wide References, Include Navigation, and Diagnostic Fixes

**Date**: 2026-01-26
**Status**: Draft
**Priority**: High

---

## Executive Summary

This specification addresses three related issues in the Pike LSP:

1. **References are file-scoped** - Currently only finds references in open documents
2. **Include/import navigation broken** - CTRL+CLICK on `#include` or `import` doesn't navigate to definitions from included content
3. **Uninitialized variable false positives** - The `pike-uninitialized` diagnostic reports false positives, particularly in `foreach` loops

---

## Issue 1: Workspace-Wide References

### Current Behavior

References search is limited to documents in `documentCache.entries()` - only files that are currently open in the editor.

**Code Location**: `packages/pike-lsp-server/src/features/navigation/references.ts`

```typescript
// Current: Only iterates open documents
for (const [otherUri] of Array.from(documentCache.entries())) {
    // ... search logic
}
```

### Problem

- User opens `main.pike` and wants to find all references to `my_function()`
- `utils.pike` (not open) also calls `my_function()` but is not searched
- References shows incomplete results

### Proposed Solution

#### Phase 1: Workspace File Discovery

1. **Add workspace scanner service**
   - Scan workspace for all `.pike` and `.pmod` files on startup
   - Watch for file changes (create/delete/rename)
   - Maintain a `WorkspaceFiles` cache: `Map<string, WorkspaceFileInfo>`

2. **WorkspaceFileInfo structure**:
   ```typescript
   interface WorkspaceFileInfo {
       uri: string;
       lastModified: number;
       symbols?: ParsedSymbol[];  // Lazy-loaded on demand
       symbolPositions?: Map<string, Position[]>;
   }
   ```

#### Phase 2: On-Demand Indexing

1. **When references are requested**:
   - First search open documents (fast path, current behavior)
   - Then iterate workspace files not in documentCache
   - Read and parse files on-demand (with caching)

2. **Optimization: Symbol index**
   - Build global `symbolIndex: Map<symbolName, Set<fileUri>>`
   - Only read files that contain the symbol
   - Update index on file change events

#### Phase 3: Background Indexing (Optional)

- Index files in background during idle time
- Pre-populate symbolPositions for common symbols
- Configurable via setting: `pike.references.backgroundIndexing`

### Implementation Files

| File | Changes |
|------|---------|
| `services/workspace-scanner.ts` | NEW: File discovery and watching |
| `services/symbol-index.ts` | NEW: Cross-file symbol index |
| `features/navigation/references.ts` | Use workspace scanner for search |
| `features/advanced/code-lens.ts` | Use workspace-wide count for "N references" |

### Testing

- Open single file, verify references finds usages in unopened files
- Add/remove files, verify index updates
- Performance: workspace with 100+ Pike files should complete in <500ms

---

## Issue 2: Include/Import Navigation

### Current Behavior

#### `#include` Handling

**Code Location**: `pike-scripts/LSP.pmod/Parser.pike:56-86`

- `#include` is extracted and stored as a symbol with `kind: "import"`
- The path is stored in `classname` field
- The included file is NOT parsed or indexed
- Definition handler checks for `kind === 'import'` but resolution fails

```pike
// Current parsing (Parser.pike:72-85)
symbols += ({
    ([
        "name": include_path,
        "kind": "import",
        "classname": include_path  // Path stored here
    ])
});
```

#### `import` Handling

- Pike `import Module.Name;` statements are parsed by `Tools.AutoDoc.PikeParser`
- Detected via `->Import(` in symbol representation
- Module path is stored but navigation doesn't work

### Problems

1. **Include path not resolved to absolute path**
   - `#include "utils.pike"` - relative path not resolved
   - `#include <Pike.Foo>` - stdlib path not resolved

2. **Included file content not accessible**
   - CTRL+CLICK on function from included file doesn't work
   - Hover on included symbols doesn't work

3. **Import statements don't navigate**
   - `import Stdio;` - doesn't navigate to Stdio module

4. **No IntelliSense for included/imported symbols**
   - Symbols from `#include` files don't appear in autocomplete
   - Symbols from `import` modules don't appear in autocomplete
   - No signature help for functions from included files

### Proposed Solution

#### Phase 1: Include Path Resolution

1. **Add include resolver to Pike bridge**
   - New method: `resolveInclude(currentFile, includePath) -> absolutePath`
   - Handle relative paths (`"..."`)
   - Handle system paths (`<...>`)
   - Use Pike's include search paths

2. **Update Parser.pike**
   ```pike
   // Store resolved path along with original
   symbols += ({
       ([
           "name": include_path,
           "kind": "import",
           "originalPath": include_path,
           "resolvedPath": resolved_absolute_path,
           "position": ([...])
       ])
   });
   ```

#### Phase 2: Definition Handler Updates

**Code Location**: `packages/pike-lsp-server/src/features/navigation/definition.ts:91-113`

1. **When clicking on `#include` line**:
   - Detect if cursor is on include statement
   - Resolve path to absolute
   - Navigate to file:line 0

2. **When clicking on symbol from included file**:
   - Check if symbol exists in current file's symbols
   - If not found, search through resolved includes
   - Parse included file and search its symbols

#### Phase 3: Import Statement Navigation

1. **For Pike `import Module.Name;`**:
   - Use existing `stdlibIndex.getModule()` for stdlib
   - Use file resolver for local modules
   - Navigate to module file

#### Phase 4: IntelliSense for Included/Imported Symbols

Symbols from included and imported files must appear in autocomplete suggestions.

1. **Track include/import dependencies per file**
   ```typescript
   interface DocumentDependencies {
       includes: ResolvedInclude[];  // #include statements
       imports: ResolvedImport[];    // import statements
   }

   interface ResolvedInclude {
       originalPath: string;         // "utils.pike" or <Stdio.h>
       resolvedPath: string;         // /absolute/path/to/utils.pike
       symbols: ParsedSymbol[];      // Cached symbols from included file
   }

   interface ResolvedImport {
       modulePath: string;           // "Stdio" or "Parser.Pike"
       symbols: Map<string, Symbol>; // From stdlibIndex
   }
   ```

2. **Update completion provider**

   **Code Location**: `packages/pike-lsp-server/src/features/completion/`

   ```typescript
   // When generating completions:
   async function getCompletions(document, position) {
       const localSymbols = cached.symbols;

       // Add symbols from includes
       for (const include of cached.dependencies.includes) {
           completions.push(...include.symbols.map(toCompletionItem));
       }

       // Add symbols from imports
       for (const imp of cached.dependencies.imports) {
           // For "import Stdio;", add Stdio.* symbols directly accessible
           completions.push(...imp.symbols.values().map(toCompletionItem));
       }

       return completions;
   }
   ```

3. **Completion item detail**
   - Show source file in completion detail: `(from utils.pike)`
   - Show module path for imports: `(from Stdio)`

4. **Caching strategy**
   - Parse included files once, cache symbols
   - Invalidate cache when included file changes
   - Use file watcher for dependency tracking

### IntelliSense Behavior Examples

```pike
#include "utils.pike"  // Contains: void helper_function() { }
import Stdio;          // Contains: File, stdout, stdin, etc.

void main() {
    help|  // Should suggest: helper_function (from utils.pike)
    Stdio.F|  // Should suggest: File, FILE_READ, etc.
    File f = Stdio.File("|  // Should show File constructor signature
}
```

### Include Resolution Algorithm

```
resolveInclude(currentFile, includePath):
  if includePath starts with '"':
    # Relative include
    1. Try relative to currentFile directory
    2. Try relative to workspace root
    3. Try Pike include paths ($PIKE_INCLUDE_PATH)

  if includePath starts with '<':
    # System include
    1. Try Pike lib directory
    2. Try Pike module directories

  return absolutePath or null
```

### Implementation Files

| File | Changes |
|------|---------|
| `pike-scripts/LSP.pmod/Intelligence.pmod/Resolution.pike` | Add `handle_resolve_include` |
| `packages/pike-bridge/src/types.ts` | Add `resolveInclude` method |
| `packages/pike-lsp-server/src/features/navigation/definition.ts` | Handle include/import navigation |
| `packages/pike-lsp-server/src/features/completion/completion.ts` | Add included/imported symbols to completions |
| `packages/pike-lsp-server/src/services/document-cache.ts` | Add `dependencies` field to cached documents |
| `packages/pike-lsp-server/src/services/include-resolver.ts` | NEW: Include resolution and caching service |

### Testing

**Navigation:**
- CTRL+CLICK on `#include "foo.pike"` navigates to foo.pike
- CTRL+CLICK on `#include <Stdio.h>` navigates to Pike stdlib
- CTRL+CLICK on function name that's defined in included file
- CTRL+CLICK on `import Module;` navigates to module file
- Hover on included symbols shows correct type info

**IntelliSense:**
- Typing `help` suggests `helper_function` from included `utils.pike`
- Typing `Stdio.` shows all Stdio module members
- After `import Stdio;`, typing `File` suggests `Stdio.File`
- Completion detail shows source: `(from utils.pike)` or `(from Stdio)`
- Signature help works for functions from included files

---

## Issue 3: Uninitialized Variable False Positives

### Current Behavior

**Code Location**: `pike-scripts/LSP.pmod/Analysis.pmod/Diagnostics.pike`

The diagnostic analyzer uses sophisticated control flow tracking with states:
- `STATE_UNINITIALIZED` - declared but not assigned
- `STATE_MAYBE_INIT` - maybe assigned in a branch
- `STATE_INITIALIZED` - definitely assigned
- `STATE_UNKNOWN` - already warned about

### Foreach Loop Handling (lines 474-525)

```pike
if (text == "foreach") {
    // Extract loop variable and mark as initialized
    mapping loop_var = try_parse_declaration_fn(tokens, var_start, end_idx);
    if (loop_var && loop_var->is_declaration) {
        variables[loop_var->name] = ([
            "state": STATE_INITIALIZED,
            "scope_depth": scope_depth + 1,
            "needs_init": 0
        ]);
    }
}
```

### Root Cause Identified

**Bug Location**: `Diagnostics.pike` lines 492-494

```pike
// BUGGY CODE - only captures FIRST separator
else if (paren_depth == 1 && (t == "," || t == ";") && comma_or_semi < 0) {
    comma_or_semi = j;  // ← Problem: && comma_or_semi < 0 means only first!
}
```

**For syntax**: `foreach(data; string k; string v)`
- Code finds first `;` after `data`
- Parses only `k` as loop variable
- **Never sees `v`** (the second variable after second `;`)
- `v` remains untracked → false positive when `v` is used

### Known Issues

#### Issue 3.1: Key-Value Foreach Only Captures First Variable (CONFIRMED BUG)

```pike
// This syntax has TWO loop variables:
foreach (mapping; string key; mixed value) {
    write(key);    // OK - key was captured
    write(value);  // FALSE POSITIVE - value was never captured!
}
```

#### Issue 3.2: Other Foreach Syntax Variants

Pike supports multiple foreach syntaxes:

```pike
// Style 1: foreach (collection, type var) - WORKS
foreach (array, int x) { }

// Style 2: foreach (collection; type var) - WORKS
foreach (array; int x) { }

// Style 3: foreach (collection; type key; type value) - BROKEN
foreach (mapping; string k; mixed v) { }  // v not captured!

// Style 4: No type declaration (variable already declared)
int x;
foreach (array, x) { }  // May or may not work
```

**Problem**: Code only parses ONE variable after the FIRST separator.

#### Issue 3.2: Destructuring in Foreach

```pike
// Tuple destructuring
foreach (array_of_pairs, [string a, int b]) { }
```

**Problem**: Array destructuring syntax not parsed.

#### Issue 3.3: Nested Foreach

```pike
foreach (outer_array, array inner) {
    foreach (inner, int x) {
        // inner is definitely initialized here
    }
}
```

**Problem**: Inner foreach variable scope tracking may conflict.

### Proposed Solution

#### Phase 1: Fix Key-Value Foreach (PRIORITY - Quick Fix)

**Replace the single-variable capture with multi-variable capture:**

```pike
// FIXED CODE - capture ALL separators and parse ALL variables
if (text == "foreach") {
    int paren_start = find_next_token_fn(tokens, i, end_idx, "(");
    if (paren_start >= 0) {
        // Collect ALL separator positions
        array(int) separators = ({});
        int paren_close = -1;
        int paren_depth = 1;

        for (int j = paren_start + 1; j < end_idx && j < sizeof(tokens); j++) {
            string t = tokens[j]->text;
            if (t == "(") paren_depth++;
            else if (t == ")") {
                paren_depth--;
                if (paren_depth == 0) {
                    paren_close = j;
                    break;
                }
            }
            else if (paren_depth == 1 && (t == "," || t == ";")) {
                separators += ({ j });  // Capture ALL separators
            }
        }

        // Parse variable after EACH separator (skip first for comma syntax)
        foreach (separators, int sep_idx) {
            int var_start = sep_idx + 1;
            // Skip whitespace
            while (var_start < paren_close &&
                   sizeof(LSP.Compat.trim_whites(tokens[var_start]->text)) == 0) {
                var_start++;
            }

            mapping loop_var = try_parse_declaration_fn(tokens, var_start, paren_close);
            if (loop_var && loop_var->is_declaration) {
                variables[loop_var->name] = ([
                    "type": loop_var->type,
                    "state": STATE_INITIALIZED,
                    "decl_line": tokens[var_start]->line,
                    "decl_char": 0,
                    "scope_depth": scope_depth + 1,
                    "needs_init": 0
                ]);
            }
        }

        if (paren_close >= 0) {
            i = paren_close;
        }
    }
}
```

#### Phase 2: Handle Pre-Declared Variables

```pike
// If variable already exists, just mark it as INITIALIZED
// Don't create a new declaration
if (variables[var_name]) {
    variables[var_name]->state = STATE_INITIALIZED;
} else {
    // Create new variable with STATE_INITIALIZED
    variables[var_name] = ([ ... ]);
}
```

#### Phase 3: Track Loop Scope Properly

1. **After foreach parentheses, increment scope**
2. **Mark all loop variables as initialized at scope entry**
3. **On scope exit, remove variables declared in foreach**

### Implementation Files

| File | Changes |
|------|---------|
| `pike-scripts/LSP.pmod/Analysis.pmod/Diagnostics.pike` | Improve foreach handling |
| `pike-scripts/LSP.pmod/Analysis.pmod/module.pmod` | Add `parse_foreach_variables` |

### Testing

Create test file with all foreach variants:
```pike
void test_foreach() {
    array(int) numbers = ({ 1, 2, 3 });
    mapping(string:int) data = ([ "a": 1 ]);

    // Should NOT warn
    foreach (numbers, int x) { write("%d\n", x); }
    foreach (numbers; int y) { write("%d\n", y); }
    foreach (data; string k; int v) { write("%s=%d\n", k, v); }

    int z;
    foreach (numbers, z) { write("%d\n", z); }  // z assigned in loop
}
```

---

## Priority Order

1. **Issue 3**: Uninitialized false positives (most annoying, quick fix)
2. **Issue 2**: Include navigation (medium effort, high value)
3. **Issue 1**: Workspace references (largest effort, foundational)

---

## Dependencies

- Issue 1 benefits from Issue 2 (includes expand searchable scope)
- Issue 3 is independent

---

## Success Criteria

| Issue | Success Criteria |
|-------|------------------|
| 1 | Find References shows results from unopened workspace files |
| 2 | CTRL+CLICK on `#include` navigates to included file |
| 2 | CTRL+CLICK on symbol from included file navigates to definition |
| 2 | CTRL+CLICK on `import Module;` navigates to module |
| 2 | IntelliSense shows symbols from `#include` files |
| 2 | IntelliSense shows symbols from `import` modules |
| 2 | Completion items show source file/module in detail |
| 3 | No false positives on foreach loop variables |
| 3 | No false positives on pre-declared variables used in foreach |

---

## Open Questions

1. Should workspace indexing be opt-in (for large workspaces)?
2. Should include resolution cache invalidate on file changes?
3. What's the actual foreach syntax causing false positives? (need sample code)
