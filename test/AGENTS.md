# Test Protocol

## Tooling

- `bun test` for unit tests (pike-lsp-server).
- `bun run build:test && bash scripts/test-headless.sh` for E2E (vscode-pike).
- Never use `npm`, `npx`, `yarn`, or `pnpm`.

## Two Layers — Pick the Right One

| Layer | Where                                        | When to use                                 |
| ----- | -------------------------------------------- | ------------------------------------------- |
| Unit  | `packages/pike-lsp-server/src/tests/`        | Testing a function directly                 |
| E2E   | `packages/vscode-pike/src/test/integration/` | Testing the full VS Code → LSP → Pike chain |

Do not write a unit test when the bug lives in the wiring.
Do not write an E2E test for something a unit test can cover.

## Assertion Rules

**Always assert a specific value, not just shape.**

```typescript
// WRONG — passes even when the feature is broken
assert.ok(Array.isArray(edits));
assert.ok(edits.length > 0);
assert.ok(result !== undefined, 'may be empty');

// CORRECT
const edit = edits.find(e => e.range.start.line === targetLine);
assert.ok(edit, 'Should have edit for "int class_x"');
assert.strictEqual(
  edit!.newText,
  '        ',
  '8-space indent required — 2 levels deep inside class'
);
```

Order of assertions for every test:

1. Not null/undefined.
2. Shape is valid.
3. **At least one specific value matches.** Do not stop at step 2.

## E2E Rules

**Wait for LSP readiness — never assume the server is ready.**

```typescript
await waitFor(
  'symbols from LSP',
  () => vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri),
  (s: any) => Array.isArray(s) && s.length > 0,
  20000
);
```

**Show documents, do not just open them.**
`openTextDocument` alone does not send `didOpen` to the LSP server.

```typescript
const doc = await vscode.workspace.openTextDocument(uri);
await vscode.window.showTextDocument(doc, { preview: false });
await new Promise(r => setTimeout(r, 500)); // allow LSP sync
```

**Locate lines by content pattern, not by line number.**
Line numbers break whenever the fixture changes.

```typescript
// WRONG
new vscode.Position(164, 0);

// CORRECT
positionForRegex(doc, /void class_method\(\)/).line;
```

**Do not apply edits to fixture files inside tests.**
Applied edits mutate the document and break subsequent tests in the same run.
Check the returned `TextEdit[]` values directly.

**Use `waitFor`, not `setTimeout`, for async providers.**

## Fixture Rules

- One fixture per concern. Do not add mis-formatted code to `test.pike` — other tests depend on it being valid.
- Every identifier referenced by a test must be unique in the fixture so `positionForRegex` cannot return the wrong line.
- Use K&R style in mis-formatted fixtures. Allman-style `{` on its own line produces ambiguous indent expectations.
- Document line numbers as comments for humans, but use `positionForRegex` in tests.

## Regression Tests

When fixing a bug, state what value the broken code produced:

```typescript
// Before fix: indentStack started at [0], ignored class context → '    ' (4 spaces)
// After fix: full-document formatting filtered to range → '        ' (8 spaces)
assert.strictEqual(edit!.newText, '        ', 'Must be 8 spaces — not 4 (regression)');
```

## Anti-Patterns

- `assert.ok(Array.isArray(x))` as the only assertion.
- `'(may be empty)'` in an assertion message — if empty is valid, say so in a comment; if not, assert it.
- Running format-document on an already-formatted file and asserting the response is an array.
- `setTimeout` for LSP readiness — use `waitFor`.
- Hard-coded line numbers.
- `openTextDocument` without `showTextDocument`.
- Applying edits to shared fixtures inside a test.

## Pre-PR Checklist

```bash
bun run lint && bun run typecheck && bun run build

# E2E (run from packages/vscode-pike)
bun run build:test
bash scripts/test-headless.sh --grep "(Core Regression E2E Tests|LSP Feature E2E Tests)"
```

PR body must include `closes #N`, `fixes #N`, or `resolves #N`.
