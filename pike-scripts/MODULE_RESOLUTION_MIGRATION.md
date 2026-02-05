# Module Resolution Migration Guide

## Overview

The Pike LSP module resolution system has been redesigned with a new `ModuleResolution.pike` handler that provides comprehensive import/include/inherit/require support.

## What Changed

### New: ModuleResolution.pike

**Location:** `pike-scripts/LSP.pmod/Intelligence.pmod/ModuleResolution.pike`

Provides 4 new handlers:
- `extract_imports` - Extract all import directives from Pike code
- `resolve_import` - Resolve any import type to file paths
- `check_circular` - Detect circular dependencies
- `get_waterfall_symbols` - Load symbols with transitive dependencies

### Legacy: Resolution.pike

**Location:** `pike-scripts/LSP.pmod/Intelligence.pmod/Resolution.pike`

**Status:** Kept for backward compatibility

The old `resolve` and `resolve_stdlib` handlers are still functional. New code should prefer the `ModuleResolution` handlers.

## Migration Guide

### For Pike Bridge Users

**Old pattern:**
```typescript
// Legacy resolve for stdlib
const result = await bridge.resolveStdlib('Stdio.File');

// Legacy include resolution
const result = await bridge.resolveInclude('local.h', currentFile);
```

**New pattern:**
```typescript
// Extract all imports from code
const importsResult = await bridge.extractImports(code, filename);

// Resolve any import type
const resolveResult = await bridge.resolveImport('import', 'Stdio.File', currentFile);
const resolveResult = await bridge.resolveImport('include', 'local.h', currentFile);
const resolveResult = await bridge.resolveImport('inherit', 'Thread.Thread', currentFile);
const resolveResult = await bridge.resolveImport('require', 'module.pike', currentFile);

// Check for circular dependencies
const circularResult = await bridge.checkCircular(code, filename);

// Get symbols with waterfall loading
const symbolsResult = await bridge.getWaterfallSymbols(code, filename, maxDepth);
```

### For LSP Server Feature Handlers

**Old pattern:**
```typescript
// Using includeResolver
if (services.includeResolver && cached.dependencies?.includes) {
    // Process includes...
}
```

**New pattern:**
```typescript
// Using ModuleContext
if (services.moduleContext && services.bridge?.bridge) {
    const imports = await services.moduleContext.getImportsForDocument(
        uri, content, services.bridge.bridge
    );

    // Resolve import target
    const resolved = await services.moduleContext.resolveImportTarget(
        'import', 'Stdio', uri, services.bridge.bridge
    );

    // Get waterfall symbols
    const waterfall = await services.moduleContext.getWaterfallSymbolsForDocument(
        uri, content, services.bridge.bridge, 3
    );
}
```

## Import Type Support

| Import Type | Old Support | New Support | Notes |
|-------------|-------------|-------------|-------|
| `#include "local.h"` | ✅ include-resolver.ts | ✅ resolve_import | Local file resolution |
| `#include <system.h>` | ✅ include-resolver.ts | ✅ resolve_import | System header search |
| `import Module.Name` | ✅ Resolution.pike | ✅ resolve_import | Multi-strategy resolution |
| `inherit ClassName` | ✅ Resolution.pike | ✅ resolve_import | Introspection cache + qualified names |
| `#require "module.pike"` | ❌ Not supported | ✅ resolve_import (string literal) | New support |
| `#require constant(Name)` | ❌ Not supported | ⚠️ Skipped (complex) | Marked as skip=true |

## Key Improvements

1. **Unified API** - One handler for all 4 import types
2. **#require support** - Can now navigate to required modules
3. **Waterfall loading** - Transitive symbol resolution with depth tracking
4. **Circular detection** - DFS-based cycle detection
5. **Better caching** - LRU cache with mtime validation

## Backward Compatibility

All old handlers remain functional:
- `bridge.resolve()` → delegates to `Resolution.pike`
- `bridge.resolveStdlib()` → delegates to `Resolution.pike`
- `services.includeResolver` → still used by diagnostics handler

No breaking changes for existing code.
