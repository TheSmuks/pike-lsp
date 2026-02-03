# Import/Inherit Resolution Implementation Spec

## Overview

This document outlines the implementation plan to fix 5 critical gaps in module import and inherit resolution in the Pike LSP server.

**Current State**: Tests written and documented in `packages/pike-lsp-server/src/tests/import-inherit-resolution.test.ts`

**Status**: RED phase complete - All tests fail as expected

## The 5 Critical Gaps

### Gap 1: Import Symbols Not Merged into Completion

**File**: `packages/pike-lsp-server/src/features/editing/completion.ts`

**Current Behavior** (lines 272-298):
```typescript
// Only processes stdlib imports
if (stdlibIndex && cached.dependencies?.imports) {
    for (const imp of cached.dependencies.imports) {
        if (!imp.isStdlib) continue; // ❌ Skips workspace imports!
        // ...
    }
}
```

**Problem**: Local/workspace modules (`.LocalHelpers`, `MyModule`) are ignored in completion.

**Impact**: Users don't get IntelliSense for their own workspace modules.

---

### Gap 2: Inherit Resolution Depends on Parse Order

**File**: `packages/pike-lsp-server/src/features/navigation/definition.ts`

**Current Behavior** (lines 211-277):
```typescript
// Only checks imports BEFORE the inherit statement
const priorImports = cached.symbols.filter((s: PikeSymbol) =>
    s.kind === 'import' &&
    s.position &&
    (s.position.line ?? 1) < symbolLine  // ❌ Only prior imports!
);
```

**Problem**: If an import appears after the inherit statement, it's not searched.

**Impact**: Go-to-definition fails for valid inherit statements based on later imports.

---

### Gap 3: No Cross-File Symbol Propagation

**Current Behavior**: Each document operates in isolation.

**Problem**:
- File A: `class Helper { void helpMe() {} }`
- File B: `import .Helper; void main() { h->helpMe(); }` // ❌ Can't find helpMe

**Impact**: Navigation and completion don't work across workspace files.

---

### Gap 4: CompilationContext Exists But Not Used

**File**: `pike-scripts/LSP.pmod/CompilationCache.pmod`

**Current Behavior**: Defines `CompilationContext` class but never populates it.

**Problem**: Each `parse()` call is independent; no shared context across files.

**Impact**: Can't resolve symbols that require multi-file compilation context.

---

### Gap 5: ResolvedImport Lacks Symbol Storage

**File**: `packages/pike-lsp-server/src/core/types.ts`

**Current Interface**:
```typescript
export interface ResolvedImport {
    modulePath: string;
    isStdlib: boolean;
    // ❌ Missing: symbols: PikeSymbol[]
}
```

**Problem**: No place to cache imported symbols for fast completion.

**Impact**: Every completion request must re-fetch symbols from stdlib/workspace.

---

## Implementation Plan

### Phase 1: Fix ResolvedImport (Gap 5) - FOUNDATION

**Priority**: HIGHEST - Enables other fixes

**Files to Modify**:
1. `packages/pike-lsp-server/src/core/types.ts`
2. `packages/pike-lsp-server/src/services/stdlib-index.ts`
3. `packages/pike-lsp-server/src/services/workspace-scanner.ts`

**Changes**:

#### 1.1 Add Symbol Storage to ResolvedImport

```typescript
// types.ts
export interface ResolvedImport {
    modulePath: string;
    isStdlib: boolean;
    symbols?: PikeSymbol[];  // ✅ Add symbol cache
    lastAccessed?: number;   // For cache invalidation
    resolvedPath?: string;   // For navigation
}
```

#### 1.2 Populate Symbols in StdlibIndex

```typescript
// stdlib-index.ts
async getModule(path: string): Promise<StdlibModule | null> {
    const cached = this.cache.get(path);
    if (cached) {
        return {
            ...cached,
            symbols: Array.from(cached.symbols.entries()), // ✅ Include symbols
        };
    }

    // When loading from stdlib, cache symbols
    const result = await this.bridge.resolveStdlib(path);
    const symbols = result.symbols ?? [];

    this.cache.set(path, {
        modulePath: path,
        symbols: new Map(symbols),  // ✅ Cache symbols
        // ...
    });
}
```

#### 1.3 Populate Symbols in WorkspaceScanner

```typescript
// workspace-scanner.ts (new or enhanced)
async scanWorkspace(): Promise<WorkspaceIndex> {
    for (const file of pikeFiles) {
        const result = await this.bridge.parse(code, file);

        // Build module index
        const moduleName = extractModuleName(file);
        this.imports.set(moduleName, {
            modulePath: moduleName,
            isStdlib: false,
            symbols: result.symbols,  // ✅ Cache workspace symbols
            resolvedPath: file,
            lastAccessed: Date.now(),
        });
    }
}
```

