# Phase 6: Big Refactor Check - Research

**Researched:** 2026-01-20
**Domain:** LSP end-to-end verification, Pike module testing, VS Code extension testing
**Confidence:** MEDIUM

## Summary

This phase addresses a critical verification gap from Phase 5: while module structure was validated with 111 passing unit tests, actual end-to-end LSP functionality (completion, hover, go-to-definition) was not verified. The research identifies three verification layers needed:

1. **Pike layer**: Standalone file compilation, module loading via `master()->resolv()`, and JSON-RPC handler execution
2. **Bridge layer**: PikeBridge subprocess communication and LSP request routing
3. **Extension layer**: VS Code integration and editor feature delivery

The key insight is that Phase 5 tested the *bricks* (individual modules) but not the *wall* (actual LSP functionality delivered to the editor). This phase needs smoke tests that validate the complete request chain: `editor → LSP server → PikeBridge → analyzer.pike → LSP modules`.

**Primary recommendation:** Create a smoke-test.pike that validates each LSP handler returns correct JSON-RPC responses, then add this as a mandatory pre-merge gate in CONTRIBUTING.md.

## Standard Stack

### Core Testing Tools
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Pike test framework | Built-in | Unit testing Pike code | Native, no dependencies |
| `compile_file()` | Built-in | Standalone file compilation | Validates Pike syntax without imports |
| `master()->resolv()` | Built-in | Module loading verification | Tests runtime module resolution |
| Node.js `node:test` | 18+ | TypeScript/Bridge tests | VS Code LSP standard |

### Existing Test Infrastructure (Reuse)
| File | Purpose | Coverage |
|------|---------|----------|
| `test/tests/module-load-tests.pike` | Module loading smoke tests | All 6 LSP modules load via `master()->resolv()` |
| `test/tests/cross-version-tests.pike` | Handler validation | All 12 LSP methods execute successfully |
| `scripts/run-pike-tests.sh` | Test orchestration | Runs all 7 test suites in order |
| `packages/pike-lsp-server/dist/test-server.js` | Bridge smoke test | Parses, compiles, extracts symbols |

### VS Code Testing (Manual)
| Tool | Purpose | Usage |
|------|---------|-------|
| `scripts/test-extension.sh` | Manual extension testing | Opens VS Code with extension in dev mode |
| `@vscode/test-electron` | Automated extension tests | Future: automate extension E2E tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual smoke test script | `@vscode/test-electron` | Automated requires test infrastructure setup; manual sufficient for now |
| Pike native tests | External test framework | No benefit; Pike built-in testing is adequate |

**Installation:**
```bash
# No additional dependencies - uses existing stack
# Pike tests: pike test/tests/module-load-tests.pike
# Node tests: node --test dist/tests/*.js
# Manual: ./scripts/test-extension.sh
```

## Architecture Patterns

### Verification Pyramid

```
                    /\
                   /  \    Manual Smoke Test (test-extension.sh)
                  /    \   Completion, Hover, Go-to-Definition
                 /      \
                /        \  Bridge Tests (test-server.js)
               /          \ PikeBridge communication
              /            \ JSON-RPC request/response
             /______________\
            /                \
           /                  \ Pike Unit Tests (111 tests)
          /                    \ Module loading, handlers
         /______________________\ Foundation, Parser, Intelligence, Analysis
```

### Pattern 1: Standalone File Compilation
**What:** Verify each `.pike`/`.pmod` file compiles independently without module resolution dependencies
**When to use:** After any refactoring that touches file structure
**Why:** Catches syntax errors, missing imports, and circular dependencies early

```pike
// Source: Pike Manual - compile_file()
// Test each file compiles standalone
array(string) files = ({
    "pike-scripts/analyzer.pike",
    "pike-scripts/LSP.pmod/module.pmod",
    "pike-scripts/LSP.pmod/Compat.pmod",
    "pike-scripts/LSP.pmod/Cache.pmod",
    "pike-scripts/LSP.pmod/Parser.pike",
    "pike-scripts/LSP.pmod/Intelligence.pike",
    "pike-scripts/LSP.pmod/Analysis.pike"
});

foreach(files, string f) {
    mixed err = catch {
        program p = compile_file(f);
        write("PASS: %s compiles\n", f);
    };
    if (err) {
        write("FAIL: %s - %s\n", f, describe_error(err));
    }
}
```

### Pattern 2: Module Resolution Verification
**What:** Verify each module loads via `master()->resolv()` pattern used in production
**When to use:** After module structure changes, verify runtime loading works
**Why:** `compile_file()` doesn't catch module resolution issues

```pike
// Source: Existing module-load-tests.pike pattern
// Add module path (production pattern)
master()->add_module_path("pike-scripts");

// Test each module loads
array(string) modules = ({
    "LSP.module",
    "LSP.Compat",
    "LSP.Cache",
    "LSP.Parser",
    "LSP.Intelligence",
    "LSP.Analysis"
});

foreach(modules, string m) {
    mixed module = master()->resolv(m);
    if (!module) {
        error("Module %s failed to load\n", m);
    }
    write("PASS: %s loaded\n", m);
}
```

