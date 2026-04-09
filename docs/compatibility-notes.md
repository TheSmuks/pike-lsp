# Pike Cross-Version Compatibility Notes

> **Issue**: #1230 — Audit Pike cross-version compatibility verification
> **Date**: 2026-04-07
> **Scope**: pike-lsp codebase (`pike-scripts/`, `test/`)

## Summary

pike-lsp targets Pike 7.8, 8.0, and 8.1+. The codebase includes a compatibility layer
(`LSP.Compat`) and version-aware patterns, but several cross-version issues were found
during this audit.

---

## Supported Pike Versions

| Version | Status         | Notes                                                                      |
| ------- | -------------- | -------------------------------------------------------------------------- |
| 7.8     | Legacy         | `__REAL_VERSION__` not available; fallback to `__VERSION__` in Compat.pmod |
| 8.0     | Primary target | `#pike __REAL_VERSION__` used in entry-point scripts                       |
| 8.1+    | Forward compat | Same as 8.0; no version-specific guards for 8.1+ APIs yet                  |

---

## Compatibility Layer: `LSP.Compat.pmod`

### What it provides

1. **`PIKE_VERSION` / `PIKE_VERSION_STRING`** — Compile-time version detection via `__REAL_VERSION__` (8.0+) or `__VERSION__` (7.8 fallback).
2. **`pike_version()`** — Runtime version as `({major, minor, patch})` array.
3. **`trim_whites(string)`** — Polyfill for `String.trim_whites()` because Pike 8.x's native implementation does **not** trim newlines (`\n`, `\r`), which is inconsistent with expected behavior.

### Known issues found

#### BUG-1: Parser.pike uses native `String.trim_whites()` (FIXED)

**File**: `pike-scripts/LSP.pmod/Parser.pike`, line ~1011
**Problem**: Used native `String.trim_whites(char)` instead of `LSP.Compat.trim_whites(char)` for whitespace detection during tokenization. Since native `String.trim_whites()` does not trim newlines in Pike 8.x, single-character newline inputs would not be detected as whitespace.
**Fix**: Changed to `LSP.Compat.trim_whites(char)` for consistent cross-version behavior.

#### OBS-1: Duplicate `trim_whites()` polyfills in Intelligence modules

**Files**:

- `pike-scripts/LSP.pmod/Intelligence.pmod/Introspection.pike` (line ~58)
- `pike-scripts/LSP.pmod/Intelligence.pmod/ModuleResolution.pike` (line ~44)

**Problem**: Both files define their own `protected string trim_whites(string s)` method instead of using `LSP.Compat.trim_whites()`. The implementations are identical to `LSP.Compat.trim_whites()` — this is dead code duplication. The comment in `Introspection.pike` even says "Polyfill for missing LSP.Compat.trim_whites" which is incorrect since `LSP.Compat` always exists.
**Risk**: Low — the implementations are functionally identical, but this violates DRY and could diverge in future.
**Recommendation**: Refactor to use `LSP.Compat.trim_whites()` directly. These local polyfills can be removed once all callers are verified.

#### OBS-2: Extensive use of `String.trim_all_whites()` (15+ call sites)

**Files**: `Parser.pike`, `CompilationCache.pmod`, `Intelligence.pmod/module.pmod`, `Roxen.pmod/MixedContent.pike`
**Problem**: `String.trim_all_whites()` is used directly in 15+ locations. This function trims **all** whitespace characters (including `\0`) and is available in Pike 7.8+, so this is safe across versions. However, it is **not** wrapped by the Compat module, meaning:

- If behavior changes in a future Pike version, all 15+ call sites would need updating.
- There is no single point of control.
  **Risk**: Low — `trim_all_whites` has been stable across all Pike versions.
  **Recommendation**: Consider wrapping in `LSP.Compat` for future-proofing, but this is not urgent.

---

## API Compatibility Matrix

### APIs used across pike-lsp and their cross-version status

