# Testing Patterns

**Analysis Date:** 2025-01-19

## Test Framework

**Runner:**
- Node.js built-in test runner (`node:test`)
- Config: Built into Node.js 18+

**Assertion Library:**
- `node:assert/strict` (strict assertion mode)

**Run Commands:**
```bash
# Run all tests
pnpm test

# Run package-specific tests
cd packages/pike-bridge && pnpm test
cd packages/pike-lsp-server && pnpm test

# Run specific test file (after build)
node --test dist/workspace-index.test.js
node --test dist/bridge.test.js

# Full test suite with Pike stdlib validation
./scripts/run-tests.sh
```

**Test Scripts in package.json:**
```json
{
  "test": "pnpm build && node --test dist/workspace-index.test.js"
}
```

## Test File Organization

**Location:**
- Co-located with source code in same directory
- Unit tests: `*.test.ts` next to implementation
- Integration tests: `tests/` subdirectory

**Naming:**
- Unit tests: `<module>.test.ts` (e.g., `workspace-index.test.ts`, `bridge.test.ts`)
- Test suites: `<feature>-tests.ts` (e.g., `lsp-tests.ts`, `performance-tests.ts`)

**Structure:**
```
packages/
  pike-bridge/
    src/
      bridge.ts
      bridge.test.ts          # Unit tests for bridge
  pike-lsp-server/
    src/
      workspace-index.ts
      workspace-index.test.ts # Unit tests for index
      tests/
        lsp-tests.ts          # Core LSP functionality
        integration-tests.ts  # End-to-end workflows
        lsp-protocol-tests.ts # Hover, completion, definition
        performance-tests.ts  # Speed and memory benchmarks
        pike-source-tests.ts  # Pike stdlib validation
        stdlib-tests.ts       # Stdlib module tests
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('FeatureName', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
    });

    after(async () => {
        if (bridge) {
            await bridge.stop();
        }
    });

    it('should do something specific', async () => {
        const result = await bridge.parse('int x = 5;', 'test.pike');
        assert.ok(result.symbols.length > 0, 'Should extract symbols');
    });
});
```

**Patterns:**
- `before` - Set up test fixtures (start bridge, create instances)
- `after` - Tear down (stop bridge, cleanup)
- `describe` - Group related tests
- `it` - Individual test case
- `it.skip` - Skip test temporarily (used for TODO features)
- Nested `describe` for subgrouping

**Assertions:**
```typescript
// Boolean checks
assert.ok(condition, 'Failure message');
assert.ok(result.symbols.length > 0, 'Should have symbols');

// Equality
assert.equal(actual, expected, 'Message');
assert.strictEqual(result.found, 1, 'Should find module');

// Deep equality
assert.deepEqual(result1, result2, 'Results should be identical');

// Type checks
assert.ok(Array.isArray(result.tokens), 'Tokens should be an array');

// String matching
assert.match(version, /\d+\.\d+/, 'Version should match X.Y pattern');
```

## Mocking

**Framework:** No external mocking library. Use test doubles/stubs manually.

**Patterns:**
```typescript
// Stub error callback
const errorMessages: string[] = [];
index.setErrorCallback((message, uri) => {
    errorMessages.push(message);
});

// Mock/suppress stderr logging
bridge.on('stderr', () => {});

// Conditional Pike availability check
before(async () => {
    bridge = new PikeBridge();
    const available = await bridge.checkPike();
    if (!available) {
        throw new Error('Pike executable not found. Tests require Pike.');
    }
    await bridge.start();
});
```

**What to Mock:**
- External dependencies (filesystem, network)
- Logging output (capture instead of printing)
- Error callbacks (capture errors for assertions)

**What NOT to Mock:**
- Pike bridge integration (test against real Pike subprocess)
- LSP protocol handlers (integration tests use real handlers)

## Fixtures and Factories

**Test Data:**
```typescript
// Inline test code
const code = `
    int x = 42;
    string hello() {
        return "world";
    }
    class MyClass {
        int value;
    }
`;

// Generated test code
function generatePikeCode(lines: number, moduleName: string): string {
    const declarations: string[] = [];
    for (let i = 0; i < lines; i++) {
        declarations.push(`int var${i} = ${i};`);
    }
    return declarations.join('\n');
}
```

**Location:**
- Inline in test files for simple cases
- Helper functions in test files for generated data
- No separate fixtures directory

## Coverage

**Requirements:** None enforced (no coverage tool configured)

**View Coverage:**
```bash
# No coverage command - coverage tracking not configured
```

## Test Types

**Unit Tests:**
- Scope: Single class/function in isolation
- Location: `<module>.test.ts` files
- Examples: `bridge.test.ts`, `workspace-index.test.ts`
- Focus: Public API behavior, edge cases

```typescript
describe('WorkspaceIndex', () => {
    it('should create an empty index', () => {
        const index = new WorkspaceIndex();
        const stats = index.getStats();
        assert.equal(stats.documents, 0);
    });
});
```

