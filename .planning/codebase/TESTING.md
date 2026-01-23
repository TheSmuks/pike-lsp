# Testing Patterns

**Analysis Date:** 2026-01-23

## Test Framework

**Runner:**
- **Node.js native test runner** (`node:test`)
- Config: Built into Node.js 18+
- Package scripts: `"test": "pnpm build && node --test dist/*.test.js"`

**Assertion Library:**
- Node.js built-in `assert` module
- Strict assertions: `import assert from 'node:assert/strict'`
- Pattern: `assert.equal()`, `assert.ok()`, `assert.match()`, `assert.deepEqual()`

**VSCode Extension Testing:**
- Mocha + `@vscode/test-electron` for E2E tests
- Config: `packages/vscode-pike/src/test/tsconfig.test.json`

**Run Commands:**
```bash
# Run all tests (root)
pnpm test

# Run package tests
cd packages/pike-bridge && pnpm test
cd packages/pike-lsp-server && pnpm test

# E2E feature tests (headless required)
cd packages/vscode-pike && pnpm test:features

# Unit tests only
cd packages/vscode-pike && pnpm test:unit

# Type checking
pnpm typecheck
```

## Test File Organization

**Location:**
- **Co-located**: Test files next to source files
- Pattern: `src/module.ts` → `src/module.test.ts`
- Integration tests: `src/test/integration/*.test.ts`

**Naming:**
- Source: `module.ts`
- Test: `module.test.ts`
- Integration tests: `integration/test-name.test.ts`

**Structure:**
```
packages/
├── pike-bridge/
│   └── src/
│       ├── bridge.ts
│       ├── bridge.test.ts          # Unit tests
│       ├── process.ts
│       └── process.test.ts         # Unit tests
├── pike-lsp-server/
│   └── src/
│       ├── workspace-index.ts
│       ├── workspace-index.test.ts # Unit tests
│       └── tests/
│           └── smoke.test.ts       # Smoke tests
└── vscode-pike/
    └── src/
        ├── test/
        │   ├── integration/
        │   │   └── lsp-features.test.ts  # E2E tests
        │   ├── extension.test.ts
        │   └── mockOutputChannel.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

describe('PikeBridge', () => {
    let bridge: PikeBridge;

    // Setup: Runs once before all tests
    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
    });

    // Teardown: Runs once after all tests
    after(async () => {
        if (bridge) {
            await bridge.stop();
        }
    });

    it('should start and be running', () => {
        assert.equal(bridge.isRunning(), true);
    });

    // Nested describe for related tests
    describe('analyzeUninitialized', () => {
        it('should detect uninitialized string variable', async () => {
            // Test code...
        });
    });
});
```

**Patterns:**
- **Setup**: Use `before` for one-time initialization (bridge startup, fixture loading)
- **Teardown**: Use `after` for cleanup (bridge shutdown, file cleanup)
- **Test timeout**: E2E tests use `this.timeout(60000)` for 60s limit
- **Assertion messages**: Descriptive messages for all assertions
- **Skip tests**: Use `it.skip()` for incomplete tests with TODO comments

**E2E Test Pattern (VSCode):**
```typescript
suite('LSP Feature E2E Tests', () => {
    let document: vscode.TextDocument;

    suiteSetup(async function() {
        this.timeout(60000);
        // Activate extension, open document
        const extension = vscode.extensions.getExtension('pike-lsp.vscode-pike');
        await extension.activate();
        // Wait for LSP initialization
        await new Promise(resolve => setTimeout(resolve, 15000));
    });

    suiteTeardown(async () => {
        // Cleanup
    });

    test('Document symbols returns valid symbol tree', async function() {
        this.timeout(30000);
        // Test implementation
    });
});
```

## Mocking

**Framework:**
- No external mocking library (no Sinon, Nock, etc.)
- Manual mocks created for testing
- Mock implementations in test files

**Patterns:**

**Mock Output Channel:**
```typescript
export class MockOutputChannel implements vscode.OutputChannel {
    private logs: string[] = [];

    append(value: string) {
        this.logs.push(value);
    }

    appendLine(value: string) {
        this.logs.push(value);
    }

    getLogs(): string[] {
        return this.logs;
    }

    // Other required methods...
}
```

**Test Helper Pattern:**
```typescript
// Log capture utility for E2E tests
let capturedLogs: string[] = [];

function logServerOutput(message: string) {
    capturedLogs.push(message);
    console.log(`[Pike Server] ${message}`);
}

function assertWithLogs(condition: unknown, message: string): asserts condition {
    if (!condition) {
        dumpServerLogs(`Assertion failed: ${message}`);
        assert.ok(condition, message);
    }
}
```

**What to Mock:**
- VSCode APIs: `OutputChannel`, `ExtensionContext`
- External process communication: `PikeProcess` (via PikeBridge)
- File system: For testing file operations
- LSP client: `LanguageClient` in extension tests

**What NOT to Mock:**
- Business logic: Test real implementations
- Pike subprocess integration: Integration tests should use real Pike
- Data structures: Test with real data

## Fixtures and Factories

**Test Data:**
```typescript
// Inline test code
const code = `
    int x = 42;
    string hello() {
        return "world";
    }
`;

// Pike fixture file
const fixtureUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');
```

**Location:**
- Integration fixtures: `packages/vscode-pike/test/test-workspace/`
- Fixture file: `test-workspace/test.pike` with predefined Pike code
- Mock implementations: `packages/vscode-pike/src/test/mockOutputChannel.ts`

