# Pike Import IntelliSense Specification

## Overview

Add IntelliSense support for Pike imports, enabling go-to-definition, hover, and completion for:
1. Module paths (`Stdio.File`, `Parser.Pike`)
2. Inherit statements (`inherit Parent;`)
3. `#include` directives (`#include "header.h"`)

## Scope

### Phase 1: Module Resolution (This Spec)
- Go-to-definition for module paths (`.` operator)
- Go-to-definition for member access (`->` operator)
- Hover info for modules and members

### Phase 2: Inherit Statements (Future)
- Go-to-definition on `inherit` keyword targets

### Phase 3: Include Directives (Future)
- Go-to-definition on `#include` paths

---

## Phase 1: Module Resolution

### 1.1 Expression Patterns

Pike uses two operators for access:

| Operator | Usage | Example |
|----------|-------|---------|
| `.` | Module hierarchy / static access | `Stdio.File`, `Parser.Pike.split` |
| `->` | Instance member access | `file->read()`, `mapping->key` |

#### Pattern Classification

| Pattern | Classification | Resolution Strategy |
|---------|---------------|---------------------|
| `Stdio` | Module | Resolve as module |
| `Stdio.File` | Module path | Resolve dotted path |
| `Parser.Pike.split` | Module + member | Resolve `Parser.Pike`, find `split` |
| `file` | Variable | Look up in local symbols |
| `file->read` | Variable + member | Get type of `file`, resolve type, find `read` |
| `Stdio.File()->read` | Module + instantiate + member | Resolve `Stdio.File`, find `read` |

### 1.2 Expression Extraction Algorithm

Given cursor position, extract the full expression:

```
Input: "result = Stdio.File()->read(1024);"
              ^cursor on "File"

Output: {
  fullPath: "Stdio.File",
  base: "Stdio.File",
  member: null,
  operator: ".",
  isModulePath: true
}
```

```
Input: "result = file->read(1024);"
                      ^cursor on "read"

Output: {
  fullPath: "file->read",
  base: "file",
  member: "read",
  operator: "->",
  isModulePath: false
}
```

#### Algorithm

```
function extractExpressionAtPosition(text, offset):
    1. Find word boundaries at offset → word
    2. Scan left from word start:
       - If preceded by "." → prepend that identifier, continue
       - If preceded by "->" → record as member access, stop module path
    3. Scan right from word end:
       - If followed by "." → append that identifier (if cursor on module part)
       - If followed by "->" → don't include (member access starts)
    4. Classify:
       - If path contains only "." → isModulePath = true
       - If path ends with "->" → isModulePath = false, has member
    5. Return { fullPath, base, member, operator, isModulePath }
```

### 1.3 Resolution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   onDefinition handler                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. extractExpressionAtPosition(document, position)          │
│    → { base, member, operator, isModulePath }               │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
    ┌─────────────────┐         ┌─────────────────┐
    │  isModulePath?  │         │  Has member?    │
    │     (dots)      │         │  (arrows)       │
    └─────────────────┘         └─────────────────┘
              │                           │
              ▼                           ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│ 2a. Try local symbols   │   │ 2b. Resolve base first  │
│     first               │   │     - Local var → type  │
└─────────────────────────┘   │     - Module → module   │
              │               └─────────────────────────┘
              ▼                           │
┌─────────────────────────┐               ▼
│ 3a. If not found:       │   ┌─────────────────────────┐
│     resolveModule(path) │   │ 3b. In resolved type,   │
└─────────────────────────┘   │     find member symbol  │
              │               └─────────────────────────┘
              ▼                           │
┌─────────────────────────┐               ▼
│ 4. Return Location      │   ┌─────────────────────────┐
│    to resolved file     │   │ 4b. Return Location     │
└─────────────────────────┘   │     to member in type   │
                              └─────────────────────────┘
```

### 1.4 Type Inference for Variables

To resolve `file->read`, we need the type of `file`:

```pike
Stdio.File file = Stdio.File();
file->read(1024);
//   ^^^^^ cursor here
```

**Type sources (in priority order):**

1. **Explicit type annotation**: `Stdio.File file` → type is `Stdio.File`
2. **Introspection result**: Symbol has `type.name` field from Pike introspection
3. **Assignment inference**: `auto x = Stdio.File()` → infer from RHS (future)

**Current implementation uses:** Introspection results stored in `documentCache.symbols[].type`

### 1.5 API Changes

#### New Types (`types.ts`)

```typescript
interface ExpressionInfo {
  /** Full expression text */
  fullPath: string;