**Integration Tests:**
- Scope: Multiple components working together
- Location: `tests/integration-tests.ts`, `tests/lsp-tests.ts`
- Real Pike subprocess communication
- Real LSP protocol interactions

```typescript
describe('LSP Integration', () => {
    it('should handle document lifecycle', async () => {
        // Open document -> Change -> Close
    });
});
```

**Performance Tests:**
- Scope: Speed and memory characteristics
- Location: `tests/performance-tests.ts`
- Measures parsing speed, symbol extraction rate
- Tracks symbols per second

```typescript
describe('Performance Tests', () => {
    it('should parse 500-line file efficiently', async () => {
        const code = generatePikeCode(500, 'LargeModule');
        const start = performance.now();
        const result = await bridge.parse(code, 'large.pike');
        const duration = performance.now() - start;
        console.log(`Parsed ${duration.toFixed(2)}ms`);
    });
});
```

**Stdlib Validation Tests:**
- Scope: Parse ALL Pike 8 stdlib files
- Location: `tests/pike-source-tests.ts`
- Requirement: 100% of Pike stdlib must parse
- Tests against actual Pike source checkout

```typescript
// PIKE_SCANNER_INSTRUCTIONS.xml requirement
// "100% of Pike 8 stdlib files must parse without errors"

describe('Pike Stdlib Validation', () => {
    it('should parse all stdlib files', async () => {
        const files = findPikeFiles(PIKE_STDLIB);
        for (const file of files) {
            const result = await bridge.parse(code, file);
            assert.ok(result, `${file} should parse`);
        }
    });
});
```

## Common Patterns

**Async Testing:**
```typescript
it('should async operation', async () => {
    const result = await bridge.parse('int x = 5;');
    assert.ok(result.symbols);
});
```

**Error Testing:**
```typescript
it('should detect syntax errors', async () => {
    const result = await bridge.compile('int x = ;', 'test.pike');
    assert.ok(result.diagnostics.length > 0);
    assert.equal(result.diagnostics[0].severity, 'error');
});
```

**Setup with Skip Conditions:**
```typescript
before(async () => {
    bridge = new PikeBridge();
    const available = await bridge.checkPike();
    if (!available) {
        throw new SkipTestError('Pike not available');
    }
    await bridge.start();
});
```

**Multiple Variants:**
```typescript
describe('analyzeUninitialized', () => {
    it('should detect uninitialized string', async () => { /* ... */ });
    it('should not warn for initialized variables', async () => { /* ... */ });
    it('should not warn for int (auto-initialized)', async () => { /* ... */ });
    it('should detect uninitialized mapping', async () => { /* ... */ });
});
```

**Performance Measurement:**
```typescript
function measurePerformance<T>(
    operation: string,
    fn: () => Promise<T>,
    symbolCount: number
): Promise<T> {
    const start = performance.now();
    return fn().then(result => {
        const duration = performance.now() - start;
        const symbolsPerSecond = symbolCount / (duration / 1000);
        console.log(`[PERF] ${operation}: ${duration.toFixed(2)}ms (${symbolsPerSecond.toFixed(0)} symbols/sec)`);
        return result;
    });
}
```

**Environment-Specific Tests:**
```typescript
// Override with env vars
const PIKE_SOURCE_ROOT = process.env['PIKE_SOURCE_ROOT'] ?? '/default/path';
const PIKE_STDLIB = process.env['PIKE_STDLIB'] ?? `${PIKE_SOURCE_ROOT}/lib/modules`;
```

## Test Requirements

**Per CONTRIBUTING.md:**
- All new features MUST have tests
- Tests MUST pass before merging
- Pike stdlib files MUST continue to parse (100% compatibility)

**Stdlib Testing:**
- Requires Pike source checkout at `../Pike` or `PIKE_SOURCE_ROOT`
- Tests all `.pike` and `.pmod` files recursively
- Validates symbol extraction, not just parsing success
- Categorizes results by module (Stdio, Parser, etc.)

## Skipping Tests

**Pattern:**
```typescript
it.skip('should detect conditional initialization (TODO: branch analysis)', async () => {
    // TODO: Implement branch-aware control flow analysis
    const code = `/* test code */`;
    // Test implementation when feature is ready
});
```

**Use cases:**
- Feature not yet implemented
- Known bug to be fixed later
- Expensive test (for occasional runs)

## Test Execution Order

**Full suite:**
```bash
./scripts/run-tests.sh
```

**Sequence:**
1. Build all packages
2. Test Pike Bridge (`packages/pike-bridge`)
3. Test LSP Server Components (`packages/pike-lsp-server`)
4. Test Pike Source Parsing (`pike-source-tests.ts`)

**Individual tests:**
```bash
# After building
cd packages/pike-lsp-server
node --test dist/tests/lsp-tests.js
node --test dist/tests/performance-tests.js
node --test dist/tests/pike-source-tests.js
```

---

*Testing analysis: 2025-01-19*
