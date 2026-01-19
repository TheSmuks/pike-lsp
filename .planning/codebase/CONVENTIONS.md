# Coding Conventions

**Analysis Date:** 2025-01-19

## Naming Patterns

**Files:**
- TypeScript: `camelCase.ts` (e.g., `workspace-index.ts`, `code-lens.ts`)
- Test files: `*.test.ts` (e.g., `bridge.test.ts`, `workspace-index.test.ts`)
- Test suite files: `*-tests.ts` (e.g., `lsp-tests.ts`, `performance-tests.ts`)
- Pike scripts: `lowercase.pike` (e.g., `analyzer.pike`, `type-introspector.pike`)
- Constants files: `constants.ts` or `index.ts` in constants directory
- Utility files: `utils/*.ts` (e.g., `utils/validation.ts`, `utils/regex-patterns.ts`)

**Functions:**
- `camelCase` for all functions and methods
- `async function` or `async methodName()` for async operations
- `before`, `after`, `it`, `describe` for test hooks (node:test conventions)

**Variables:**
- `camelCase` for local variables and parameters
- `PascalCase` for class/interface names (types)
- `SCREAMING_SNAKE_CASE` for constants (e.g., `MAX_CACHED_PROGRAMS`, `BATCH_PARSE_MAX_SIZE`)
- Private class members: `private propertyName` (no underscore prefix in TypeScript)

**Types:**
- `PascalCase` for interfaces and types (e.g., `PikeSymbol`, `PikeParseResult`, `IntrospectedSymbol`)
- `Pike` prefix for types related to Pike language (e.g., `PikeType`, `PikePosition`)
- `Result` suffix for operation results (e.g., `BatchParseResult`, `IntrospectionResult`)
- `Info` suffix for metadata objects (e.g., `StdlibModuleInfo`, `CompiledProgramInfo`)

## Code Style

**Formatting:**
- No external formatter configured (no Prettier, no ESLint)
- TypeScript strict mode enabled
- 4-space indentation in Pike scripts
- Consistent spacing around operators
- Use template literals for string interpolation

**TypeScript Compiler Settings:**
```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noImplicitReturns": true,
  "noUncheckedIndexedAccess": true
}
```

**Linting:**
- No explicit linter (no .eslintrc, no biome.json)
- Type checking via `tsc --noEmit` serves as primary validation
- Run with `pnpm typecheck`

## Import Organization

**Order:**
1. Node.js built-in imports (e.g., `import * as fs from 'fs'`)
2. External package imports (e.g., `import { ... } from 'vscode-languageserver'`)
3. Workspace package imports (e.g., `import { ... } from '@pike-lsp/pike-bridge'`)
4. Relative imports (e.g., `import { ... } from './utils/validation.js'`)

**Path Aliases:**
- `@pike-lsp/pike-bridge` - Bridge package
- `@pike-lsp/pike-analyzer` - Analyzer package
- `@pike-lsp/pike-lsp-server` - LSP server package

**Import Style:**
- Use named imports: `import { PikeBridge, PikeSymbol } from '@pike-lsp/pike-bridge'`
- Use `import * as` for namespace imports: `import * as assert from 'node:assert/strict'`
- Always include `.js` extension in relative imports (ESM requirement)

## Error Handling

**Patterns:**
- Use type guards for runtime validation (see `packages/pike-lsp-server/src/utils/validation.ts`)
- Async errors propagate through Promise rejection
- Use try-catch for subprocess operations
- Errors from Pike subprocess returned as `{ error: { code, message } }` objects

**Type Guard Pattern:**
```typescript
export function isPikeSymbol(obj: unknown): obj is PikeSymbol {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const sym = obj as Record<string, unknown>;
    if (typeof sym['name'] !== 'string' || typeof sym['kind'] !== 'string') {
        return false;
    }
    return true;
}
```

**Validation:**
```typescript
const result = validatePikeResponse(rawResult, isPikeParseResult, 'PikeParseResult');
```

**Subprocess Error Handling:**
```typescript
this.process.on('error', (err) => {
    this.started = false;
    reject(new Error(`Failed to start Pike subprocess: ${err.message}`));
});
```

## Logging

**Framework:** `console` for standalone scripts, `connection.console.log()` for LSP server

**Patterns:**
- Use `connection.console.log()` for LSP server logging to client
- Use `connection.console.warn()` for warnings
- Use `connection.console.error()` for errors
- Use `console.error()` for debug output when debug mode enabled
- Emit 'stderr' events for Pike subprocess output

**Debug Logging:**
```typescript
private debugLog: (message: string) => void;

constructor(options: PikeBridgeOptions = {}) {
    const debug = options.debug ?? false;
    this.debugLog = debug
        ? (message: string) => console.error(`[PikeBridge DEBUG] ${message}`)
        : () => {};
}
```

## Comments

