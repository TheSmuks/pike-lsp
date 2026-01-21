# Phase 6: Automated LSP Feature Verification - Research

**Researched:** 2026-01-21
**Domain:** VSCode extension testing, LSP protocol testing, E2E feature verification
**Confidence:** HIGH

## Summary

Phase 6 addresses a critical verification gap identified in the milestone audit: current integration tests verify extension activation and file opening, but **do not verify LSP features actually return data**. The tests at `packages/vscode-pike/src/test/integration/extension.test.ts:102` only check `document.languageId === 'pike'`, not whether hover/symbols/definition/completion work.

This phase adds automated E2E tests that call actual LSP protocol methods and verify responses contain valid data. The key insight: **unit tests can pass while LSP features are completely broken** - we need integration tests that exercise the full stack: VSCode → LSP Server → Bridge → Pike.

**Primary recommendation:** Extend existing VSCode integration tests to call `vscode.commands.executeCommand` for LSP features and verify response data structures.

## Standard Stack

### Core Testing Tools
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `@vscode/test-electron` | Latest | VSCode extension testing | Official VSCode testing framework |
| `vscode` API | Latest | LSP command execution | Built into VSCode extension API |
| Mocha | 10+ | Test runner | VSCode test-electron uses Mocha |
| `node:assert` | Built-in | Assertions | Standard Node.js assertions |

### Existing Test Infrastructure (Reuse)
| File | Purpose | Current Coverage | What to Add |
|------|---------|------------------|-------------|
| `packages/vscode-pike/src/test/integration/extension.test.ts` | Extension activation | Activation, file opening | **Add LSP feature calls** |
| `.github/workflows/test.yml` | CI pipeline | xvfb E2E tests | **Add feature verification gate** |
| `.husky/pre-push` | Pre-push validation | Build, Pike, smoke tests | **Add E2E feature check** |

### VSCode LSP Testing Patterns
| Pattern | Command | Verifies |
|---------|---------|----------|
| Document Symbols | `vscode.executeDocumentSymbolProvider` | Outline/symbol tree |
| Hover | `vscode.executeHoverProvider` | Type info on hover |
| Definition | `vscode.executeDefinitionProvider` | Go-to-definition |
| Completion | `vscode.executeCompletionItemProvider` | Autocomplete |

**Installation:**
```bash
# Already installed in packages/vscode-pike
# No new dependencies needed
cd packages/vscode-pike
pnpm install  # @vscode/test-electron already in devDependencies
```

## Architecture Patterns

### Pattern 1: VSCode Command-Based Testing
**What:** Use `vscode.executeXProvider` commands to test LSP features end-to-end
**When to use:** Testing LSP features in integration tests
**Why:** Tests the actual VSCode → LSP Server → Pike path that users experience

```typescript
// Source: VSCode API documentation
// Test document symbols returns valid data
const uri = vscode.Uri.file('/path/to/test.pike');
const symbols = await vscode.commands.executeCommand(
    'vscode.executeDocumentSymbolProvider',
    uri
);

// Verify response structure
assert.ok(Array.isArray(symbols), 'Should return symbols array');
assert.ok(symbols.length > 0, 'Should have at least one symbol');
assert.ok(symbols[0].name, 'Symbol should have name');
assert.ok(symbols[0].kind !== undefined, 'Symbol should have kind');
```

### Pattern 2: Position-Based Feature Testing
**What:** Test hover, definition, completion at specific code positions
**When to use:** Testing features that require cursor position
**Why:** Verifies LSP correctly identifies symbols at positions

```typescript
// Source: VSCode API vscode.Position
// Test hover at specific position
const document = await vscode.workspace.openTextDocument(uri);
const position = new vscode.Position(5, 10);  // line 5, column 10

const hovers = await vscode.commands.executeCommand(
    'vscode.executeHoverProvider',
    uri,
    position
);

// Verify hover content exists
assert.ok(hovers && hovers.length > 0, 'Should return hover data');
assert.ok(hovers[0].contents.length > 0, 'Hover should have content');
```

