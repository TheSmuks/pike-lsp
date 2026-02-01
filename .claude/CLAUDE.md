# Pike LSP Project Guidelines

## MANDATORY: Use Pike's Built-in Tooling First

**Pike stdlib is the highest priority.** Before implementing any parsing, analysis, or utility code:

1. **Search Pike's source code first** at `/usr/local/pike/8.0.1116/lib/`
2. Check modules like `Parser.Pike`, `Tools.AutoDoc`, `Stdio`, `String`, etc.
3. Only implement from scratch if Pike has no existing solution

**Do NOT:**
- Use regex to parse Pike code when `Parser.Pike.split()` / `Parser.Pike.tokenize()` exist
- Reinvent string utilities when `String.*` or `Stdio.*` have them
- Guess at Pike behavior - read the actual Pike source

**Examples of Pike stdlib to use:**
- `Parser.Pike.split(code)` + `Parser.Pike.tokenize()` for tokenization
- `Tools.AutoDoc.DocParser` for parsing `//!` documentation
- `String.trim_all_whites()` for whitespace handling (not `String.trim()` - unavailable in 8.0)
- `master()->resolv()` for module resolution

When in doubt, explore Pike's lib directory before writing new code.

## MANDATORY: Release on Push

When pushing to main, **create a release tag** if the version has changed:

```bash
# 1. Update version in package.json files (root + packages/vscode-pike)
# 2. Commit version bump
# 3. Tag and push
git tag v$(node -p "require('./packages/vscode-pike/package.json').version")
git push && git push --tags
```

This triggers the GitHub Actions release workflow (`.github/workflows/release.yml`) which:
- Builds and tests the project
- Creates a GitHub Release with VSIX artifact
- The pre-push hook validates everything first

**Do NOT push without tagging** if you've made releasable changes.

## MANDATORY: Headless Testing by Default

**All local tests MUST run headless by default.** The test scripts are configured to automatically use a virtual display.

```bash
# All test commands run headless by default
cd packages/vscode-pike && bun run test          # All E2E tests
cd packages/vscode-pike && bun run test:features # LSP feature tests only
cd packages/vscode-pike && bun run test:e2e      # Same as test
```

The test script auto-selects: Xvfb (Linux) → Weston fallback → native (macOS/Windows).

**For interactive debugging only**, use your display:
```bash
# Option 1: Use headless script with your display
USE_CURRENT_DISPLAY=1 bun run test:features

# Option 2: Run with GUI (opens VSCode window)
bun run test:gui
```

**Never run `vscode-test` directly** - it will pop up a VSCode window. Always use the headless wrapper scripts.

## MANDATORY: E2E Verification Before Commits

**DO NOT commit changes without verifying LSP functionality works end-to-end.**

### Quick Validation (Run This)

```bash
# Single command - validates everything headlessly
cd packages/vscode-pike && bun run test:features
```

Tests verify: document symbols, hover, go-to-definition, completion all return data.

**Pre-push hook runs these automatically**, but run manually for faster feedback.

### Additional Checks

1. **Pike compiles**: `pike -e 'compile_file("pike-scripts/analyzer.pike");'`

2. **Bridge works**: `cd packages/pike-bridge && bun run test`

3. **Quick smoke test**:
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"introspect","params":{"code":"int x;","filename":"test.pike"}}' \
     | timeout 5 pike pike-scripts/analyzer.pike 2>&1
   ```

### Debugging E2E Failures

| Symptom | Cause | Debug |
|---------|-------|-------|
| "symbols (not null)" fails | Document symbols not returned | Check Pike compiles, Bridge works, Outline view |
| Test times out | LSP server not starting | Check extension activates, increase timeout |
| "hover info" fails | Hover handler returning null | Check Pike analysis returns type info |
| "go to definition" fails | Definition handler broken | Check symbol is indexed first |

## MANDATORY: Test-Driven Development

**All new features and bug fixes MUST follow TDD.** No implementation code without a failing test first.

### Workflow

1. **RED** - Write a failing test that describes the expected behavior
2. **GREEN** - Write the minimal implementation to make the test pass
3. **REFACTOR** - Clean up while keeping tests green

### Rules

- **Never skip RED.** Write the test, run it, confirm it fails before writing implementation code.
- **Never write implementation first** then backfill tests. The test must exist and fail before the fix.
- **One behavior per test.** Each test should verify a single, well-named behavior.
- **Run the relevant test suite after each step** to confirm red/green transitions.
- **Target 80%+ coverage** on changed files.

### Test Commands by Package

```bash
# pike-lsp-server (unit tests - most features live here)
cd packages/pike-lsp-server && bun run test

# pike-bridge (IPC layer)
cd packages/pike-bridge && bun run test

# vscode-pike (E2E / integration - runs headless)
cd packages/vscode-pike && bun run test:features
```

### Where to Put Tests

| Package | Test Location | Convention |
|---------|--------------|------------|
| pike-lsp-server | `src/tests/<category>/` | `<feature>.test.ts` |
| pike-lsp-server | colocated with source | `<module>.test.ts` next to `<module>.ts` |
| pike-bridge | `src/` | `<module>.test.ts` |
| vscode-pike | `src/test/integration/` | `<feature>.test.ts` |

### Bug Fix TDD

When fixing a bug:
1. Write a test that reproduces the bug (fails with current code)
2. Run it - confirm it fails for the right reason
3. Fix the bug with minimal changes
4. Run it - confirm it passes
5. Run the full test suite to check for regressions

### What Does NOT Require TDD

- Documentation changes
- Configuration/build changes
- Pure refactoring with existing test coverage (but run tests after)

## Architecture Overview

```
VSCode Extension (vscode-pike)
    |
    v
TypeScript LSP Server (pike-lsp-server)
    |
    v
PikeBridge (pike-bridge) -- JSON-RPC over stdin/stdout
    |
    v
Pike Analyzer (pike-scripts/analyzer.pike)
    |
    v
LSP Modules (LSP.pmod/*)
```

## Key Files

- `pike-scripts/analyzer.pike` - Pike subprocess entry point
- `pike-scripts/LSP.pmod/` - Pike LSP modules
- `packages/pike-bridge/` - TypeScript <-> Pike IPC
- `packages/pike-lsp-server/` - LSP protocol implementation
- `packages/vscode-pike/` - VSCode extension

<claude-mem-context>
# Recent Activity

<!-- This section is auto-generated by claude-mem. Edit content outside the tags. -->

### Jan 20, 2026

| ID | Time | T | Title | Read |
|----|------|---|-------|------|
| #4016 | 10:40 AM | 🟣 | GSD uncommitted planning mode enabled for pike-lsp project | ~204 |
</claude-mem-context>