**When to Comment:**
- Document all public APIs with JSDoc/TSDoc
- Add reference tags for maintenance tracking (e.g., `// MAINT-004`)
- Add performance tags for optimizations (e.g., `// PERF-001`)
- Add quality tags for validation (e.g., `// QUAL-003`)
- Document non-obvious algorithm logic

**JSDoc/TSDoc:**
```typescript
/**
 * Parse Pike source code and extract symbols.
 *
 * @param code - Pike source code to parse.
 * @param filename - Optional filename for error messages.
 * @returns Parse result containing symbols and diagnostics.
 * @example
 * ```ts
 * const result = await bridge.parse('int x = 5;', 'test.pike');
 * console.log(result.symbols);
 * ```
 */
async parse(code: string, filename?: string): Promise<PikeParseResult>
```

**Pike Documentation:**
```pike
//! Parse the given code and return symbols.
//! @param code The Pike source code to parse.
//! @returns A mapping with symbols and diagnostics.
protected mapping handle_parse(mapping params)
```

**Maintenance Tags:**
- `MAINT-001` through `MAINT-004` - Maintenance tracking for code organization
- `PERF-001` through `PERF-005` - Performance optimizations
- `QUAL-001` through `QUAL-003` - Quality/type safety measures

## Function Design

**Size:** Keep functions focused. Most functions under 50 lines. Complex parsing logic in Pike scripts may be longer.

**Parameters:**
- Use options object for multiple parameters: `async parse(code: string, filename?: string): Promise<...>`
- Use parameter objects for configuration: `constructor(options: PikeBridgeOptions = {})`
- Default optional parameters with `??` operator

**Return Values:**
- Always type return values for public APIs
- Use result objects with `{ result, error }` pattern for operations that can fail
- Return `Promise<T>` for async operations
- Return `null` for "not found" cases (not `undefined`)

**Example:**
```typescript
async resolveModule(modulePath: string, currentFile?: string): Promise<string | null> {
    const result = await this.sendRequest<{
        path: string | null;
        exists: boolean;
    }>('resolve', {
        module: modulePath,
        currentFile: currentFile || undefined,
    });

    return result.exists ? result.path : null;
}
```

## Module Design

**Exports:**
- Use named exports for most items: `export class PikeBridge`, `export interface PikeSymbol`
- Use default export only for main entry points: `export default`
- Re-export types for convenience: `export * from './types.js'`

**Barrel Files:**
- `index.ts` files aggregate and re-export from their directory
- Use `export * from` to expose all public APIs
- Keep internal implementation in separate files

**Workspace Package Structure:**
```
packages/
  pike-bridge/         # Core IPC with Pike subprocess
  pike-analyzer/       # Symbol table and analysis
  pike-lsp-server/     # LSP protocol implementation
  vscode-pike/         # VS Code extension
```

## Constants

**Location:** `packages/pike-lsp-server/src/constants/index.ts`

**Pattern:**
```typescript
export const BATCH_PARSE_MAX_SIZE = 50;
export const BRIDGE_TIMEOUT_DEFAULT = 30000;
export const LSP = {
    MAX_COMPLETION_ITEMS: 100,
    MAX_WORKSPACE_SYMBOLS: 1000,
} as const;
```

**Grouped Constants:**
- Parser limits: `PARSER_MAX_ITERATIONS`
- Cache sizes: `MAX_CACHED_PROGRAMS`, `MAX_STDLIB_MODULES`
- Timeouts: `BRIDGE_TIMEOUT_DEFAULT`, `VALIDATION_DELAY_DEFAULT`
- LSP limits: `LSP.MAX_*` constants

**Pike Constants:**
```pike
constant MAX_TOP_LEVEL_ITERATIONS = 10000;
constant MAX_BLOCK_ITERATIONS = 500;
int max_cached_programs = 30;
```

## Code Organization Patterns

**Class Structure:**
1. Private properties
2. Constructor
3. Public methods
4. Private methods
5. Event handlers

**File Organization:**
- Put interfaces/types in `types.ts` or at top of file
- Put constants in `constants.ts` or at top of class
- Keep utility functions in `utils/` directory
- Group related functionality in subdirectories

**LSP Handler Pattern:**
```typescript
connection.onDidOpenTextDocument((params) => {
    // Handle document open
});

connection.onDidChangeTextDocument((params) => {
    // Handle document change
});
```

## Pike Code Conventions

**Style:**
- Use `//!` for documentation comments (AutoDoc format)
- Use `//` for regular comments
- 4-space indentation
- Use `protected` for internal methods
- Use `constant` for compile-time constants
- Use `mapping` for objects/dictionaries
- Use `array` notation `({})` for arrays

**Pattern:**
```pike
protected mapping handle_parse(mapping params) {
    string code = params->code || "";
    // ... implementation
    return ([
        "result": ([
            "symbols": symbols,
            "diagnostics": diagnostics
        ])
    ]);
}
```

---

*Convention analysis: 2025-01-19*