### Pattern 3: Test File Fixture Pattern
**What:** Use dedicated test Pike files with known symbols/structure
**When to use:** Creating predictable test scenarios
**Why:** Avoid test brittleness from changing production code

```typescript
// Source: Common VSCode extension testing pattern
// Create test fixture file
const fixtureContent = `
int test_variable = 42;

int test_function(string arg) {
    return sizeof(arg);
}

class TestClass {
    int member_variable;

    void member_method() {
        // implementation
    }
}
`;

const testUri = vscode.Uri.joinPath(workspaceUri, 'test-fixture.pike');
await vscode.workspace.fs.writeFile(testUri, Buffer.from(fixtureContent));

// Now test LSP features on this known structure
const symbols = await vscode.commands.executeCommand(
    'vscode.executeDocumentSymbolProvider',
    testUri
);

// Verify expected symbols exist
const varSymbol = symbols.find(s => s.name === 'test_variable');
assert.ok(varSymbol, 'Should find test_variable symbol');
```

### Pattern 4: CI Gate with Feature Verification
**What:** Add CI job that fails if LSP features return null/empty
**When to use:** Preventing regressions from merging
**Why:** Automated verification before code reaches main

```yaml
# Source: .github/workflows/test.yml pattern
# Add feature verification step
- name: Run VSCode E2E Feature Tests
  run: xvfb-run --auto-servernum pnpm --filter vscode-pike test:features

- name: Verify LSP Features Gate
  run: |
    if grep -q "FAIL.*LSP feature" test-results.log; then
      echo "❌ LSP feature tests failed - blocking merge"
      exit 1
    fi
    echo "✓ All LSP features verified"
```

### Anti-Patterns to Avoid
- **Testing only unit layer**: Bridge tests can pass while VSCode integration is broken
- **Not using vscode.executeXProvider**: Don't mock the LSP protocol, test the real thing
- **Hardcoded test file paths**: Use `vscode.workspace.workspaceFolders` for portability
- **Ignoring null responses**: A null response means the feature is broken, fail the test
- **Testing without xvfb in CI**: VSCode requires a display server, xvfb provides headless mode

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VSCode test harness | Custom test runner | `@vscode/test-electron` | Official, handles VSCode lifecycle |
| LSP protocol testing | Mock LSP client | `vscode.executeXProvider` | Tests real VSCode path |
| Test fixtures | Inline code strings | Separate `.pike` fixture files | Cleaner, reusable |
| CI xvfb setup | Custom scripts | Existing workflow xvfb pattern | Already works in vscode-e2e job |
| Assertion library | Custom checks | `node:assert/strict` | Standard, readable |

**Key insight:** VSCode already provides everything needed via `vscode.commands.executeCommand`. Don't reimplement the LSP protocol - test through VSCode's API.

## Common Pitfalls

### Pitfall 1: False Pass from Null Responses
**What goes wrong:** Test passes when LSP feature returns null instead of data
**Why it happens:** Not checking response is non-null/non-empty
**How to avoid:** Always assert response exists AND has expected structure
**Warning signs:** "Tests pass but feature doesn't work in real editor"

```typescript
// BAD: Doesn't fail if symbols is null
const symbols = await vscode.commands.executeCommand(...);
// Test passes even if symbols === null

// GOOD: Explicitly check for data
assert.ok(symbols, 'Should return symbols (not null)');
assert.ok(Array.isArray(symbols), 'Should return array');
assert.ok(symbols.length > 0, 'Should have symbols');
```

### Pitfall 2: Timing Issues in CI
**What goes wrong:** Test fails in CI but passes locally due to timing
**Why it happens:** LSP server not fully initialized before test runs
**How to avoid:** Add explicit wait for server readiness
**Warning signs:** "Works on my machine, fails in CI"

```typescript
// GOOD: Wait for LSP to be ready
await new Promise(resolve => setTimeout(resolve, 5000));  // Wait 5s
// Or check server status before testing
```

