# Phase 2: Safety Net - Context

## Goal

Catch regressions on push/PR without slowing local development. No pre-commit hooks - allow broken intermediate commits on feature branches. Enforce tests on **push/PR**, not local commits.

## Philosophy

**Green Main, Not Green Commit:** Allow broken intermediate commits on feature branches. Enforce tests on **push/PR**, not local commits. Maintains defense in depth without strangling minute-by-minute workflow.

## Requirements Mapped

- SAF-01: Create `.husky/pre-push` hook that blocks broken pushes
- SAF-02: Pre-push validates TypeScript builds (`pnpm -r build`)
- SAF-03: Pre-push validates Pike compiles (`pike -e 'compile_file("pike-scripts/analyzer.pike")'`)
- SAF-04: Pre-push runs smoke tests (`pnpm --filter pike-lsp-server test:smoke`)
- SAF-05: Create smoke test suite with bridge lifecycle tests
- SAF-06: Smoke test validates parse request returns array
- SAF-07: Smoke test validates introspect request returns data
- SAF-08: Smoke test validates invalid Pike returns error (not crash)
- SAF-09: Create CI pipeline (`.github/workflows/ci.yml`)
- SAF-10: CI runs on push to main and pull requests
- SAF-11: CI installs Pike, runs build, tests, and VSCode E2E

## Success Criteria

1. `.husky/pre-push` hook exists and runs on git push
2. Pre-push validates: TypeScript builds, Pike compiles, smoke tests pass
3. Smoke test suite verifies bridge lifecycle (start/stop without crash)
4. Smoke tests cover: parse returns array, introspect returns data, invalid Pike returns error
5. CI pipeline runs on push to main and PRs
6. CI includes VSCode E2E tests with xvfb

## Deliverables

### Pre-push Hook

**`.husky/pre-push`:**
```bash
#!/bin/sh
# Runs on push, not every commit

# TypeScript compiles
pnpm -r build || exit 1

# Pike compiles
pike -e 'compile_file("pike-scripts/analyzer.pike");' || exit 1

# Fast smoke test
pnpm --filter pike-lsp-server test:smoke || exit 1
```

### Smoke Tests

**`packages/pike-lsp-server/src/tests/smoke.test.ts`:**
```typescript
describe('LSP Smoke', () => {
  let bridge: PikeBridge;

  beforeAll(async () => {
    bridge = new PikeBridge();
    await bridge.start();
  });

  afterAll(() => bridge.stop());

  it('responds to parse request', async () => {
    const result = await bridge.parse('int x;', 'test.pike');
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('responds to introspect request', async () => {
    const result = await bridge.introspect('int x = 1;', 'test.pike');
    expect(result).toBeDefined();
  });

  it('handles invalid Pike gracefully', async () => {
    const result = await bridge.parse('int x = ;', 'test.pike');
    expect(result).toBeDefined();
  });
});
```

### CI Pipeline

**`.github/workflows/ci.yml`:**
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      - name: Install Pike
        run: |
          sudo apt-get update
          sudo apt-get install -y pike8.0
      - name: Install dependencies
        run: pnpm install
      - name: Build
        run: pnpm -r build
      - name: Test Pike compilation
        run: pike -e 'compile_file("pike-scripts/analyzer.pike");'
      - name: Run tests
        run: pnpm -r test

  vscode-e2e:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      - name: Install system dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y xvfb pike8.0
      - name: Install dependencies
        run: pnpm install
      - name: Build
        run: pnpm -r build
      - name: Run VSCode E2E tests
        run: xvfb-run pnpm --filter vscode-pike test:e2e
```

## Dependencies

- Phase 1: Errors and logging must exist for meaningful test output

## Notes

- No pre-commit hook by design
- Local commits can be broken - we fix on push
- CI based on existing extension build CI (Rocky Linux, Pike 8.1116)
