# Test Protocol

This file defines the testing protocol for this repository under `test/`.

## Tooling

- Use `bun` only (`bun run ...`, `bun test`, `bunx ...`).
- Never use `npm`, `npx`, `yarn`, or `pnpm` in commands, docs, or issue text.

## Test Design Rules

- Prefer deterministic assertions over weak "no crash" checks.
- Prefer semantic assertions (known symbols, expected diagnostics, expected navigation target).
- Keep each test focused on one behavior with clear failure messages.
- Pair behavior changes with regression tests whenever practical.

## Flake Prevention

- Do not add fixed sleeps when a readiness signal exists.
- Use polling/readiness helpers instead of `setTimeout` sleeps.
- For providers that may return empty results, first assert payload shape, then assert semantic expectations when non-empty.
- Use bounded timeout wrappers for providers that can hang.

## Fixture Strategy

- Use stable fixture anchors and explicit markers.
- Prefer regex/cursor helper utilities over duplicated index math.
- Clean up temporary files in `finally` blocks.
- Validate declaration content (line-level semantic target), not only URI path assumptions.

## Assertion Quality Ladder

For every test, assert in this order:

1. Response shape is valid.
2. Semantic expectation is met.
3. Regression signal is strong (counts, expected labels/targets, severity).

Avoid single-check assertions like `assert.ok(result !== undefined)` as sole verification.

## Verification Before PR

Minimum checks for test changes:

```bash
bun run lint
bun run typecheck
bun run build
```

For VSCode extension integration/e2e work, also run:

```bash
cd packages/vscode-pike
bun run build:test
bash scripts/test-headless.sh --grep "(Core Regression E2E Tests|E2E Workflow Tests|Stdlib E2E Tests|LSP Feature E2E Tests|Smart Completion E2E Tests|Include/Import/Inherit Navigation E2E Tests)"
```

Adjust grep scope to changed areas, but always include at least one cross-feature regression suite.

## PR Linking Requirement

- PR title/body must include one closing keyword for an issue:
  - `closes #N`
  - `fixes #N`
  - `resolves #N`
- Lower/upper case is normalized in CI, but use lowercase by convention.

## Anti-Patterns

- Fixed sleeps used as initialization strategy.
- Copy-pasted provider normalization or label extraction helpers.
- Tests that only verify non-throw behavior.
- Broad refactors mixed into focused test-hardening tasks.