**Test**: `Gap 5: ResolvedImport should cache symbols` (all 3 subtests)

---

### Phase 2: Enable Workspace Import Completion (Gap 1)

**Priority**: HIGH - Major user-facing improvement

**Files to Modify**:
1. `packages/pike-lsp-server/src/features/editing/completion.ts`
2. `packages/pike-lsp-server/src/services/workspace-scanner.ts`

**Changes**:

#### 2.1 Add Workspace Scanner Service

```typescript
// services/workspace-scanner.ts
export class WorkspaceScanner {
    private workspaceIndex: Map<string, ResolvedImport> = new Map();

    async scanWorkspace(rootPath: string): Promise<void> {
        const pikeFiles = await this.findPikeFiles(rootPath);

        for (const file of pikeFiles) {
            const result = await this.bridge.parse(code, file);
            const moduleName = this.extractModuleName(file);

            this.workspaceIndex.set(moduleName, {
                modulePath: moduleName,
                isStdlib: false,
                symbols: result.symbols,
                resolvedPath: file,
            });
        }
    }

    getModule(path: string): ResolvedImport | null {
        return this.workspaceIndex.get(path) ?? null;
    }
}
```

#### 2.2 Update Completion Handler

```typescript
// completion.ts (lines 272-298)
// BEFORE: Only stdlib imports
if (stdlibIndex && cached.dependencies?.imports) {
    for (const imp of cached.dependencies.imports) {
        if (!imp.isStdlib) continue;  // ❌ Remove this check

        // ✅ Add workspace support
        const moduleInfo = imp.isStdlib
            ? await stdlibIndex.getModule(imp.modulePath)
            : await services.workspaceScanner.getModule(imp.modulePath);

        if (moduleInfo?.symbols) {
            for (const [name, symbol] of moduleInfo.symbols) {
                // Same completion logic for both
                if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
                    completions.push(buildCompletionItem(name, symbol, `From ${imp.modulePath}`, undefined, completionContext));
                }
            }
        }
    }
}
```

**Test**: `Gap 1: Import symbols should show in completion` (all 3 subtests)

---

### Phase 3: Order-Independent Inherit Resolution (Gap 2)

**Priority**: HIGH - Fixes broken navigation

**Files to Modify**:
1. `packages/pike-lsp-server/src/features/navigation/definition.ts`

**Changes**:

#### 3.1 Remove Line Number Filter

```typescript
// definition.ts (lines 211-277)

// BEFORE: Order-dependent
const priorImports = cached.symbols.filter((s: PikeSymbol) =>
    s.kind === 'import' &&
    s.position &&
    (s.position.line ?? 1) < symbolLine  // ❌ Remove this
);

// AFTER: Order-independent
const allImports = cached.symbols.filter((s: PikeSymbol) =>
    s.kind === 'import'
);

for (const importSymbol of allImports) {  // ✅ Check all imports
    // ... resolution logic
}
```

#### 3.2 Build Full Import Qualified Paths

```typescript
// For each import, try: ImportPath.InheritName
for (const importSymbol of allImports) {
    const importPath = importSymbol.classname || importSymbol.name;
    if (importPath) {
        // Try: ImportPath.InheritName
        const qualifiedPath = `${importPath}.${modulePath}`;

        // Check stdlib
        let moduleInfo = await services.stdlibIndex?.getModule(qualifiedPath);
        if (moduleInfo?.resolvedPath) {
            return buildLocation(moduleInfo.resolvedPath);
        }

        // Check workspace
        moduleInfo = await services.workspaceScanner?.getModule(qualifiedPath);
        if (moduleInfo?.resolvedPath) {
            return buildLocation(moduleInfo.resolvedPath);
        }

        // Fallback to bridge resolution
        // ...
    }
}
```

**Test**: `Gap 2: Inherit should resolve regardless of import order` (both subtests)

---

### Phase 4: Cross-File Symbol Propagation (Gap 3)

**Priority**: MEDIUM - Enables workspace-wide navigation

**Files to Modify**:
1. `packages/pike-lsp-server/src/services/workspace-index.ts`
2. `packages/pike-lsp-server/src/features/editing/completion.ts`
3. `packages/pike-lsp-server/src/features/navigation/definition.ts`

**Changes**:

#### 4.1 Build Workspace Symbol Index

