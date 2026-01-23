# Phase 17: Responsiveness Tuning - Research

**Researched:** 2026-01-23
**Domain:** LSP Performance Tuning & Debouncing Optimization
**Confidence:** HIGH

## Summary

This research covers the implementation of Phase 17: Responsiveness Tuning, the final performance phase of the Pike LSP v3.0 optimization series. The phase focuses on optimizing the diagnostic debouncing delay from the current 500ms default to 250ms, making it configurable via VSCode settings with validation, and verifying the changes through benchmarks and E2E tests.

**Primary recommendation:** Update three files to change the default diagnostic delay from 500ms to 250ms: (1) `packages/pike-lsp-server/src/constants/index.ts` (constant definition), (2) `packages/vscode-pike/package.json` (schema default), (3) document the change in benchmarks. The diagnostic delay configuration flow is already complete: VSCode extension reads `pike.diagnosticDelay` and passes via `initializationOptions.diagnosticDelay` to the LSP server, which uses it for debouncing in `validateDocumentDebounced()`.

## Standard Stack

### Core
| Component | Location | Purpose | How It Works |
|-----------|----------|---------|--------------|
| Diagnostic Delay Constant | `packages/pike-lsp-server/src/constants/index.ts` | Defines `DIAGNOSTIC_DELAY_DEFAULT = 500` | Used in diagnostics.ts and core/types.ts |
| VSCode Setting Schema | `packages/vscode-pike/package.json` | `pike.diagnosticDelay` configuration | Type: number, default: 500, min: 100, max: 5000 |
| LSP Server Handler | `packages/pike-lsp-server/src/features/diagnostics.ts` | `validateDocumentDebounced()` function | Uses `globalSettings.diagnosticDelay` for setTimeout |
| Extension Configuration | `packages/vscode-pike/src/extension.ts` | Passes diagnosticDelay to LSP server | Reads via `config.get<number>('diagnosticDelay', 500)` |

### Supporting
| Component | Purpose | Pattern |
|-----------|---------|---------|
| `PikeSettings` interface | Type-safe settings contract | `diagnosticDelay: number` |
| `defaultSettings` constant | Fallback configuration | Uses `DIAGNOSTIC_DELAY_DEFAULT` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static 250ms default | File-size adaptive delay | Adaptive is more complex; Phase 17 scope is tuning, not redesign |
| User setting only | Environment variable | Setting is more discoverable and changeable at runtime |

## Architecture Patterns

### Configuration Flow Pattern
**What:** Diagnostic delay flows from VSCode settings through LSP initialization to the debouncing handler.
**When to use:** Any configuration that affects LSP server behavior at runtime.
**Flow:**
```
1. User sets pike.diagnosticDelay in settings.json (or uses default)
2. VSCode extension reads via config.get<number>('diagnosticDelay', 500)
3. Passes via initializationOptions.diagnosticDelay to LSP server
4. LSP server onInitialize updates globalSettings.diagnosticDelay
5. validateDocumentDebounced() uses globalSettings.diagnosticDelay for setTimeout
6. onDidChangeConfiguration updates globalSettings on runtime changes
```

### Debouncing Pattern (Current Implementation)
**What:** `validateDocumentDebounced()` clears existing timer and schedules new validation.
**When to use:** Coalescing rapid document changes into single validation.
**Example:**
```typescript
// Source: packages/pike-lsp-server/src/features/diagnostics.ts:285-307
function validateDocumentDebounced(document: TextDocument): void {
    const uri = document.uri;
    const version = document.version;

    // Clear existing timer
    const existingTimer = validationTimers.get(uri);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
        validationTimers.delete(uri);
        void validateDocument(document);
    }, globalSettings.diagnosticDelay);

    validationTimers.set(uri, timer);
}
```

