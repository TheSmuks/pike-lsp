# Coding Conventions

**Analysis Date:** 2026-01-23

## Naming Patterns

**Files:**
- TypeScript: `camelCase.ts` for source files, `camelCase.test.ts` for test files
- Pike scripts: `camelCase.pike` for modules, `camelCase.pmod` for module directories
- Test fixtures: Named descriptively (e.g., `test-workspace/`, `test.pike`)
- Configuration: `kebab-case` for config files (e.g., `tsconfig.json`, `package.json`)

**Functions:**
- TypeScript: `camelCase` for all functions and methods
- Pike: `snake_case` for function names (e.g., `handle_find_occurrences`, `get_char_position`)
- Test functions: `camelCase` with descriptive names (e.g., `shouldDetectSyntaxErrors`, `shouldDeduplicateConcurrentRequests`)

**Variables:**
- TypeScript: `camelCase` for local variables and parameters
- Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_TOP_LEVEL_ITERATIONS`, `BATCH_PARSE_MAX_SIZE`)
- Private class members: Prefixed with underscore or declared as private fields
- Pike: `snake_case` for local variables

**Types/Interfaces:**
- TypeScript: `PascalCase` for interfaces and type definitions
- Prefix generic types with descriptive names (e.g., `PikeBridgeOptions`, `ExtensionApi`)
- Use descriptive union types where appropriate (e.g., `AnalysisOperation[]`)

## Code Style

**Formatting:**
- No explicit formatter detected (no `.prettierrc`, `.eslintrc`, or `biome.json`)
- Manual code formatting with consistent indentation
- 4-space indentation for Pike scripts
- 2-space or 4-space indentation for TypeScript (varies by file)
- Trailing commas generally allowed in multi-line arrays/objects

**Linting:**
- No ESLint configuration detected at project root
- TypeScript compiler (`tsc`) used for type checking
- Build scripts include `typecheck` target: `"typecheck": "tsc --noEmit"`

**Import Organization:**
1. Node.js built-in modules (e.g., `import * as path from 'path'`)
2. External dependencies (e.g., `import { EventEmitter } from 'events'`)
3. Internal workspace dependencies (e.g., `import { PikeBridge } from '@pike-lsp/pike-bridge'`)
4. Relative imports (e.g., `import { Logger } from '@pike-lsp/core'`)

**Path Aliases:**
- Workspace protocol used: `@pike-lsp/core`, `@pike-lsp/pike-bridge`
- TypeScript `paths` configuration in `tsconfig.json` for module resolution

## Error Handling

**Patterns:**
- **TypeScript**: Use `try/catch` blocks for async operations
- Custom error types: `PikeError` class from `@pike-lsp/core` for Pike-specific errors
- Error messages are descriptive and include context
- Graceful degradation: Return `null` or empty results instead of throwing when appropriate
- Log errors but don't crash: Use logger instances, console.error sparingly

**Pike Error Handling:**
```pike
mixed err = catch {
    result = handler(params, ctx);
};
if (err) {
    result = ([
        "error": ([
            "code": -32000,
            "message": describe_error(err)
        ])
    ]);
}
```

**TypeScript Error Handling:**
```typescript
try {
    await bridge.start();
} catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    this.debugLog(`Exception during start: ${message}`);
    reject(new Error(`Failed to start Pike bridge: ${message}`));
}
```

## Logging

**Framework:**
- Custom `Logger` class from `@pike-lsp/core` package
- LSP server uses `connection.console.log()` for server-side logging
- Pike scripts use conditional debug logging: `debug()` function that only outputs when `debug_mode` is enabled

**Patterns:**
- Use appropriate log levels: `debug()`, `trace()`, `info()`, `warn()`, `error()`
- Structured logging with objects: `logger.debug('Pike stderr', { raw: message })`
- Conditional debug logging in Pike to avoid performance overhead
- E2E tests capture server logs for debugging failures

**Pike Conditional Debug:**
```pike
int debug_mode = 0;  // Disabled by default
void debug(string fmt, mixed... args) {
    if (debug_mode) {
        werror(fmt, @args);
    }
}
```

## Comments

**When to Comment:**
- **File headers**: Module purpose and key responsibilities (e.g., `//! Analysis.pike - Stateless analysis class for Pike LSP`)
- **Architecture invariants**: Critical design decisions (e.g., stdin reading pattern in analyzer.pike)
- **Non-obvious code**: Complex algorithms, workarounds, performance optimizations
- **TODO/FIXME**: Mark incomplete work or known issues