### Pitfall 3: Test File Cleanup
**What goes wrong:** Test fixtures accumulate, pollute workspace
**Why it happens:** Not cleaning up created test files
**How to avoid:** Use `after()` hook to delete test files
**Warning signs:** Git status shows untracked test files

```typescript
after(async () => {
    // Clean up test fixture
    await vscode.workspace.fs.delete(testUri);
});
```

### Pitfall 4: Missing xvfb in CI
**What goes wrong:** VSCode tests fail with "cannot open display"
**Why it happens:** VSCode requires X11 display, CI has none
**How to avoid:** Use `xvfb-run` wrapper in CI scripts
**Warning signs:** "DISPLAY not set" errors

```bash
# GOOD: Run with xvfb
xvfb-run --auto-servernum pnpm test
```

### Pitfall 5: Over-Specific Assertions
**What goes wrong:** Tests break when implementation details change
**Why it happens:** Asserting exact strings/structures instead of contracts
**How to avoid:** Test LSP protocol contracts, not Pike implementation details
**Warning signs:** Tests break on every minor change

```typescript
// BAD: Over-specific
assert.strictEqual(hover.contents[0], 'int test_variable');

// GOOD: Test contract
assert.ok(hover.contents[0].includes('int'), 'Hover should show type');
```

## Code Examples

### Verified: Document Symbols E2E Test

```typescript
// Source: VSCode API executeDocumentSymbolProvider
// packages/vscode-pike/src/test/integration/lsp-features.test.ts
import * as vscode from 'vscode';
import * as assert from 'assert';

suite('LSP Feature E2E Tests', () => {
    test('Document symbols returns valid symbol tree', async function() {
        this.timeout(30000);

        // Open test file
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder, 'Workspace folder should exist');

        const uri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');

        // Execute document symbol provider
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            uri
        );

        // Verify response structure
        assert.ok(symbols, 'Should return symbols (not null)');
        assert.ok(Array.isArray(symbols), 'Should return array');
        assert.ok(symbols.length > 0, 'Should have at least one symbol');

        // Verify symbol structure
        const firstSymbol = symbols[0];
        assert.ok(firstSymbol.name, 'Symbol should have name');
        assert.ok(firstSymbol.kind !== undefined, 'Symbol should have kind');
        assert.ok(firstSymbol.range, 'Symbol should have range');
    });
});
```

### Verified: Hover E2E Test

```typescript
// Source: VSCode API executeHoverProvider
test('Hover returns type information', async function() {
    this.timeout(30000);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const uri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');
    const document = await vscode.workspace.openTextDocument(uri);

    // Find position of a known symbol (e.g., line with "int x")
    const text = document.getText();
    const match = text.match(/int\s+(\w+)/);
    assert.ok(match, 'Should find int variable in test file');

    const offset = text.indexOf(match[0]) + 4;  // Position after "int "
    const position = document.positionAt(offset);

    // Execute hover provider
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        uri,
        position
    );

    // Verify response
    assert.ok(hovers, 'Should return hover data (not null)');
    assert.ok(hovers.length > 0, 'Should have at least one hover');
    assert.ok(hovers[0].contents.length > 0, 'Hover should have content');

    // Verify content is MarkupContent with type info
    const content = hovers[0].contents[0];
    const contentStr = typeof content === 'string' ? content : content.value;
    assert.ok(contentStr.includes('int'), 'Hover should show type information');
});
```

### Verified: Definition E2E Test

```typescript
// Source: VSCode API executeDefinitionProvider
test('Go-to-definition returns location', async function() {
    this.timeout(30000);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const uri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');
    const document = await vscode.workspace.openTextDocument(uri);

    // Find position of a symbol reference
    const text = document.getText();
    const position = document.positionAt(text.indexOf('test_variable'));

    // Execute definition provider
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeDefinitionProvider',
        uri,
        position
    );

    // Verify response
    assert.ok(locations, 'Should return locations (not null)');
    assert.ok(Array.isArray(locations), 'Should return array');
    assert.ok(locations.length > 0, 'Should have at least one location');

    // Verify location structure
    const location = locations[0];
    assert.ok(location.uri, 'Location should have URI');
    assert.ok(location.range, 'Location should have range');
});
```

