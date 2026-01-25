# Navigation Line Numbers and Snippet Templates

## Date
2026-01-25

## Problem Statement

1. **Definition Navigation**: When clicking on module/class references like `Crypto.Hash` or `Crypto.Sign`, navigation went to line 0 instead of the actual class definition
2. **Autocomplete Snippets**: Function completion didn't provide signature templates with tab-stop placeholders for parameters

## Root Cause Analysis

### Navigation Issue
Pike's `Program.defined()` returns file paths with line number suffixes (e.g., `/path/to/module.pmod:43`), but the TypeScript code wasn't parsing and using these line numbers.

### Snippet Issue
The `PikeFunctionType` TypeScript interface was missing the `arguments` field that Pike's `_typeof()` introspection generates.

## Solution Implemented

### 1. stdlib-index.ts Changes

Added line number parsing from Pike paths:

```typescript
// New interface fields
export interface StdlibModuleInfo {
    resolvedPath?: string;  // Original with line number
    filePath?: string;      // Without line number
    line?: number;          // 0-based line number for LSP
    // ... other fields
}

// Helper to parse path with line number
private parsePathWithLine(path: string): { filePath: string; line: number } {
    const colonIndex = path.lastIndexOf(':');
    if (colonIndex !== -1) {
        const afterColon = path.slice(colonIndex + 1);
        if (/^\d+$/.test(afterColon)) {
            const line = parseInt(afterColon, 10);
            return {
                filePath: path.slice(0, colonIndex),
                line: Math.max(0, line - 1), // Convert to 0-based for LSP
            };
        }
    }
    return { filePath: path, line: 0 };
}
```

### 2. definition.ts Changes

Updated all resolution functions to use parsed line numbers:

```typescript
// Use filePath (without line number) for URI, line for position
const filePath = moduleInfo.filePath ?? moduleInfo.resolvedPath;
const line = moduleInfo.line ?? 0;

return {
    uri: filePath.startsWith('file://') ? filePath : `file://${filePath}`,
    range: {
        start: { line, character: 0 },
        end: { line, character: 0 },
    },
};
```

### 3. types.ts (pike-bridge) Changes

Added `arguments` and `signature` fields to `PikeFunctionType`:

```typescript
export interface PikeFunctionArgument {
    name: string;
    type: string;
}

export interface PikeFunctionType {
    kind: 'function';
    argTypes?: PikeType[];
    returnType?: PikeType;
    arguments?: PikeFunctionArgument[];  // NEW
    signature?: string;                    // NEW
}
```

## Files Modified

1. `packages/pike-lsp-server/src/stdlib-index.ts`
   - Added `filePath` and `line` fields to `StdlibModuleInfo`
   - Added `parsePathWithLine()` helper method
   - Updated `loadModule()` to parse and store line numbers

2. `packages/pike-lsp-server/src/features/navigation/definition.ts`
   - Updated `resolveModulePath()` to use `moduleInfo.line`
   - Updated `resolveMemberAccess()` to use `moduleInfo.line`
   - Updated `resolveModuleMember()` to use `moduleInfo.line`

3. `packages/pike-bridge/src/types.ts`
   - Added `PikeFunctionArgument` interface
   - Added `arguments` and `signature` fields to `PikeFunctionType`

## Verification

- Clicking on `Crypto.Hash` navigates to line 42 (0-based) in `Crypto.pmod/module.pmod`
- Clicking on `Crypto.Sign` navigates to line 53 (0-based) in `Crypto.pmod/module.pmod`
- All 216 LSP server tests pass
- All 31 pike-bridge tests pass

## Notes

- Pike uses 1-based line numbers; LSP uses 0-based
- Directory modules (`.pmod` directories) may have multiple symbols in `module.pmod` at different lines
- Inherited symbols show the parent class's file path
- Runtime introspection (`_typeof()`) generates generic parameter names like `arg1`, `arg2`