**JSDoc/TSDoc:**
- **Extensive JSDoc used** on all public class methods in `pike-bridge` package
- Includes parameter descriptions with `@param`, return types with `@returns`
- Usage examples in JSDoc comments (e.g., in `PikeBridge` class)
- Pike uses `//!` for autodoc comments (Pike's documentation format)

**Pike Autodoc Pattern:**
```pike
//! Find all identifier occurrences using tokenization
//!
//! @param params Mapping with "code" key containing Pike source code
//! @returns Mapping with "result" containing "occurrences" array
mapping handle_find_occurrences(mapping params) {
    // ...
}
```

**TypeScript JSDoc Pattern:**
```typescript
/**
 * Parse Pike source code and extract symbols.
 *
 * @param code - Pike source code to parse.
 * @param filename - Optional filename for error messages.
 * @returns Parse result containing symbols and diagnostics.
 */
async parse(code: string, filename?: string): Promise<PikeParseResult>
```

## Function Design

**Size:**
- Keep functions focused on single responsibility
- Complex operations broken into smaller helper functions
- Pike handlers are typically 50-100 lines for analysis operations

**Parameters:**
- Use objects for multiple related parameters (e.g., `PikeBridgeOptions`)
- Destructure objects in function parameters for clarity
- Optional parameters marked with `?` in TypeScript
- Default values provided where appropriate

**Return Values:**
- TypeScript: Always type return values explicitly
- Use union types for nullable returns: `string | null`
- Pike: Return mappings for structured data
- Error responses wrapped in standardized error structures

## Module Design

**Exports:**
- TypeScript: Use `export` keyword for public APIs
- Barrel files (`index.ts`) used to re-export from subdirectories
- Default exports avoided; prefer named exports

**Barrel Files:**
- `packages/pike-bridge/src/index.ts`: Exports `PikeBridge`, types
- `packages/pike-lsp-server/src/features/index.ts`: Re-exports all feature handlers
- `packages/pike-lsp-server/src/services/index.ts`: Re-exports service classes
- Pattern: `export * from './module.js'` in ESM

**TypeScript Module Structure:**
```typescript
// Primary exports
export { PikeBridge } from './bridge.js';
export { PikeProcess } from './process.js';

// Type exports
export type {
    PikeBridgeOptions,
    PikeParseResult,
    // ...
} from './types.js';
```

## Pike-Specific Conventions

**Module Loading:**
- Use `master()->resolv()` for dynamic module resolution
- Program instantiation: `program MyClass = master()->resolv("LSP.Parser"); object instance = MyClass();`

**Constants:**
- Use `constant` keyword for compile-time constants
- Naming: `UPPER_SNAKE_CASE`
- Organize related constants (e.g., `MAX_TOP_LEVEL_ITERATIONS`, `NEEDS_INIT_TYPES`)

**String Operations:**
- **Critical**: Use `String.trim_all_whites()` not `String.trim()` (unavailable in Pike 8.0)
- Use `LSP.Compat.trim_whites()` for compatibility wrapper
- Never use regex when Pike stdlib has native utilities

**Pike Version Compatibility:**
- Target Pike 8.0.x
- Test with `pike --version`
- Use `LSP.Compat.pmod` for version-specific compatibility shims

## Async/Await Patterns

**TypeScript:**
- Always use `async/await` for Promise handling
- Error handling with `try/catch` around async operations
- Run multiple async operations in parallel with `Promise.all()` when safe
- Request deduplication for concurrent identical requests (see `PikeBridge.sendRequest()`)

## Event Handling

**EventEmitter Pattern:**
- Extend `EventEmitter` for classes emitting events
- Define event names as string literals or constants
- Use strongly typed event signatures where possible
- Clean up event listeners in cleanup/dispose methods

```typescript
export class PikeBridge extends EventEmitter {
    private process: PikeProcess | null = null;

    async start(): Promise<void> {
        // ...
        pikeProc.on('stderr', (data) => {
            this.emit('stderr', data);
        });
    }
}
```

## Configuration

**Environment Variables:**
- Use `process.env` for environment-specific values
- Feature flags via environment variables (e.g., `PIKE_LSP_TEST_MODE`, `USE_CURRENT_DISPLAY`)
- Default values provided for all configuration

**Configuration Objects:**
- Centralized configuration objects (e.g., `PikeSettings`, `PikeBridgeOptions`)
- Default exports: `const defaultSettings: PikeSettings = { ... }`
- Spread operator for merging: `{ ...defaultSettings, ...(settings?.pike ?? {}) }`

---

*Convention analysis: 2026-01-23*