### Settings Validation Pattern
**What:** VSCode package.json enforces bounds (minimum, maximum) on numeric settings.
**When to use:** Any user-configurable numeric value that needs validation.
**Example:**
```json
// Source: packages/vscode-pike/package.json:117-123
"pike.diagnosticDelay": {
    "type": "number",
    "default": 500,
    "minimum": 100,
    "maximum": 5000,
    "description": "Delay in milliseconds before running diagnostics after a document change"
}
```

### Anti-Patterns to Avoid
- **Changing only the constant without updating package.json:** Creates mismatch between documentation and actual default
- **Setting bounds too tight (e.g., 0-100ms):** Doesn't allow users to increase delay if needed for slow machines
- **Ignoring the diagnostics.ts duplicate debounce:** The debouncing pattern exists in both `server.ts` (legacy) and `diagnostics.ts` (feature module) - feature module is the active one

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Debouncing utility | Custom debounce wrapper | Native `setTimeout` + `clearTimeout` with Map | Already implemented correctly in `validateDocumentDebounced()` |
| Settings UI | Custom settings panel | VSCode's settings.json schema | Automatically provides intellisense, validation, UI |
| CPU measurement during typing | Manual ps parsing | VSCode extension host profiling (manual inspection) | CPU thrashing is qualitative (temporal pattern), not quantitative |

## Current Implementation Details

### Where Diagnostic Delay is Set (HIGH confidence)

**1. Constant Definition** (`packages/pike-lsp-server/src/constants/index.ts:57-59`)
```typescript
/**
 * Default diagnostic delay (ms) - debounce validation to avoid triggering on every keystroke
 */
export const DIAGNOSTIC_DELAY_DEFAULT = 500;
```

**2. VSCode Schema Default** (`packages/vscode-pike/package.json:117-123`)
```json
"pike.diagnosticDelay": {
    "type": "number",
    "default": 500,
    "minimum": 100,
    "maximum": 5000,
    "description": "Delay in milliseconds before running diagnostics after a document change"
}
```

**3. Configuration Reader** (`packages/vscode-pike/src/extension.ts:292`)
```typescript
const diagnosticDelay = config.get<number>('diagnosticDelay', 500);
```

**4. LSP Initialization** (`packages/pike-lsp-server/src/server.ts:397-401`)
```typescript
if (initOptions?.diagnosticDelay !== undefined) {
    globalSettings = {
        ...globalSettings,
        diagnosticDelay: initOptions.diagnosticDelay,
    };
}
```

**5. Debounce Usage** (`packages/pike-lsp-server/src/features/diagnostics.ts:304`)
```typescript
const timer = setTimeout(() => {
    validationTimers.delete(uri);
    void validateDocument(document);
}, globalSettings.diagnosticDelay);
```

### Configuration Change Handler
**Source:** `packages/vscode-pike/src/extension.ts:199-208`
```typescript
workspace.onDidChangeConfiguration(async (event) => {
    if (
        event.affectsConfiguration('pike.pikeModulePath') ||
        event.affectsConfiguration('pike.pikeIncludePath') ||
        event.affectsConfiguration('pike.pikePath') ||
        event.affectsConfiguration('pike.diagnosticDelay')
    ) {
        await restartClient(false);
    }
})
```
**Note:** Changing `pike.diagnosticDelay` currently restarts the entire LSP client. This is heavy-handed but functional - Phase 17 scope does not include optimizing this restart behavior.

## Common Pitfalls

### Pitfall 1: Inconsistent Defaults Across Files
**What goes wrong:** Constant says 500, package.json says 250 - user sees 250 but code uses 500.
**How to avoid:** Update ALL three locations atomically: (1) `DIAGNOSTIC_DELAY_DEFAULT`, (2) `package.json` default, (3) extension.ts fallback value.
**Warning signs:** User reports changing setting has no effect.

### Pitfall 2: CPU Thrashing Measurement is Qualitative
**What goes wrong:** Trying to write an automated test that measures CPU percentage during typing - unreliable across CI environments.
**How to avoid:** Focus on temporal behavior pattern (bursty vs continuous) and provide manual verification procedure.
**Warning signs:** Test passes locally but fails in CI due to CPU load variance.