```typescript
// workspace-index.ts
export class WorkspaceIndex {
    private symbols: Map<string, SymbolLocation[]> = new Map();

    indexDocument(uri: string, symbols: PikeSymbol[]): void {
        for (const symbol of symbols) {
            if (!symbol.name) continue;

            const locations = this.symbols.get(symbol.name) ?? [];
            locations.push({
                uri,
                symbol,
            });
            this.symbols.set(symbol.name, locations);
        }
    }

    findSymbol(name: string): SymbolLocation[] | null {
        return this.symbols.get(name) ?? null;
    }
}

interface SymbolLocation {
    uri: string;
    symbol: PikeSymbol;
}
```

#### 4.2 Index Documents on Parse

```typescript
// server.ts (or document-sync handler)
connection.onDidOpenTextDocument(async (params) => {
    const result = await services.bridge.parse(text, uri);

    // Index symbols for cross-file lookup
    services.workspaceIndex.indexDocument(uri, result.symbols);

    // Cache document
    services.documentCache.set(uri, {
        symbols: result.symbols,
        // ...
    });
});
```

#### 4.3 Use Workspace Index in Navigation

```typescript
// definition.ts - fallback to workspace search
const workspaceMatches = services.workspaceIndex.findSymbol(targetSymbolName);
if (workspaceMatches && workspaceMatches.length > 0) {
    // Return first match or show all matches
    return workspaceMatches.map(loc => ({
        uri: loc.uri,
        range: symbolToRange(loc.symbol),
    }));
}
```

**Test**: `Gap 3: Cross-file symbol propagation` (all 3 subtests)

---

### Phase 5: CompilationContext Integration (Gap 4)

**Priority**: LOW - Performance optimization

**Files to Modify**:
1. `pike-scripts/LSP.pmod/CompilationCache.pmod`
2. `packages/pike-bridge/src/pike-bridge.ts`

**Changes**:

#### 5.1 Implement CompilationContext in Pike

```pike
// CompilationCache.pmod
class CompilationContext {
    mapping(string:program) compiled_modules = ([]);
    mapping(string:array(PikeSymbol)) module_symbols = ([]);

    void add_module(string path, program p, array(PikeSymbol) symbols) {
        compiled_modules[path] = p;
        module_symbols[path] = symbols;
    }

    array(PikeSymbol) get_symbols(string path) {
        return module_symbols[path];
    }
}
```

#### 5.2 Share Context Across Parse Calls

```typescript
// pike-bridge.ts
export class PikeBridge {
    private compilationContext?: CompilationContext;

    async start(): Promise<void> {
        this.process = spawn('pike', ['pike-scripts/analyzer.pike']);

        // Initialize context
        this.compilationContext = new CompilationContext();
    }

    async parse(code: string, filename: string): Promise<ParseResult> {
        return this.analyze(code, ['parse'], filename, {
            context: this.compilationContext,  // ✅ Pass context
        });
    }
}
```

**Test**: `Gap 4: CompilationContext should be used` (both subtests)

---

## Implementation Order (Dependencies)

```
Phase 1 (Gap 5): ResolvedImport.symbol cache
    ↓
Phase 2 (Gap 1): Workspace import completion
    ↓
Phase 3 (Gap 2): Order-independent inherit
    ↓
Phase 4 (Gap 3): Cross-file propagation
    ↓
Phase 5 (Gap 4): CompilationContext (optional optimization)
```

**Critical Path**: Phase 1 → Phase 2 → Phase 3

**Parallel Opportunities**:
- Phase 4 can be done alongside Phase 2 (workspace scanner)
- Phase 5 is independent (Pike-side changes)

---

## Testing Strategy

### Test Files Created

1. **`packages/pike-lsp-server/src/tests/import-inherit-resolution.test.ts`**
   - 15 test cases covering all 5 gaps
   - Integration tests for complex scenarios
   - All tests currently FAIL (RED phase)

### Running Tests

```bash
# Run the new failing tests
cd packages/pike-lsp-server
bun test src/tests/import-inherit-resolution.test.ts

# Run all import/inherit tests
bun test src/tests/import*.test.ts

# Run specific gap tests
bun test src/tests/import-inherit-resolution.test.ts --grep "Gap 1"
```

### TDD Cycle

For each phase:

1. **RED**: Tests fail (current state)
2. **GREEN**: Implement minimal fix to make tests pass
3. **REFACTOR**: Clean up while keeping tests green

---

## Risk Assessment

### High-Risk Changes

1. **completion.ts (lines 272-298)**: Core completion logic
   - **Risk**: Breaking existing completion
   - **Mitigation**: Extensive test coverage, backward compatibility checks

2. **definition.ts (lines 211-277)**: Navigation logic
   - **Risk**: Breaking go-to-definition
   - **Mitigation**: Test with various import orderings