### Pattern 3: JSON-RPC Handler Smoke Test
**What:** Send real JSON-RPC requests to each handler, verify response structure
**When to use:** After handler changes, verify LSP protocol compliance
**Why:** Unit tests may pass but LSP responses could be malformed

```pike
// Source: Existing cross-version-tests.pike pattern
// Test each LSP method returns valid JSON-RPC
program ParserClass = master()->resolv("LSP.Parser")->Parser;
object Parser = ParserClass();

mapping result = Parser->parse_request(([
    "code": "int x = 5;",
    "filename": "test.pike",
    "line": 1
]));

// Verify response structure
if (!result->result || !result->result->symbols) {
    error("Invalid response structure\n");
}
```

### Pattern 4: Manual VS Code Smoke Test
**What:** Launch VS Code with extension, verify features work manually
**When to use:** Before merges, after significant changes
**Why:** Some bugs only manifest in real editor (timing, focus, selection)

```bash
# Source: Existing test-extension.sh
./scripts/test-extension.sh test/fixtures/test.pike

# Manual verification checklist:
# 1. Open Pike file → no crash
# 2. Type "Array." → completion shows stdlib methods
# 3. Hover over symbol → type info appears
# 4. Ctrl+click symbol → go-to-definition works
```

### Anti-Patterns to Avoid
- **Testing only unit tests**: Phase 5 did this - all 111 tests passed but E2E functionality unverified
- **Skipping manual smoke test**: Some integration issues only appear in real editor
- **Hardcoding stdlib paths**: Use `master()->pike_module_path` for portability
- **Testing only one Pike version**: Must test on 8.1116 (required) and latest (best-effort)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test runner scripts | Custom bash test runners | Existing `scripts/run-pike-tests.sh` | Already runs all 7 test suites in correct order |
| Module loading tests | New verification code | Existing `test/tests/module-load-tests.pike` | Already validates all 6 LSP modules load |
| Handler validation | New handler tests | Existing `test/tests/cross-version-tests.pike` | Already tests all 12 LSP methods |
| VS Code test harness | Custom extension testing | Existing `scripts/test-extension.sh` | Already launches VS Code in dev mode |
| Module path discovery | Hardcoded paths | `master()->pike_module_path` pattern | Portable across Pike installations |

**Key insight:** The smoke test for this phase should orchestrate existing tests, not rewrite them. The gap is a *single entry point* that runs all verification layers and reports status clearly.

## Common Pitfalls

### Pitfall 1: False Confidence from Unit Tests
**What goes wrong:** All unit tests pass but LSP features fail in editor
**Why it happens:** Unit tests test handler functions in isolation, not full request chain
**How to avoid:** Always run smoke test after unit tests; smoke test validates integration
**Warning signs:** "Unit tests all pass, but..." statements

### Pitfall 2: Module Resolution Failures
**What goes wrong:** `compile_file()` succeeds but `master()->resolv()` fails
**Why it happens:** File compiles standalone but imports break at runtime (wrong module path)
**How to avoid:** Test both `compile_file()` AND `master()->resolv()` for each module
**Warning signs:** "Works in my environment but fails in CI"

### Pitfall 3: Pike Version Incompatibility
**What goes wrong:** Code works on one Pike version but fails on another
**Why it happens:** Using version-specific APIs without Compat.pmod wrappers
**How to avoid:** Use `LSP.Compat` for all version-specific operations
**Warning signs:** Using `__REAL_VERSION__` directly instead of `Compat.pike_version()`

### Pitfall 4: JSON-RPC Response Format Errors
**What goes wrong:** Handler executes but response missing required fields
**Why it happens:** Handler returns data but doesn't wrap in JSON-RPC envelope
**How to avoid:** Verify all responses have `result` or `error` field
**Warning signs:** Client shows "Request failed" with no details

### Pitfall 5: Extension Bundle Out of Sync
**What goes wrong:** VS Code extension uses old pike-scripts
**Why it happens:** `bundle-server.sh` not run after Pike script changes
**How to avoid:** Run `pnpm run build` which calls bundle script
**Warning signs:** "Tests pass but extension doesn't"

## Code Examples

### Verified: Standalone File Compilation

```pike
// Source: Pike Manual chapter_30.html
// Usage: Compile file without loading into module system
program p = compile_file("pike-scripts/LSP.pmod/Parser.pike");

// Verify compilation succeeded
if (programp(p)) {
    write("PASS: Parser.pike compiles standalone\n");
} else {
    error("FAIL: Parser.pike compilation failed\n");
}
```

### Verified: Module Loading via Resolver

```pike
// Source: Existing module-load-tests.pike (lines 122-148)
// Usage: Test module loads via production pattern
master()->add_module_path("pike-scripts");

mixed module = master()->resolv("LSP.Parser");
if (!module || !module->Parser) {
    error("LSP.Parser module or Parser class not found\n");
}

// Verify class is instantiable
object parser = module->Parser();
write("PASS: LSP.Parser loads and instantiates\n");
```