### Pitfall 3: Bounds Validation Only Works in VSCode UI
**What goes wrong:** User edits settings.json directly with value 99999 - VSCode doesn't validate JSON edits.
**How to avoid:** Document bounds in description; LSP server accepts any value but warn if out of reasonable range.
**Warning signs:** User reports diagnostics never fire (set delay to 999999).

## Code Examples

### Changing the Default Value (All Required Changes)
```typescript
// 1. packages/pike-lsp-server/src/constants/index.ts:59
export const DIAGNOSTIC_DELAY_DEFAULT = 250; // was 500

// 2. packages/vscode-pike/package.json:119
"pike.diagnosticDelay": {
    "default": 250,  // was 500
    "minimum": 50,   // adjusted per Phase 17 context (was 100)
    "maximum": 2000, // adjusted per Phase 17 context (was 5000)
    ...
}

// 3. No change needed in extension.ts - reads default from package.json schema
// 4. No change needed in diagnostics.ts - uses globalSettings.diagnosticDelay
```

### Simulating Rapid Typing in E2E Tests
```typescript
// Source: Based on patterns from lsp-features.test.ts
test('Debouncing prevents CPU thrashing during rapid typing', async function() {
    this.timeout(30000);
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]!;
    const uri = vscode.Uri.joinPath(workspaceFolder.uri, 'test-typing.pike');

    // Create a new document for typing test
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);

    // Simulate rapid typing: 10 keystrokes/second for 5 seconds = 50 edits
    const startTime = Date.now();
    const editPromises: Promise<boolean>[] = [];

    for (let i = 0; i < 50; i++) {
        // Wait 100ms between keystrokes (10 per second)
        await new Promise(resolve => setTimeout(resolve, 100));

        // Type a character at the end
        const edit = editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(i, 0), 'x\n');
        });
        editPromises.push(edit);
    }

    await Promise.all(editPromises);
    const elapsed = Date.now() - startTime;

    // Verify typing completed in reasonable time (debounce shouldn't block UI)
    assert.ok(elapsed < 10000, 'Typing should complete within 10 seconds');

    // Additional verification: check that we didn't get 50 separate validations
    // (would require instrumenting validateDocument calls - manual verification recommended)
});
```

### Benchmark Addition for Diagnostic Delay Impact
```typescript
// Source: packages/pike-lsp-server/benchmarks/runner.ts (add new group)
group('Responsiveness (Warm)', async () => {
    const mediumPikeCode = fs.readFileSync(
        path.join(__dirname, 'fixtures/medium.pike'),
        'utf8'
    );

    // Benchmark: Measure validation latency with debounce delay
    bench('Validation with 250ms debounce (default)', async () => {
        // Simulate document change and wait for debounce
        await new Promise(resolve => setTimeout(resolve, 250));
        const response = await bridge.analyze(
            mediumPikeCode,
            ['introspect'],
            'medium.pike',
            2
        );
        return response;
    });

    // Benchmark: First keystroke response (user perception)
    bench('First diagnostic after document change', async () => {
        const start = Date.now();
        await bridge.analyze(mediumPikeCode, ['introspect'], 'medium.pike', 1);
        return Date.now() - start;
    });
});
```

## State of the Art

| Old Value | New Value | Files to Change | Justification |
|-----------|-----------|-----------------|---------------|
| 500ms | 250ms | constants/index.ts, package.json | Balance responsiveness vs CPU - Phase 17 context decision |
| min: 100, max: 5000 | min: 50, max: 2000 | package.json | Tighten bounds to prevent extreme values |

**Already in place (no changes needed):**
- Configuration change handler (`extension.ts`)
- LSP initialization options passing (`extension.ts`, `server.ts`)
- Debouncing implementation (`diagnostics.ts`)

## Open Questions

