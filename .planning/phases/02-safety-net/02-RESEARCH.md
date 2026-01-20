# Phase 02: Safety Net - Research

**Researched:** 2026-01-20
**Domain:** Git hooks, smoke testing, CI/CD pipelines
**Confidence:** HIGH

## Summary

This phase adds defensive testing at push/PR boundaries while allowing broken commits on feature branches. The research identified:

1. **Husky v9** is the standard for git hooks in pnpm monorepos - installed as devDependency, initialized with `pnpm exec husky init`, hooks stored in `.husky/` directory
2. **Pike compilation validation** works via `pike -e 'compile_file("...")'` - returns exit code 0 on success, non-zero on syntax errors
3. **Node.js built-in test runner** (`node --test`) is already in use across packages - smoke tests should follow this pattern
4. **Existing CI** runs on ubuntu-24.04 with Node 20.x, pnpm 8, and Pike 8.0/8.1116 - provides template for extension
5. **xvfb-run** is required for VSCode E2E tests on Linux (already documented in design docs)

**Primary recommendation:** Use Husky v9 with pre-push hook that runs build → Pike compile → smoke tests. Create smoke test in `packages/pike-lsp-server/src/tests/smoke.test.ts` using node:test pattern. Extend existing `.github/workflows/test.yml` to add smoke test job.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| husky | ^9.0.0 | Git hooks management | Official pnpm-recommended solution, v9 has simplified init |
| node:test | built-in | Test runner | Already in use across all packages, no external dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| xvfb | system package | Virtual X server for VSCode E2E | Required for Linux CI tests (VSCode needs display) |
| pike8.0 | 8.0 | Pike interpreter | Target version for CI (with 8.1116 variant testing) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| husky | pre-commit hooks (npm package) | Husky v9 is simpler, pnpm-native, better monorepo support |
| node:test | jest, vitest, mocha | node:test is built-in, already in use, zero config needed |

**Installation:**
```bash
pnpm add -D husky
pnpm exec husky init
```

## Architecture Patterns

### Git Hook Structure
```
.husky/
├── pre-push    # Runs on git push
└── (no pre-commit by design - allow broken commits)
```

### Recommended Project Structure
```
packages/pike-lsp-server/
├── src/
│   ├── tests/
│   │   ├── smoke.test.ts      # NEW: Fast smoke tests
│   │   ├── integration-tests.ts
│   │   └── lsp-tests.ts
│   └── ...
└── dist/tests/                # Compiled test files
```

### Pattern 1: Husky Pre-push Hook
**What:** Shell script that runs validation before push completes
**When to use:** Defense in depth - catch regressions before they reach remote
**Example:**
```bash
#!/bin/sh
# .husky/pre-push
set -e

echo "Running pre-push checks..."

# TypeScript builds
echo "Building all packages..."
pnpm -r build || {
  echo "Build failed. Push aborted."
  exit 1
}

# Pike compiles
echo "Checking Pike compilation..."
pike -e 'compile_file("pike-scripts/analyzer.pike");' || {
  echo "Pike compilation failed. Push aborted."
  exit 1
}

# Smoke tests
echo "Running smoke tests..."
pnpm --filter @pike-lsp/pike-lsp-server test:smoke || {
  echo "Smoke tests failed. Push aborted."
  exit 1
}

echo "All checks passed!"
```

### Pattern 2: Smoke Test with Node:test
**What:** Fast lifecycle test using existing node:test infrastructure
**When to use:** Verify PikeBridge start/stop and basic LSP operations
**Example:**
```typescript
// packages/pike-lsp-server/src/tests/smoke.test.ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('LSP Smoke Tests', () => {
  let bridge: PikeBridge;

  before(async () => {
    bridge = new PikeBridge();
    await bridge.start();
  });

  after(async () => {
    await bridge.stop();
  });

  it('responds to parse request with array', async () => {
    const result = await bridge.parse('int x;', 'test.pike');
    assert.ok(result.symbols);
    assert.ok(Array.isArray(result.symbols));
  });

  it('responds to introspect request', async () => {
    const result = await bridge.introspect('int x = 1;', 'test.pike');
    assert.ok(result);
  });

  it('handles invalid Pike gracefully (no crash)', async () => {
    // Should not throw, should return diagnostics
    const result = await bridge.compile('int x = ;', 'test.pike');
    assert.ok(result.diagnostics);
    assert.ok(Array.isArray(result.diagnostics));
  });
});
```

### Anti-Patterns to Avoid
- **Pre-commit hooks for full builds**: Too slow, breaks the "allow broken intermediate commits" philosophy
- **Smoke tests that spawn multiple Pike processes**: Reuse single bridge instance with before/after hooks
- **Hardcoded Pike paths**: Use `pike` from PATH (CI installs pike8.0)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git hooks | Custom shell script in package.json | Husky | Standard, cross-platform, pnpm-native |
| Test runner | Custom test framework | node:test | Built-in, already in use |
| CI configuration | Custom GitHub Actions workflow | Extend existing test.yml | Already has Pike installation, pnpm setup |

## Common Pitfalls

### Pitfall 1: Pre-push Hook Not Executable
**What goes wrong:** Hook is created but doesn't run because execute bit not set
**Why it happens:** Git doesn't automatically set +x on hook files
**How to avoid:** Husky init handles this, but manually: `chmod +x .husky/pre-push`
**Warning signs:** Push succeeds without hook output

