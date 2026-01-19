---
description: Run automated tests after each phase before user review
---

# Pike LSP Test Workflow

This workflow MUST be run after completing any phase before presenting work to the user.

## Steps

1. Run the automated test suite:
```bash
./scripts/run-tests.sh
```

If the Pike stdlib sources live elsewhere, set one of:
```bash
PIKE_SOURCE_ROOT=/path/to/Pike ./scripts/run-tests.sh
# or
PIKE_STDLIB=/path/to/Pike/lib/modules PIKE_TOOLS=/path/to/Pike/lib/include ./scripts/run-tests.sh
```

2. If tests fail, fix the issues before proceeding.

3. Only after ALL tests pass, notify the user for review.

## What the tests verify:

### Pike Bridge Tests
- Bridge starts and stops correctly
- Parse extracts symbols with correct kinds (variable, method, class)
- Compile detects syntax errors
- Tokenize returns tokens with text

### LSP Protocol Compliance
- DocumentSymbol ranges are valid (selectionRange contained in range)
- Symbols with long names don't cause range issues

### Pike Type Detection
- Symbol kinds are correctly identified
- Type information is extracted (int, string, array, mapping)

## Extension Testing

After automated tests pass, test the extension manually:
```bash
./scripts/test-extension.sh
```

This opens VSCode/VSCodium with the extension loaded.

## Adding New Tests

Add new tests to:
- `/pike-lsp/packages/pike-lsp-server/src/tests/lsp-tests.ts`

Run with:
```bash
node --test packages/pike-lsp-server/dist/tests/lsp-tests.js
```
