# VSCode Pike Test Protocol

This file defines the protocol for adding and maintaining tests under `packages/vscode-pike/src/test`.

## Core Rules

- Use `bun` tooling only (`bun run ...`, `bun test`, `bunx ...`).
- Prefer deterministic assertions over "no crash" assertions.
- Prefer readiness polling (`waitFor`) over fixed sleeps (`setTimeout`).
- Reuse shared helpers in `packages/vscode-pike/src/test/integration/helpers.ts`.
- Keep tests focused: one behavior per test, clear failure message, minimal setup.

## Test Types and Scope

- `integration/*.test.ts`: end-to-end behavior through VSCode commands and the extension host.
- `unit/*` and focused tests: isolate logic where possible; avoid unnecessary extension-host cost.
- Add or update fixture files in `packages/vscode-pike/test-workspace` when behavior requires stable anchors.

## Assertion Quality Standard

When adding assertions, follow this order:

1. Assert payload shape (array/object expected fields).
2. Assert semantic result (known symbol, method, diagnostic severity, target line).
3. Assert regression signal (counts, known labels, expected navigation targets).

Examples of good assertions:

- Completion includes known methods (`sum`, `map`, `filter`).
- Definition resolves to declaration line content (`int test_function`, `class TestClass`).
- Diagnostics include at least one `Error` severity for invalid fixture content.

Avoid weak assertions like:

- `assert.ok(result !== undefined)` as the only check.
- Silent early returns that skip core verification.

## Timing and Flake Control

- Do not add new fixed sleeps unless there is no viable readiness signal.
- Use `waitFor` with explicit description and bounded timeout.
- Use `withTimeout` for commands that may hang (e.g., selection range provider).
- If a provider can legitimately return empty results, assert valid shape first, then conditionally assert semantic expectations when non-empty.

## Shared Helpers (Use These First)

From `integration/helpers.ts`:

- `waitFor(...)`
- `withTimeout(...)`
- `positionForRegex(...)`
- `normalizeLocations(...)`
- `labelOf(...)`
- `hoverText(...)`
- `flattenSymbols(...)`
- `findSymbolByName(...)`

Prefer helper usage over ad-hoc duplication.

## Fixture Strategy

- Keep anchors stable and explicit in fixture files.
- Use regex-position helpers against known fixture markers.
- For temporary files used by tests, always clean up in `finally` blocks.
- If a test relies on include/import behavior, validate resolved declaration content, not only URI assumptions.

## Authoring Checklist

Before opening a PR for test changes:

1. `bun run build:test` in `packages/vscode-pike`.
2. Run focused headless suites with `scripts/test-headless.sh --grep "..."`.
3. Ensure no fixture files are unintentionally modified/deleted.
4. Ensure new tests fail for the right reason if behavior regresses.

## Minimum Verification Commands

Run from `packages/vscode-pike`:

```bash
bun run build:test
bash scripts/test-headless.sh --grep "(Core Regression E2E Tests|E2E Workflow Tests|Stdlib E2E Tests|LSP Feature E2E Tests|Smart Completion E2E Tests|Include/Import/Inherit Navigation E2E Tests)"
```

Adjust `--grep` scope for the specific area changed, but keep at least one cross-feature regression suite in the run.

## Anti-Patterns

- Copy-pasted location normalization blocks instead of `normalizeLocations`.
- Repeated label extraction logic instead of `labelOf`.
- Tests that only assert non-throw behavior without semantic checks.
- Long setup sleeps that mask initialization races.

## Update Policy

When a flaky pattern or weak assertion is found:

1. Fix it in the current test.
2. Extract to helper if duplicated.
3. Add or tighten a regression assertion so the same issue is caught next time.