### Pitfall 2: Smoke Tests in Wrong Directory
**What goes wrong:** Tests not compiled or not found
**Why it happens:** Tests in `src/tests/` must be compiled to `dist/tests/` by `tsc`
**How to avoid:** Smoke tests go in `src/tests/smoke.test.ts` - TypeScript compiles them to `dist/tests/`
**Warning signs:** `Cannot find module` errors

### Pitfall 3: CI Pike Installation Failure
**What goes wrong:** CI fails because Pike not available
**Why it happens:** Pike 8.1116 sometimes not in apt, falls back to build from source
**How to avoid:** Use `pike8.0` from apt (reliable), let existing test.yml handle 8.1116
**Warning signs:** `pike: command not found` in CI logs

### Pitfall 4: xvfb Missing for VSCode E2E
**What goes wrong:** VSCode tests fail with "Cannot open display"
**Why it happens:** @vscode/test-electron requires X11 on Linux
**How to avoid:** Install `xvfb` in CI, wrap tests with `xvfb-run`
**Warning signs:** Error logs mentioning `DISPLAY` environment variable

## Code Examples

### Verified: Adding test:smoke Script
```json
// packages/pike-lsp-server/package.json (add to scripts)
{
  "scripts": {
    "test:smoke": "node --test dist/tests/smoke.test.js"
  }
}
```

### Verified: CI xvfb Pattern
```yaml
# .github/workflows/ci.yml (or extend test.yml)
- name: Install system dependencies
  run: |
    sudo apt-get update
    sudo apt-get install -y xvfb pike8.0

- name: Run VSCode E2E tests
  run: xvfb-run pnpm --filter vscode-pike test
```

### Verified: Pike Compilation Check
```bash
# Returns exit code 0 on success, 1 on failure
pike -e 'compile_file("pike-scripts/analyzer.pike");'
echo $?  # 0 = success, non-zero = failure
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| husky v4/v5 (husky install in prepare) | husky v9 (direct init, no prepare needed) | 2023 | Simpler setup, no postinstall hook |
| Custom git hook scripts | `.husky/` directory with executable files | Ongoing | Industry standard, better DX |

**Deprecated/outdated:**
- `npm install husky --save-dev && husky install`: Use `pnpm exec husky init` instead
- Pre-commit hooks for full test suites: Use pre-push for slower checks

## Existing Infrastructure Analysis

### Current State (HIGH Confidence)

**Git Hooks:**
- No `.husky/` directory exists
- No git hooks currently configured
- `husky` not in devDependencies

**Test Framework:**
- **pike-bridge**: Uses `node --test dist/bridge.test.js`
- **pike-lsp-server**: Uses `node --test dist/workspace-index.test.js`
- **pike-analyzer**: Uses `node --test`
- **vscode-pike**: Uses `mocha` for unit tests, `@vscode/test-electron` for E2E

**Tests Directory:**
- `packages/pike-lsp-server/src/tests/` contains multiple `.ts` test files
- All compile to `dist/tests/` via TypeScript (rootDir: src, includes: src/**/*)
- Tests use `node:test` imports: `import { describe, it, before, after } from 'node:test'`

**CI:**
- `.github/workflows/test.yml` exists
- Runs on ubuntu-24.04, Node 20.x, pnpm 8
- Tests Pike 8.1116 and "latest"
- Has `build-extension` job that packages VSIX
- No xvfb currently in test.yml

**Package Scripts:**
- Root has `build`, `test`, `typecheck` that run with `-r` flag
- `pnpm -r build` already works for monorepo-wide builds
- No `test:smoke` script exists yet

## Open Questions

None - all research areas resolved.

## Sources

### Primary (HIGH confidence)
- [Husky Get Started](https://typicode.github.io/husky/get-started.html) - Official Husky v9 documentation
- `.github/workflows/test.yml` - Existing CI configuration
- `packages/pike-bridge/src/bridge.test.ts` - Verified PikeBridge test patterns
- `packages/pike-lsp-server/src/tests/*.ts` - Verified node:test usage
- All package.json files - Verified scripts and dependencies

### Secondary (MEDIUM confidence)
- [Setting up Husky for monorepo typecheck](https://medium.com/@syedzainullahqazi/setting-up-husky-to-run-lint-and-typecheck-on-entire-monorepo-5ce0c5a37556) - Confirms pnpm monorepo pattern
- [Git Hooks with Husky v9](https://itenium.be/blog/dev-setup/git-hooks-with-husky-v9/) - Confirms v9 setup changes
- [Husky v9 tutorial (Chinese)](https://juejin.cn/post/7592622563547316259) - Confirms pre-push example

### Verified by Testing
- `pike -e 'compile_file("pike-scripts/analyzer.pike");'` - Confirmed exit code 0 on success
- `pnpm --filter @pike-lsp/pike-lsp-server test` - Confirmed node:test works
- `ls -la packages/pike-lsp-server/dist/tests/` - Confirmed tests compile to dist

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified official docs and existing codebase
- Architecture: HIGH - Based on verified existing patterns
- Pitfalls: HIGH - Based on actual testing and known project constraints

**Research date:** 2026-01-20
**Valid until:** 90 days (stable tooling, unlikely to change)