| API                                   | 7.8  | 8.0  | 8.1+ | Notes                                                           |
| ------------------------------------- | ---- | ---- | ---- | --------------------------------------------------------------- |
| `__REAL_VERSION__`                    | ❌   | ✅   | ✅   | Float (e.g., `8.0`). Compat.pmod has fallback to `__VERSION__`. |
| `#pike __REAL_VERSION__`              | ❌   | ✅   | ✅   | Only used in `analyzer.pike` and test scripts (entry points).   |
| `__VERSION__`                         | ✅   | ✅   | ✅   | Available everywhere; Compat.pmod fallback.                     |
| `#pragma strict_types`                | ✅   | ✅   | ✅   | Used extensively. Safe.                                         |
| `Standards.JSON.decode/encode`        | ✅   | ✅   | ✅   | Stable API.                                                     |
| `String.trim_whites()`                | ✅\* | ✅\* | ✅\* | ⚠️ Does NOT trim `\n`/`\r` in 8.x. Compat layer handles this.   |
| `String.trim_all_whites()`            | ✅   | ✅   | ✅   | Trims all whitespace. Stable.                                   |
| `master()->resolv()`                  | ✅   | ✅   | ✅   | Stable.                                                         |
| `master()->add_module_path()`         | ✅   | ✅   | ✅   | Stable.                                                         |
| `file_stat()`                         | ✅   | ✅   | ✅   | Returns `Stdio.Stat` object or 0. Stable.                       |
| `combine_path()`                      | ✅   | ✅   | ✅   | Stable.                                                         |
| `dirname()` / `basename()`            | ✅   | ✅   | ✅   | Stable.                                                         |
| `sprintf()`                           | ✅   | ✅   | ✅   | Stable, but format specifiers may vary.                         |
| `s[0]`, `s[-1]`, `s[1..]`, `s[0..<1]` | ✅   | ✅   | ✅   | Range indexing stable since 7.4+.                               |
| `objectp()`, `mappingp()`, etc.       | ✅   | ✅   | ✅   | Type check functions are stable.                                |
| `has_prefix()`, `has_suffix()`        | ✅   | ✅   | ✅   | Stable since 7.4+.                                              |
| `has_value()`                         | ✅   | ✅   | ✅   | Stable.                                                         |

### Key Version-Specific Behavior

1. **`String.trim_whites()`** — The most significant compatibility concern. In Pike 8.x, this function trims spaces and tabs but **not** newlines. The codebase uses `LSP.Compat.trim_whites()` as a polyfill that trims spaces, tabs, newlines, and carriage returns consistently.

2. **`#pike __REAL_VERSION__`** — This directive sets the language version to match the running Pike. It's only used in `analyzer.pike` and test scripts. For Pike 7.8, this directive would fail; however, the codebase appears to target 8.0+ as the primary runtime.

3. **`Standards.JSON`** — Available in all target versions. The `PRETT` flag (used as `Standards.JSON.PRETTY`) may not exist in older versions; current code does not use it, only uses the default and optional `flags` parameter.

---

## Architecture Recommendations

### Short-term (already done in this PR)

- ✅ Fixed `Parser.pike` to use `LSP.Compat.trim_whites()` instead of native `String.trim_whites()`.

### Medium-term

- Remove duplicate `trim_whites()` polyfills in `Introspection.pike` and `ModuleResolution.pike`; use `LSP.Compat.trim_whites()` instead.
- Add `String.trim_all_whites()` wrapper to `LSP.Compat` for future-proofing.

### Long-term

- Add runtime version checks in `LSP.Compat` for any 8.1+ specific APIs as they are adopted.
- Consider adding CI matrix testing against Pike 7.8 and 8.0 to catch regressions.

---

## Test Coverage

The existing `test/tests/cross-version-tests.pike` covers:

- `Compat.trim_whites()` edge cases (spaces, newlines, empty string, tabs)
- String handling across versions
- All 12 LSP handlers producing correct output on the current Pike version

**Missing test coverage**:

- No tests that verify `String.trim_whites()` vs `LSP.Compat.trim_whites()` behavioral differences
- No tests for Pike 7.8-specific code paths (the `__VERSION__` fallback)
- No CI matrix testing against multiple Pike versions
