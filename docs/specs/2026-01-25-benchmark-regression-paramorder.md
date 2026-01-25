# Spec: Fix Benchmark Regression from paramOrder Array

**Date**: 2026-01-25
**Status**: Draft
**Severity**: Performance Regression (55-70% slower on affected benchmarks)

## Problem Statement

CI benchmarks report a regression on two stdlib resolution operations:

| Benchmark | Current | Previous | Regression |
|-----------|---------|----------|------------|
| `resolveStdlib("String.SplitIterator") - nested` | 0.0857 ms | 0.0553 ms | **1.55x slower** |
| `Hover: resolveModule("Stdio.File")` | 0.0915 ms | 0.0537 ms | **1.70x slower** |

## Root Cause Analysis

### Commit Introducing Regression

**Commit**: `702ea1a fix(hover): preserve parameter order in documentation`

**Files Changed**:
- `pike-scripts/LSP.pmod/Parser.pike` (+2 lines)
- `packages/pike-lsp-server/src/features/utils/hover-builder.ts` (+7 lines)

### The Problem

The change added a `paramOrder` array to track parameter order in autodoc parsing:

```pike
// In simple_parse_autodoc():
mapping result = ([
    "text": "",
    "params": ([]),
    "paramOrder": ({}),  // NEW: Track param order
    ...
]);

// For each @param tag:
result->paramOrder += ({ current_param });  // NEW: Append to array
```

**Why this causes regression**:

1. **Pike array append is O(n)**: In Pike, `array += ({ element })` creates a **new array** each time. This is O(n) per append operation.

2. **O(n²) for n parameters**: For a function with 10 parameters, this becomes:
   - 1st append: copy 0 elements + add 1 = 1 operation
   - 2nd append: copy 1 element + add 1 = 2 operations
   - ...
   - 10th append: copy 9 elements + add 1 = 10 operations
   - Total: 1+2+...+10 = 55 operations (O(n²))

3. **Called for every symbol**: `simple_parse_autodoc()` is called by `format_autodoc_symbol()` for every symbol when resolving stdlib modules. Modules like `Stdio.File` have many documented methods.

### Call Path

```
bridge.resolveStdlib("Stdio.File")
  -> handle_resolve_stdlib()
    -> introspect_program(prog)
      -> for each symbol:
        -> format_autodoc_symbol()
          -> simple_parse_autodoc()  // Called per symbol with docs
            -> for each @param:
              -> result->paramOrder += ({ param })  // O(n) append
```

## Proposed Solutions

### Option A: Build Array Once at End (Recommended)

Instead of appending during parsing, track params in the mapping and extract keys in order at the end:

```pike
protected mapping simple_parse_autodoc(string doc) {
    mapping result = ([
        "text": "",
        "params": ([]),
        // paramOrder built at end, not during parsing
        "returns": "",
        ...
    ]);

    array(string) param_order = ({});  // Local array, not in result yet

    foreach(lines, string line) {
        ...
        if (has_prefix(trimmed, "@param")) {
            ...
            current_section = "param";
            result->params[current_param] = "";
            param_order += ({ current_param });  // Append to local
        }
        ...
    }

    // Set paramOrder once at the end (single allocation)
    if (sizeof(param_order) > 0) {
        result->paramOrder = param_order;
    }

    return result;
}
```

**Trade-off**: Same O(n) total operations for n parameters, but all in one shot at the end. No improvement to algorithmic complexity, but better constant factors (single result mapping update vs. n updates).

### Option B: Pre-size Array (If Pike Supports)

If Pike has array pre-allocation, estimate param count and pre-allocate:

```pike
// Count @param tags first, then pre-allocate
int param_count = sizeof(doc / "@param") - 1;
array(string) param_order = allocate(param_count);
```

**Trade-off**: Two passes over data, but O(n) complexity. Pike may not support `allocate()` for typed arrays.

### Option C: Avoid Array Entirely

Use the params mapping keys and reconstruct order from line positions:

```pike
// Don't store paramOrder at all
// In hover-builder.ts, use Object.keys(doc.params) which already works
```

**Trade-off**: Loses parameter order preservation (the original feature). Not recommended unless order doesn't matter.

### Option D: Lazy Evaluation

Only compute paramOrder when actually needed (in hover-builder.ts), not during parsing:

```pike
// Parser.pike: Remove paramOrder entirely from simple_parse_autodoc

// hover-builder.ts: Extract order from raw doc string if needed
const paramOrder = extractParamOrder(rawDocString);
```

**Trade-off**: Moves cost to TypeScript side, complexity in parsing twice.

## Recommendation

**Implement Option A**: Build the array once at the end.

This is the simplest fix with minimal code change. The local array is still appended to O(n) times, but:
1. The result mapping is only modified once (not n times)
2. Pike's optimizer may handle local array growth more efficiently
3. The pattern is clearer and easier to maintain

If Option A doesn't restore performance, consider Option D (lazy evaluation) as a follow-up.

## Acceptance Criteria

1. Benchmark `resolveStdlib("String.SplitIterator")` returns to ≤0.060 ms
2. Benchmark `Hover: resolveModule("Stdio.File")` returns to ≤0.060 ms
3. Parameter order in hover documentation is still preserved
4. All existing tests pass

## Testing Plan

1. Run local benchmarks before fix:
   ```bash
   cd packages/pike-lsp-server && bun run bench
   ```

2. Apply fix and run benchmarks again

3. Verify hover still shows params in correct order:
   ```bash
   cd packages/vscode-pike && bun run test:features
   ```

4. Push and verify CI benchmark comparison shows no regression