**E2E Test Fixture:**
```typescript
// Use existing test.pike file instead of dynamic creation
fixtureUri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');
document = await vscode.workspace.openTextDocument(fixtureUri);
await vscode.window.showTextDocument(document);
```

## Coverage

**Requirements:**
- No enforced coverage target (no `c8`, `nyc`, or Istanbul configuration detected)
- Manual testing guides in CLAUDE.md documents

**View Coverage:**
- No coverage reporting configured
- Use manual verification of LSP features

**Test-Driven Development:**
- Tests written before features (e.g., workspace-index.test.ts predates full implementation)
- Regression tests: E2E tests verify features don't return null

## Test Types

**Unit Tests:**
- **Scope**: Single class or function in isolation
- **Location**: Co-located with source files
- **Framework**: `node:test` for backend code
- **Example**: `bridge.test.ts` tests `PikeBridge` class methods
- **Pattern**: Test public API, mock external dependencies

**Integration Tests:**
- **Scope**: Multiple components working together
- **Location**: `src/test/integration/`
- **Framework**: Mocha + `@vscode/test-electron` for VSCode
- **Example**: `lsp-features.test.ts` tests full LSP flow from VSCode → Server → Bridge → Pike
- **Pattern**: Real Pike subprocess, real LSP server

**E2E Tests:**
- **Framework**: `@vscode/test-electron` with Mocha
- **Scope**: Full VSCode extension in real VSCode instance
- **Location**: `packages/vscode-pike/src/test/integration/`
- **Key principle**: Tests fail if LSP features return null/undefined (regression detection)
- **Headless requirement**: Must run headlessly (Xvfb on Linux)

**Smoke Tests:**
- **Location**: `packages/pike-lsp-server/src/tests/smoke.test.ts`
- **Purpose**: Quick validation that basic functionality works
- **Pattern**: Simple API calls with basic assertions

## Common Patterns

**Async Testing:**
```typescript
it('should parse Pike code', async () => {
    const result = await bridge.parse('int x = 42;');
    assert.ok(result.symbols);
    assert.ok(result.symbols.length > 0);
});
```

**Error Testing:**
```typescript
it('should detect syntax errors', async () => {
    const code = 'int x = ;';  // Syntax error
    const result = await bridge.compile(code);
    assert.ok(result.diagnostics.length > 0);
});
```

**Timeout Handling:**
```typescript
test('Document symbols returns valid symbol tree', async function() {
    this.timeout(30000);  // 30 second timeout
    // Test code that may take longer
});
```

**Concurrent Testing:**
```typescript
it('should deduplicate concurrent identical requests', async () => {
    const [result1, result2, result3] = await Promise.all([
        bridge.parse(code),
        bridge.parse(code),
        bridge.parse(code)
    ]);
    assert.deepEqual(result1, result2);
});
```

**Skipped Tests:**
```typescript
it.skip('should detect conditional initialization', async () => {
    // TODO: Implement branch-aware control flow analysis
});
```

## Headless Testing

**Mandatory Requirement:**
All VSCode E2E tests MUST run headlessly.

```bash
# Run headless (default)
cd packages/vscode-pike && pnpm test:features

# Use current display (for debugging only)
USE_CURRENT_DISPLAY=1 pnpm test:features
```

**Headless Script:**
- `scripts/test-headless.sh` handles Xvfb (Linux) → Weston → native fallback
- Tests auto-select appropriate display server
- Only use `USE_CURRENT_DISPLAY=1` for interactive debugging

**Why Headless:**
- CI/CD environments have no display
- Tests must run automated without GUI
- Prevents tests from failing due to display issues

## Test Data Management

**Bridge Lifecycle:**
```typescript
before(async () => {
    bridge = new PikeBridge();
    await bridge.start();
});

after(async () => {
    if (bridge) {
        await bridge.stop();
    }
});
```

**Document Cleanup:**
```typescript
suiteTeardown(async () => {
    if (document) {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
});
```

**Log Capture:**
```typescript
let capturedLogs: string[] = [];

suiteSetup(() => {
    capturedLogs = [];  // Reset logs
});

suiteTeardown(() => {
    dumpServerLogs('Suite teardown');  // Always dump logs
});
```

## Pike Script Testing

**Direct Testing:**
```bash
# Verify Pike script compiles
pike -e 'compile_file("pike-scripts/analyzer.pike");'

# Direct analyzer test via JSON-RPC
echo '{"jsonrpc":"2.0","id":1,"method":"parse","params":{"code":"int x;"}}' \
  | pike pike-scripts/analyzer.pike
```

**Bridge Communication Test:**
```bash
# Test introspect works through the bridge
node -e "
import('./packages/pike-bridge/dist/index.js').then(async ({PikeBridge}) => {
  const bridge = new PikeBridge();
  await bridge.start();
  const result = await bridge.introspect('class Foo { int x; }');
  console.log('Introspect:', result.success ? 'OK' : 'FAILED');
  await bridge.stop();
});
"
```

## Debugging Tests

**Log Dumping Pattern:**
```typescript
function dumpServerLogs(context: string) {
    console.log(`\n=== Pike Server Logs (${context}) ===`);
    capturedLogs.forEach(log => console.log(log));
    console.log('=== End Server Logs ===\n');
}
```

**Diagnostic Logging:**
```typescript
// Capture and display diagnostics
const diagnostics = vscode.languages.getDiagnostics(fixtureUri);
if (diagnostics.length > 0) {
    diagnostics.forEach(d => {
        logServerOutput(`Line ${d.range.start.line}: ${d.message}`);
    });
}
```

---

*Testing analysis: 2026-01-23*