  /** Base part (module path or variable name) */
  base: string;

  /** Member being accessed (after -> or final .) */
  member: string | null;

  /** Last operator used ("." or "->") */
  operator: '.' | '->' | null;

  /** True if base is a module path (dots only) */
  isModulePath: boolean;

  /** Character range in document */
  range: { start: number; end: number };
}
```

#### New Functions

```typescript
// In definition.ts or new utils file

/**
 * Extract full expression at cursor position.
 * Handles dotted module paths and arrow member access.
 */
function extractExpressionAtPosition(
  document: TextDocument,
  position: Position
): ExpressionInfo | null;

/**
 * Resolve a module path to file location.
 * Returns Location or null if not a valid module.
 */
async function resolveModuleLocation(
  bridge: PikeBridge,
  modulePath: string
): Promise<Location | null>;

/**
 * Find a member symbol within a resolved module.
 * Returns Location to the member definition.
 */
async function findMemberInModule(
  bridge: PikeBridge,
  stdlibIndex: StdlibIndexManager,
  modulePath: string,
  memberName: string
): Promise<Location | null>;

/**
 * Get the type of a symbol (for variable -> member resolution).
 */
function getSymbolType(
  symbol: PikeSymbol
): string | null;
```

### 1.6 File Changes

| File | Changes |
|------|---------|
| `features/navigation/definition.ts` | Main logic: expression extraction, resolution flow |
| `features/navigation/expression-utils.ts` | New file: `extractExpressionAtPosition()` |
| `services/index.ts` | Expose `bridge` and `stdlibIndex` to handlers |
| `pike-bridge/src/types.ts` | Add `ExpressionInfo` type (if shared) |

### 1.7 Edge Cases

| Case | Handling |
|------|----------|
| Cursor on whitespace | Return null |
| Cursor on operator (`.` or `->`) | Look at adjacent identifier |
| Incomplete expression (`Stdio.`) | Try resolving partial path |
| Unknown module | Return null (graceful failure) |
| Variable with unknown type | Fall back to local symbol lookup |
| Circular module resolution | Pike bridge handles this |
| Cursor on `()` in `Stdio.File()` | Resolve `Stdio.File` |

### 1.8 Examples

#### Example 1: Module Path
```pike
Stdio.File file;
//    ^^^^ cursor
```
- Extract: `{ base: "Stdio.File", member: null, isModulePath: true }`
- Resolve: `bridge.resolveModule("Stdio.File")`
- Result: Location to `/usr/local/pike/.../Stdio.pmod/File.pike`

#### Example 2: Member Access on Variable
```pike
Stdio.File file = Stdio.File();
file->read(1024);
//    ^^^^ cursor
```
- Extract: `{ base: "file", member: "read", operator: "->", isModulePath: false }`
- Find `file` in symbols → type = `Stdio.File`
- Resolve `Stdio.File` module
- Find `read` in module symbols
- Result: Location to `read` function in File.pike

#### Example 3: Chained Module Access
```pike
Parser.Pike.split(code);
//          ^^^^^ cursor
```
- Extract: `{ base: "Parser.Pike", member: "split", operator: ".", isModulePath: true }`
- Resolve `Parser.Pike` module
- Find `split` in module symbols
- Result: Location to `split` function

### 1.9 Testing Strategy

#### Unit Tests
- `extractExpressionAtPosition()` with various patterns
- Edge cases (whitespace, operators, incomplete)

#### Integration Tests
- Go-to-definition on `Stdio.File` → navigates to Pike stdlib
- Go-to-definition on `file->read` → navigates to member
- Hover on module shows module info

#### E2E Tests
- Add test cases to `lsp-features.test.ts`
- Test with real Pike stdlib modules

---

## Success Criteria

1. **Module paths**: Ctrl+click on `Stdio.File` opens the Pike stdlib file
2. **Member access**: Ctrl+click on `file->read()` jumps to `read` definition
3. **Hover**: Hovering shows module/member documentation
4. **Performance**: Resolution completes in <100ms (cached)
5. **Graceful failure**: Unknown modules return null, no errors

---

## Implementation Order

1. Add `extractExpressionAtPosition()` utility
2. Modify `onDefinition` handler for module paths
3. Add member resolution with type inference
4. Add hover support for modules
5. Write tests
6. Manual testing with real Pike code