### Verified: JSON-RPC Handler Testing

```pike
// Source: Existing cross-version-tests.pike (lines 175-190)
// Usage: Test handler returns valid JSON-RPC response
program ParserClass = master()->resolv("LSP.Parser")->Parser;
object Parser = ParserClass();

mapping result = Parser->parse_request(([
    "code": "int x = 5;",
    "filename": "test.pike",
    "line": 1
]));

// Verify JSON-RPC structure
if (!result->result) {
    error("Response missing 'result' field\n");
}
if (!arrayp(result->result->symbols)) {
    error("result.symbols is not an array\n");
}
write("PASS: parse_request returns valid JSON-RPC\n");
```

### Verified: Manual Extension Testing

```bash
# Source: Existing test-extension.sh (lines 115-144)
# Usage: Launch VS Code with extension for manual testing
$EDITOR --extensionDevelopmentPath="$EXTENSION_DIR" --new-window "$TARGET_PATH"

# Verification checklist (manual):
# 1. OUTPUT PANEL shows "Pike Language Server started"
# 2. Syntax highlighting works for keywords
# 3. Outline panel shows symbols
# 4. Completion: type "Array." → shows methods
# 5. Hover: hover over symbol → shows type
# 6. Go-to-definition: Ctrl+click → navigates
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic analyzer.pike (2594 lines) | Modular LSP.pmod structure | Phase 1-5 | Testable, maintainable |
| No module loading tests | `module-load-tests.pike` | Phase 5 | Catches import issues early |
| No cross-version tests | `cross-version-tests.pike` | Phase 5 | Validates all 12 handlers |
| No version documentation | README compatibility section | Phase 5 | Users know supported versions |

**Deprecated/outdated:**
- **Hardcoded module paths**: Use `master()->pike_module_path` discovery instead
- **Direct `__REAL_VERSION__` checks**: Use `LSP.Compat.pike_version()` instead
- **Manual test-only verification**: CI automatically runs pike-test job (Phase 5)

## Open Questions

1. **VS Code automated testing**: `@vscode/test-electron` exists but requires test infrastructure setup. Manual testing via `test-extension.sh` is sufficient for now, but automation would be better for CI.
   - **What we know:** `@vscode/test-electron` is the standard package, `test-extension.sh` works for manual testing
   - **What's unclear:** Full test setup complexity and maintenance cost
   - **Recommendation:** Start with manual smoke test, add automation if pain threshold reached

2. **Stdlib completion verification**: How to verify stdlib completion works without real Pike stdlib in test environment?
   - **What we know:** `e2e-foundation-tests.pike` uses dynamic stdlib discovery, `PIKE_STDLIB_PATH` override available
   - **What's unclear:** Minimum stdlib surface needed for meaningful completion test
   - **Recommendation:** Test with `Array.` as minimum viable stdlib completion check

3. **Pre-merge checklist enforcement**: How to enforce CONTRIBUTING.md checklist before merges?
   - **What we know:** Can't enforce via git hooks for external contributors
   - **What's unclear:** GitHub Actions validation approach
   - **Recommendation:** Document checklist, rely on PR review for enforcement

## Sources

### Primary (HIGH confidence)
- [Pike Manual - Writing Pike Modules](https://pike.lysator.liu.se/docs/man/chapter_30.html) - Module structure, `master()->resolv()`, `compile_file()`
- [VS Code Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide) - LSP testing patterns
- [VS Code Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension) - Extension testing framework

### Secondary (MEDIUM confidence)
- [Programmatic Language Features](https://code.visualstudio.com/api/language-extensions/programmatic-language-features) - Completion, hover, go-to-definition patterns
- [@vscode/test-electron](https://www.npmjs.com/package/@vscode/test-electron) - Automated extension testing
- [VS Code Smoke Test Wiki](https://github.com/microsoft/vscode/wiki/Smoke-Test) - Smoke test patterns

### Tertiary (LOW confidence)
- [A Complete Guide to VS Code Extension Testing](https://dev.to/sourishkrout/a-complete-guide-to-vs-code-extension-testing-268p) - General testing patterns (unverified)

### Internal Sources (HIGH confidence)
- `test/tests/module-load-tests.pike` - Module loading test patterns
- `test/tests/cross-version-tests.pike` - Handler validation patterns
- `scripts/test-extension.sh` - Manual extension testing
- `.planning/phases/05-verification/05-VERIFICATION.md` - Phase 5 verification results

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses existing infrastructure, no new tools needed
- Architecture: HIGH - Based on verified Phase 5 patterns and official Pike/VS Code docs
- Pitfalls: MEDIUM - Some gaps in automated testing require manual verification
- E2E testing: MEDIUM - Manual approach sufficient but not automated

**Research date:** 2026-01-20
**Valid until:** 60 days (stable domain, Pike/VS Code APIs evolve slowly)