### Medium-Risk Changes

3. **types.ts**: Adding ResolvedImport.symbols field
   - **Risk**: None (additive change)
   - **Mitigation**: Optional field, backward compatible

4. **workspace-scanner.ts**: New service
   - **Risk**: Performance impact on large workspaces
   - **Mitigation**: Lazy loading, incremental scanning

### Low-Risk Changes

5. **CompilationCache.pmod**: Pike-side context
   - **Risk**: Minimal (isolated to Pike subprocess)
   - **Mitigation**: Can fallback to current behavior

---

## Success Criteria

### Gap 1: Import Symbols in Completion
- ✅ Local workspace imports (`.LocalModule`) show symbols in completion
- ✅ Non-stdlib imports (`MyModule`) show symbols in completion
- ✅ Distinguishes between stdlib and workspace imports

### Gap 2: Order-Independent Inherit
- ✅ Inherit resolves when import appears AFTER inherit statement
- ✅ Inherit resolves from any import in the file
- ✅ Go-to-definition works for all valid inherits

### Gap 3: Cross-File Propagation
- ✅ Symbols from File A available in File B (when imported)
- ✅ `#include` chains tracked and resolved
- ✅ Workspace-wide symbol index built

### Gap 4: CompilationContext
- ✅ CompilationContext shared across parse calls
- ✅ Imports tracked in context
- ✅ Symbols available to subsequent parses

### Gap 5: ResolvedImport Cache
- ✅ ResolvedImport stores symbols for fast completion
- ✅ Both stdlib and workspace imports cache symbols
- ✅ Cache invalidation on source file changes

---

## Performance Considerations

### Memory Usage

**Current**: ~50MB per session
**After Phase 1-4**: ~100-150MB (symbol caching)

**Optimizations**:
- LRU eviction for import caches (Phase 5)
- Incremental workspace scanning
- Lazy symbol loading

### Parse Time

**Current**: ~50ms per file
**After Phase 1-4**: ~50ms + ~5ms for workspace indexing

**Optimizations**:
- Reuse CompilationContext (Phase 5)
- Background workspace scanning
- Cached symbol lookups

---

## Rollout Plan

1. **Week 1**: Phase 1 (ResolvedImport)
   - Implement ResolvedImport.symbols
   - Update stdlib-index to populate symbols
   - Tests: Gap 5 suite

2. **Week 2**: Phase 2 (Workspace Completion)
   - Implement WorkspaceScanner
   - Update completion handler
   - Tests: Gap 1 suite

3. **Week 3**: Phase 3 (Order-Independent Inherit)
   - Remove line number filter
   - Update definition handler
   - Tests: Gap 2 suite

4. **Week 4**: Phase 4 (Cross-File Propagation)
   - Implement WorkspaceIndex
   - Update document sync
   - Tests: Gap 3 suite

5. **Week 5**: Phase 5 (CompilationContext)
   - Implement Pike-side context
   - Update bridge to share context
   - Tests: Gap 4 suite

---

## Documentation Updates

### User-Facing

- **CHANGELOG.md**: Document new features
- **README.md**: Update feature list
- **VSCode extension README**: Usage examples

### Developer-Facing

- **ARCHITECTURE.md**: Update with new services
- **CONTRIBUTING.md**: Add contribution guidelines
- **API.md**: Document new service interfaces

---

## Open Questions

1. **Q**: Should workspace scanning be eager or lazy?
   **A**: Start with eager (simple), optimize to lazy if performance issues.

2. **Q**: How to handle circular imports?
   **A**: Track visited modules, detect cycles, break gracefully.

3. **Q**: Should we cache parsed Pike programs or just symbols?
   **A**: Just symbols for now (lighter). Programs can be added later if needed.

4. **Q**: CompilationContext in Pike process vs TypeScript side?
   **A**: Keep in Pike process for correctness, expose via introspection.

---

## References

- **Test File**: `packages/pike-lsp-server/src/tests/import-inherit-resolution.test.ts`
- **Completion Handler**: `packages/pike-lsp-server/src/features/editing/completion.ts`
- **Definition Handler**: `packages/pike-lsp-server/src/features/navigation/definition.ts`
- **Type Definitions**: `packages/pike-lsp-server/src/core/types.ts`
- **Pike CompilationCache**: `pike-scripts/LSP.pmod/CompilationCache.pmod`

---

**Last Updated**: 2025-02-03
**Status**: RED phase complete, ready for GREEN phase implementation
**Next Step**: Begin Phase 1 implementation (Gap 5 - ResolvedImport)
