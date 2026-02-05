# Module Context Service

The `ModuleContext` service provides comprehensive import/include/inherit/require resolution and waterfall symbol loading for Pike LSP.

## Overview

Located at `src/services/module-context.ts`, this service manages:

- **Import extraction**: Parsing Pike code for all 4 import directive types
- **Import resolution**: Converting import targets to file system paths
- **Waterfall loading**: Transitive dependency resolution with depth tracking
- **Circular dependency detection**: DFS-based cycle detection

## API

### `getImportsForDocument(uri, content, bridge, filename?)`

Extracts all import directives from a Pike document.

**Parameters:**
- `uri` - Document URI
- `content` - Document source code
- `bridge` - PikeBridge instance
- `filename` - Optional filename for Pike resolution

**Returns:** `Promise<ExtractedImport[]>` - Array of import directives

### `resolveImportTarget(importType, target, currentFile, bridge)`

Resolves an import target to its file system path.

**Parameters:**
- `importType` - Type of import: `'include' | 'import' | 'inherit' | 'require'`
- `target` - Import target path
- `currentFile` - Current file URI for relative resolution
- `bridge` - PikeBridge instance

**Returns:** `Promise<ResolveImportResult>` - Resolved path with existence status

### `getWaterfallSymbolsForDocument(uri, content, bridge, maxDepth?)`

Performs transitive symbol loading across all dependencies.

**Parameters:**
- `uri` - Document URI
- `content` - Document source code
- `bridge` - PikeBridge instance
- `maxDepth` - Maximum depth for transitive resolution (default: 5)

**Returns:** `Promise<WaterfallSymbolsResult>` - All symbols with provenance tracking

### `checkCircularDependencies(uri, content, bridge)`

Checks for circular dependencies in the import graph.

**Parameters:**
- `uri` - Document URI
- `content` - Document source code
- `bridge` - PikeBridge instance

**Returns:** `Promise<CircularCheckResult>` - Cycle detection result

## Symbol Merge Semantics

The waterfall loading uses a "most specific wins" precedence:

1. **Current file symbols** (depth -1) - Highest priority
2. **Direct imports** (depth 0) - Medium priority
3. **Transitive imports** (depth 1+) - Lowest priority

When multiple sources define the same symbol name, the symbol from the lowest depth wins. This ensures that local definitions always shadow imported ones, and direct imports shadow transitive dependencies.

## Caching

The service uses a 5-second TTL cache for import data to improve performance. Cached data is automatically invalidated when documents change.

## Integration

The ModuleContext is registered in the Services bundle and accessible to all feature handlers:

```typescript
const { moduleContext } = services;
if (moduleContext && services.bridge?.bridge) {
    const imports = await moduleContext.getImportsForDocument(
        uri,
        content,
        services.bridge.bridge
    );
}
```
