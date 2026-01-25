# AutoDoc Snippet Template Fix

## Date
2026-01-25

## Problem Statement

When typing `//!!` to trigger AutoDoc template generation, the completion snippet was not appearing in VSCode.

## Root Cause Analysis

The issue was related to LSP cursor position behavior. When a trigger character is typed:

1. **Expected behavior**: Cursor position is sent AFTER the newly typed character
2. **Actual behavior in some cases**: Cursor position is sent AT the trigger character position

When typing the second `!` in `//!!`:
- Original code expected position 4 (after `//!!`)
- VSCode sometimes sends position 3 (at the second `!`)

The check `lineTextBeforeCursor.trim().endsWith('//!!')` failed when the cursor was at position 3 because the text before cursor was only `//!`.

## Solution Implemented

### autodoc.ts Changes

Added dual-mode trigger detection:

```typescript
// Check if we are triggered by //!!
// Handle two cases:
// 1. Cursor is after //!! (lineTextBeforeCursor ends with //!!)
// 2. Cursor is at the second ! (lineTextBeforeCursor ends with //! and next char is !)
const trimmed = lineTextBeforeCursor.trim();
const endsWithBangBang = trimmed.endsWith('//!!');
const endsWithBangAndNextIsBang = trimmed.endsWith('//!') &&
                                  text[offset] === '!';

if (!endsWithBangBang && !endsWithBangAndNextIsBang) {
    return [];
}
```

Also improved replace range calculation:

```typescript
// Calculate end position:
// - If cursor is after //!!, use cursor position
// - If cursor is on the second !, extend to include it
let endPosition = position;
if (endsWithBangAndNextIsBang) {
    // Cursor is at position 3, need to extend to position 4 to include the second !
    endPosition = { line: position.line, character: position.character + 1 };
}

const replaceRange = {
    start: { line: position.line, character: bangBangIndex },
    end: endPosition
};
```

### Test Coverage

Added new test case:

```typescript
it('triggers when cursor is before the second ! (position 3)', () => {
    // Cursor at position 3 (right after //!, before the second !)
    const position = Position.create(0, 3);

    const items = getAutoDocCompletion(doc, position);

    // Should still trigger because the next character is !
    assert.equal(items.length, 1);
    // ... verify textEdit range includes full //!!
});
```

## Files Modified

1. `packages/pike-lsp-server/src/features/editing/autodoc.ts`
   - Added `endsWithBangAndNextIsBang` check
   - Improved `replaceRange` calculation to handle cursor-at-trigger case
   - Added `endPosition` logic to extend range when needed

2. `packages/pike-lsp-server/src/tests/autodoc.test.ts`
   - Added test for cursor at position 3 (before second `!`)
   - Verified `textEdit.range` includes full `//!!`

## Verification

- All 5 autodoc tests pass (including new test)
- All 217 LSP server tests pass
- Tested both cursor positions:
  - Position 3 (at the second `!`) - triggers correctly
  - Position 4 (after `//!!`) - triggers correctly

## Notes

- LSP clients may vary in how they report cursor position for trigger characters
- Robust completion handlers should handle both positions
- The fix checks `text[offset] === '!'` to "look ahead" one character when needed