### Verified: Completion E2E Test

```typescript
// Source: VSCode API executeCompletionItemProvider
test('Completion returns suggestions', async function() {
    this.timeout(30000);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const uri = vscode.Uri.joinPath(workspaceFolder.uri, 'test.pike');
    const document = await vscode.workspace.openTextDocument(uri);

    // Position after "Array." to trigger stdlib completion
    const text = document.getText();
    const position = document.positionAt(text.indexOf('Array.') + 6);

    // Execute completion provider
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        uri,
        position
    );

    // Verify response
    assert.ok(completions, 'Should return completions (not null)');
    assert.ok(completions.items, 'Should have items array');
    assert.ok(completions.items.length > 0, 'Should have completion items');

    // Verify item structure
    const item = completions.items[0];
    assert.ok(item.label, 'Completion should have label');
    assert.ok(item.kind !== undefined, 'Completion should have kind');
});
```

## State of the Art

| Aspect | Current State | This Phase Adds | Impact |
|--------|---------------|-----------------|--------|
| Extension testing | Activation only | LSP feature verification | Catch broken features |
| CI gates | Build + smoke tests | E2E feature checks | Prevent regression merges |
| Test coverage | Unit + Pike layers | Full VSCode → Pike path | True E2E confidence |
| Verification manual | Yes (CLAUDE.md checklist) | Automated in CI | Faster feedback |

**Deprecated/outdated:**
- **Manual-only LSP testing**: Now automated via VSCode commands
- **Unit tests as sole verification**: Need E2E to catch integration breaks

## Open Questions

1. **Test fixture complexity**: How many Pike constructs to include in test files?
   - **What we know:** Need at least: variables, functions, classes for symbol/hover/definition
   - **What's unclear:** Whether to test all Pike syntax or subset
   - **Recommendation:** Start with basic constructs (variables, functions, classes), expand if needed

2. **CI timeout tuning**: What timeout values prevent false failures?
   - **What we know:** Current tests use 30-45 second timeouts
   - **What's unclear:** Optimal timeout for E2E feature tests in CI
   - **Recommendation:** Start with 30s, increase if CI shows timing issues

3. **Test fixture management**: Single file or multiple fixtures per feature?
   - **What we know:** Single test.pike file works for current tests
   - **What's unclear:** Whether features need separate fixtures
   - **Recommendation:** Single test fixture with diverse constructs, split only if conflicts arise

## Sources

### Primary (HIGH confidence)
- [VSCode API - Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension) - Official testing guide
- [VSCode API - Commands](https://code.visualstudio.com/api/references/commands) - executeDocumentSymbolProvider, executeHoverProvider patterns
- [@vscode/test-electron](https://www.npmjs.com/package/@vscode/test-electron) - Extension test harness
- [VSCode Extension Samples](https://github.com/microsoft/vscode-extension-samples) - LSP testing patterns

### Secondary (MEDIUM confidence)
- [LSP Specification](https://microsoft.github.io/language-server-protocol/) - Protocol contracts to verify
- [Mocha Documentation](https://mochajs.org/) - Test framework used by VSCode tests

### Internal Sources (HIGH confidence)
- `packages/vscode-pike/src/test/integration/extension.test.ts` - Current test patterns
- `.github/workflows/test.yml` - CI xvfb setup
- `.claude/CLAUDE.md` - Manual verification checklist requirements

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses existing VSCode testing infrastructure
- Architecture: HIGH - Based on official VSCode API and test patterns
- Implementation: HIGH - Clear code examples from VSCode docs
- CI integration: HIGH - Existing xvfb setup works, just add test step

**Research date:** 2026-01-21
**Valid until:** 180 days (VSCode API stable, test patterns well-established)