1. **CPU Measurement in E2E Tests:** How to reliably measure CPU usage during typing simulation in CI?
   - **What we know:** VSCode extension tests run in real VSCode instance, can measure time but not CPU directly.
   - **What's unclear:** No standard API for CPU usage in VSCode extension test environment.
   - **Recommendation:** Focus on temporal pattern (bursty vs continuous) and provide manual verification procedure. Use time-based assertions (typing completes within reasonable time) as proxy for CPU thrashing.

2. **Existing Typing Simulation Tests:** Are there existing E2E tests that simulate typing we can extend?
   - **What we know:** E2E tests in `lsp-features.test.ts` open documents and verify LSP responses, but don't simulate typing.
   - **What's unclear:** Whether typing simulation is feasible within current test framework.
   - **Recommendation:** Create new test file for responsiveness-specific tests; re-use existing test infrastructure (workspace setup, document opening) from `lsp-features.test.ts`.

## Benchmark Runner Structure

**Source:** `packages/pike-lsp-server/benchmarks/runner.ts`

The benchmark runner uses **mitata** for high-precision benchmarking. New benchmarks are added by creating a `group()` and calling `bench()` within it.

**Key pattern for adding benchmarks:**
```typescript
import { run, bench, group } from 'mitata';

group('Group Name', () => {
    bench('Benchmark Name', async () => {
        // Benchmark code here
        return result;
    });
});

await run({
    format: process.env.MITATA_JSON ? 'json' : undefined,
    colors: !process.env.MITATA_JSON,
});
```

**Existing groups:**
- `LSP Server Foundations` - Startup benchmarks
- `Validation Pipeline (Warm)` - File size validation benchmarks
- `Request Consolidation (Warm)` - 3-call vs 1-call validation
- `Compilation Cache (Warm)` - Cache hit/miss benchmarks
- `Cross-file Cache Verification` - Dependency tracking
- `Stdlib Performance (Warm)` - Stdlib module introspection
- `Intelligence Operations (Warm)` - Hover, completion

**Where to add Phase 17 benchmarks:**
Create new group `Responsiveness (Warm)` after `Stdlib Performance` section.

## E2E Test Structure

**Source:** `packages/vscode-pike/src/test/integration/lsp-features.test.ts`

**Key patterns for Phase 17 tests:**

1. **Test setup** (lines 61-129):
   - Waits for extension activation
   - Opens test fixture document
   - Waits for LSP initialization (15 seconds)
   - Returns `document` and `fixtureUri` for test use

2. **Test assertions** (lines 147-206):
   - Uses `assertWithLogs()` to dump server logs on failure
   - Verifies non-null responses (regression detection)
   - Checks structure of returned data

3. **Timeout pattern:**
   ```typescript
   test('Test name', async function() {
       this.timeout(30000); // 30 seconds for LSP operations
       // test code
   });
   ```

**Where to add Phase 17 tests:**
Create new test file `src/test/integration/responsiveness.test.ts` to keep responsiveness tests separate from LSP feature tests.

## Sources

### Primary (HIGH confidence)
- `packages/pike-lsp-server/src/constants/index.ts` - Verified DIAGNOSTIC_DELAY_DEFAULT = 500
- `packages/vscode-pike/package.json` - Verified pike.diagnosticDelay schema
- `packages/vscode-pike/src/extension.ts` - Verified configuration reading and passing
- `packages/pike-lsp-server/src/features/diagnostics.ts` - Verified debouncing implementation
- `packages/pike-lsp-server/src/core/types.ts` - Verified PikeSettings interface

### Secondary (MEDIUM confidence)
- `packages/vscode-pike/src/test/integration/lsp-features.test.ts` - Verified E2E test patterns
- `packages/pike-lsp-server/benchmarks/runner.ts` - Verified mitata benchmark structure
- `.planning/phases/10-benchmarking-infrastructure/10-RESEARCH.md` - Benchmarking methodology reference

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All files verified directly in codebase
- Architecture: HIGH - Configuration flow traced from VSCode to LSP server
- Pitfalls: HIGH - Identified common issues from existing code patterns

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (30 days for stable domain)
