# Feature Landscape: Pike Version Compatibility

**Domain:** Pike programming language version compatibility for LSP analyzer
**Researched:** 2025-01-19
**Overall confidence:** MEDIUM

## Executive Summary

Pike provides multiple mechanisms for version compatibility: the `#pike` preprocessor directive for setting backward compatibility level, `#if constant()` for feature detection, and a formal backward compatibility layer accessible via `-V` runtime flag. However, the stdlib does NOT use version-specific directory patterns like `7.6/` or `7.8/` — this is a misconception. Instead, Pike uses:
1. `#pike __VERSION__` directives to emulate older behavior
2. `#if constant()` for compile-time feature detection
3. Runtime polyfills within modules
4. Module renaming/mapping through the backward compatibility layer

**Key finding:** `String.trim_whites` exists in Pike 8.0 and 9.x, but availability in 7.6/7.8 is uncertain. The current analyzer.pike uses it extensively without feature detection, creating a compatibility risk.

## Table Stakes

Features users expect in a multi-version compatible Pike codebase.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Version detection macros** | Required to target 7.6, 7.8, 8.0.x | Low | Use `__REAL_MAJOR__`, `__REAL_MINOR__` constants |
| **Feature detection (`#if constant()`)** | Compile-time check for stdlib features | Low | Pike stdlib pattern for conditional code |
| **`#pike __REAL_VERSION__`** | Ensures code matches running interpreter | Low | Standard practice in Pike stdlib modules |
| **Polyfill implementations** | Graceful degradation for missing functions | Medium | Need replacements for trim_whites and others |
| **Error handling wrapper** | Prevent crashes on unsupported features | Medium | Wrap potentially missing functions in catch() |

## Differentiators

Features that set this compatibility layer apart.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Unified Compat.pmod API** | Single import for all version-specific code | Medium | `Compat.trim()`, `Compat.tokenize()` |
| **Runtime feature cache** | Detect features once, reuse results | Medium | Avoid repeated `constant()` lookups |
| **Version-specific optimizations** | Use newer APIs when available | High | E.g., Parser.Pike enhancements in 8.0+ |

## Anti-Features

Features to explicitly NOT build. Common mistakes in Pike compatibility.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Version-specific directories (`7.6/`, `7.8/`)** | Pike stdlib does NOT use this pattern | Use `#pike` directive and `#if constant()` |
| **Runtime Pike version checking** | Unnecessary; compile-time detection is sufficient | Use preprocessor `#if` expressions |
| **Separate codebases per version** | Maintenance nightmare; violates DRY | Single codebase with conditional compilation |
| **Dynamic loading of version modules** | Overcomplicated; module loading is slower | Static polyfills with feature detection |

---

## Feature Detection Patterns

### 1. The `#if constant()` Pattern

Pike's primary feature detection mechanism. Checks if a constant, function, or module exists at compile time.

```pike
// Pattern 1: Basic feature detection
#if constant(String.trim_whites)
  string trimmed = String.trim_whites(input);
#else
  string trimmed = compat_trim_whites(input);  // Polyfill
#endif

// Pattern 2: With warning for users
#if !constant(String.trim_whites)
  #warning "String.trim_whites not available, using polyfill"
#endif

// Pattern 3: Define a compatibility constant
#if constant(String.trim_whites)
  #define HAS_TRIM_WHITES 1
#else
  #define HAS_TRIM_WHITES 0
#endif
```

**When to use:**
- Checking for stdlib functions (`String.trim_whites`, `Parser.Pike.tokenize`)
- Checking for module existence (`SSL`, `Gdbm`)
- Compile-time conditional compilation

**Do NOT use for:**
- Runtime decisions (use `catch()` instead)
- Checking variable values (use `#if defined()` instead)

### 2. Version Comparison with Predefined Defines

Pike provides version constants that can be compared in `#if` expressions.

```pike
// Available predefined defines (HIGH confidence - from Pike manual)
// __REAL_VERSION__  - float, e.g., 8.0
// __REAL_MAJOR__    - int, e.g., 8
// __REAL_MINOR__    - int, e.g., 0
// __REAL_BUILD__    - int, e.g., 1116
// __VERSION__       - changes with #pike directive
// __MAJOR__         - changes with #pike directive
// __MINOR__         - changes with #pike directive

// Pattern 1: Version comparison
#if __REAL_MAJOR__ > 7
  // Pike 8.0 or later
  string trimmed = String.trim_whites(input);
#else
  // Pike 7.x or earlier
  string trimmed = compat_trim_whites(input);
#endif

// Pattern 2: Version range check
#if __REAL_VERSION__ >= 7.8 && __REAL_VERSION__ < 8.0
  // Pike 7.8 specific code
#endif

// Pattern 3: Minimum version requirement
#if __REAL_VERSION__ < 7.6
  #error "Pike 7.6 or later required"
#endif
```

**When to use:**
- When you know exactly which version introduced a feature
- Minimum version requirements
- Version-specific optimizations

**Caveat:** Version comparisons are fragile. Prefer `constant()` checks when possible.

### 3. The `#pike` Directive for Backward Compatibility

Sets the Pike compatibility level, affecting both compiler behavior and available modules.

```pike
// Pattern 1: Pin to specific version
#pike 7.6
// Code compiled with Pike 7.6 semantics

// Pattern 2: Match running interpreter (recommended for modules)
#pike __REAL_VERSION__
// Use the version of the currently running Pike

// Pattern 3: Conditional compatibility
#if __REAL_MAJOR__ >= 8
  #pike 8.0
#else
  #pike 7.8
#endif
```

**Important notes:**
- Affects both compiler and available modules
- Can only increase compatibility, not decrease
- The backward compatibility layer does NOT compensate for all incompatibilities
- Pike 9.0 removed compatibility code for 7.6 and earlier

**From official docs (HIGH confidence):**
> "The backward compatibility layer can be engaged in two ways; either by starting the Pike interpreter with the -V option, or by using the #pike preprocessor directive."

### 4. The `defined()` vs `constant()` Distinction

```pike
// `defined()` checks for cpp macros (from #define)
#define MY_FEATURE 1

#if defined(MY_FEATURE)
  // This code is compiled
#endif

// `constant()` checks for Pike constants, functions, modules
#if constant(String.trim_whites)
  // String.trim_whites is available
#endif

// `efun()` is deprecated but equivalent to `constant()`
#if efun(String.trim_whites)
  // Same as constant()
#endif
```

**Rule of thumb:**
- Use `#if defined()` for `#define` macros
- Use `#if constant()` for stdlib features

---

## Polyfill Patterns

### 1. Inline Polyfill with `#if constant()`

```pike
// Simple polyfill pattern
#if constant(String.trim_whites)
  #define TRIM_WHITES(s) String.trim_whites(s)
#else
  #define TRIM_WHITES(s) compat_trim_whites(s)
  static string compat_trim_whites(string s) {
    // Implementation
    return Regexp->replace(s, "^[ \\t]+|[ \\t]+$", "");
  }
#endif
```

### 2. Compat.pmod Module Pattern

Create a dedicated compatibility module that exports unified APIs.

```pike
// LSP.pmod/Compat.pmod
#pike __REAL_VERSION__

//! Version compatibility layer for LSP analyzer
//! Provides unified APIs across Pike 7.6, 7.8, 8.0.x

// Feature: String.trim_whites
#if constant(String.trim_whites)
string trim(string s) { return String.trim_whites(s); }
#else
string trim(string s) {
  // Polyfill implementation
  int start = 0, end = sizeof(s);
  while (start < end && (<s[start] == ' ' || <s[start] == '\t')) start++;
  while (end > start && (<s[end-1] == ' ' || <s[end-1] == '\t')) end--;
  return s[start..end-1];
}
#endif

// Feature: Parser.Pike.split (check if exists)
#if constant(Parser.Pike.split)
array(string) pike_split(string code) { return Parser.Pike.split(code); }
#else
array(string) pike_split(string code) {
  // Basic implementation
  return code / "(\s+|\"[^\"]*\"|'[^\']*'|/[/*][^\n]*)";
}
#endif
```

### 3. Runtime Polyfill with Feature Cache

```pike
// LSP.pmod/Compat.pmod (advanced version)
#pike __REAL_VERSION__

//! Runtime feature detection cache
private mapping(string:bool) feature_cache = ([]);

bool has_feature(string name) {
  if (!feature_cache[name]) {
    feature_cache[name] = constant(name);
  }
  return feature_cache[name];
}

// Dynamic function dispatch
string trim(string s) {
  if (has_feature("String.trim_whites")) {
    return String.trim_whites(s);
  }
  // Fallback implementation
  return trim_fallback(s);
}
```

---

## Known Version Differences

### Pike 7.6 vs 7.8

From the official Pike 7.8 release notes (HIGH confidence):

| Feature | 7.6 | 7.8 | Migration Path |
|---------|-----|-----|----------------|
| SSL module | Old API | New API (SSL.ClientConnection, SSL.ServerConnection) | Use `#pike 7.6` for old code |
| Locale.Charset | Existed | Moved to `Charset` module | `#if constant(Locale.Charset)` |
| Tools.PEM | Existed | Moved to `Standards.PEM` | `#if constant(Tools.PEM)` |
| Yabu.db | Existed | Moved to `Yabu.DB` | Use compatibility layer |

**Important:** The 7.8 release notes state: "Compatibility with 7.6 and older is retained with `#pike 7.6`".

### Pike 7.8 vs 8.0

From the backward compatibility chapter (HIGH confidence):

| Feature | 7.8 | 8.0 | Migration Path |
|---------|-----|-----|----------------|
| `__AUTO_BIGNUM__` | Not defined | Always defined (bignum always on) | Assume bignum support |
| Debug functions | `_debug`, `_refs`, etc. | Moved to `Debug` module | Use `#pike 7.8` or update |
| SSL.sslfile | Existed | Renamed to `SSL.File` | Feature detection |
| Parser.Pike enhancements | Basic | Enhanced tokenize/split | Test availability |
| String.trim_whites | Unknown | Documented in 8.0+ | Use polyfill |

**Critical from Chapter 29:** "The backward compatibility code for Pike 7.6 and earlier has been removed in Pike 9.0."

### String Module Evolution

| Function | 7.6 | 7.8 | 8.0+ | Notes |
|----------|-----|-----|------|-------|
| `trim_whites()` | **?** | **?** | **YES** | Needs verification for 7.6/7.8 |
| `trim()` | **?** | **?** | **YES** | Alias for trim_whites? |
| `width()` | **?** | **?** | **YES** | Table formatting |

**Validation needed:** Exact version when `trim_whites` was introduced.

### Parser.Pike Evolution

| Function | 7.6 | 7.8 | 8.0+ | Notes |
|----------|-----|-----|------|-------|
| `split()` | **?** | **?** | **YES** | Splits code into token strings |
| `tokenize()` | **?** | **?** | **YES** | Converts split tokens to Token objects |
| `PikeParser` | Tools.AutoDoc | Tools.AutoDoc | Tools.AutoDoc | Higher-level Pike parser |

**Important:** `Parser.Pike` inherits from `Parser.C`, which provides base tokenization.

---

## Feature Detection Checklist for Our Codebase

### Required Feature Checks

| Feature | Current Usage | Detection Method | Polyfill Needed? |
|---------|---------------|------------------|------------------|
| `String.trim_whites()` | 50+ uses | `#if constant(String.trim_whites)` | **YES** |
| `Parser.Pike.split()` | 6 uses | `#if constant(Parser.Pike.split)` | Possibly |
| `Parser.Pike.tokenize()` | 6 uses | `#if constant(Parser.Pike.tokenize)` | Possibly |
| `Tools.AutoDoc.PikeParser` | 1 use | `#if constant(Tools.AutoDoc.PikeParser)` | No (core feature) |
| `has_prefix()` | Many uses | `#if constant(has_prefix)` | No (basic string op) |
| `replace()` | Many uses | `#if constant(replace)` | No (basic string op) |

### High-Risk Code Locations

Based on grep analysis of `analyzer.pike`:

1. **Line 105, 425, 842, 868, 876, 962, 1121, 1152, 1748, etc.**
   - Direct `String.trim_whites()` usage
   - **Risk:** High if targeting Pike 7.6/7.8

2. **Line 458-459, 1943-1944, 2310-2311, 3053-3054**
   - `Parser.Pike.split()` and `Parser.Pike.tokenize()` usage
   - **Risk:** Medium, these are core parsing features

---

## Graceful Degradation Strategies

### Strategy 1: Compile-Time Selection

Use `#if constant()` to select implementations at compile time.

```pike
#if constant(String.trim_whites)
  string do_trim(string s) { return String.trim_whites(s); }
#else
  string do_trim(string s) {
    // Fallback: manual trim
    int i = 0, j = sizeof(s);
    while (i < j && (<s[i] == ' ' || <s[i] == '\t' || <s[i] == '\n')) i++;
    while (j > i && (<s[j-1] == ' ' || <s[j-1] == '\t' || <s[j-1] == '\n')) j--;
    return s[i..j-1];
  }
#endif
```

### Strategy 2: Runtime Fallback

Use `catch()` to attempt the fast path, fall back on error.

```pike
string safe_trim(string s) {
  mixed err = catch {
    return String.trim_whites(s);
  };
  // Fallback if function doesn't exist
  return manual_trim(s);
}
```

**Note:** This is slower than compile-time selection but more flexible.

### Strategy 3: Feature Detection with Warning

Inform users when using fallback implementations.

```pike
#if !constant(String.trim_whites)
  #warning "String.trim_whites not available. Using polyfill."
#endif
```

### Strategy 4: Capability Reporting

Report detected capabilities to the caller.

```pike
mapping(string:mixed) get_capabilities() {
  return ([
    "has_trim_whites": constant(String.trim_whites),
    "has_pike_tokenizer": constant(Parser.Pike.tokenize),
    "pike_version": __REAL_VERSION__,
    "pike_major": __REAL_MAJOR__,
    "pike_minor": __REAL_MINOR__,
  ]);
}
```

---

## Module Loading with Fallback

### Pattern 1: Conditional Module Import

```pike
// Try to import module, fall back if missing
#if constant(Parser.Pike)
  constant PikeParser = Parser.Pike;
#else
  // Fallback: minimal Pike parser
  class PikeParser {
    // Minimal implementation
  }
#endif
```

### Pattern 2: Runtime Module Loading

```pike
// Load module at runtime with fallback
object load_pike_parser() {
  mixed err = catch {
    return master()->resolv("Parser.Pike");
  };
  // Return fallback implementation
  returnFallbackParser();
}
```

### Pattern 3: Module Version Selection

```pike
// Select appropriate module based on version
#if __REAL_MAJOR__ >= 8
  // Use enhanced 8.0+ features
  inherit Parser.Pike;
#else
  // Use basic parser
  inherit Parser._parser.Pike;
#endif
```

---

## Test Matrix for Versions to Support

### Version Support Matrix

| Version | Status | Priority | Notes |
|---------|--------|----------|-------|
| **Pike 7.6** | Target | High | Older but still in use; SSL module old API |
| **Pike 7.8** | Target | High | Intermediate version; some module reorganization |
| **Pike 8.0.x** | Primary | High | Current stable; full feature set |
| **Pike 8.1+** | Forward | Medium | Should work with 8.0 code |
| **Pike 9.0+** | Forward | Low | No 7.6 compatibility; may need updates |

### CI Test Requirements

Each version should be tested for:

1. **Compilation:** Code compiles without errors
2. **Core features:** parse, tokenize, compile methods work
3. **Polyfills:** Fallback implementations activate correctly
4. **Stdlib resolution:** Module resolution works for that version
5. **JSON-RPC:** Protocol communication remains intact

---

## MVP Recommendation

For MVP (Phase 1 of refactoring):

### Prioritize:
1. **Compat.pmod creation** with `String.trim_whites` polyfill
2. **Feature detection infrastructure** using `#if constant()`
3. **Version reporting** for diagnostics
4. **Document assumptions** about 7.6/7.8 features

### Defer to post-MVP:
- Performance optimization based on version-specific features
- Comprehensive polyfills for all stdlib differences
- Version-specific code paths for optimization

---

## Sources

### HIGH Confidence

- **[Pike Manual - Chapter 6: Preprocessor](http://pike.lysator.liu.se/docs/man/chapter_6.html)** — Official preprocessor documentation, `#if`, `#pike`, `constant()`
- **[Pike Manual - Chapter 29: Backward Compatibility](http://pike.lysator.liu.se/docs/man/chapter_29.html)** — Official compatibility documentation, version differences
- **[Pike 7.8 Release Notes](https://pike.lysator.liu.se/download/notes/7.8.xml)** — Changes between 7.6 and 7.8
- **[Pike 8.0 Release Notes](https://pike.lysator.lyu.se/download/notes/8.0.1738.xml)** — Changes between 7.8 and 8.0
- **[String.trim_whites Reference](https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/String/trim_whites.html)** — Confirms existence in 8.0+
- **[Parser.Pike Reference](https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/Parser/Pike.html)** — Confirms split/tokenize methods

### MEDIUM Confidence

- **[Pike Fundamental Concepts](https://pike.lysator.liu.se/docs/tut/fundamentals/index.md)** — Feature detection patterns
- **analyzer.pike source** — Current usage patterns (3,221 lines)

### LOW Confidence

- Exact introduction version of `String.trim_whites()` — Needs verification against 7.6/7.8
- `Parser.Pike.split()` availability in 7.6 — Needs testing
- Best polyfill implementations — Need performance measurement

### Validation Needed

- [ ] Verify `String.trim_whites` availability in Pike 7.6 (run on 7.6 interpreter)
- [ ] Verify `String.trim_whites` availability in Pike 7.8 (run on 7.8 interpreter)
- [ ] Test `Parser.Pike.split()` and `tokenize()` on 7.6
- [ ] Document all stdlib differences between target versions
- [ ] Benchmark polyfill vs native implementations

---

## Compat.pmod Design Implications

Based on this research, the `LSP.pmod/Compat.pmod` module should:

### 1. Export Unified APIs

```pike
// Instead of: String.trim_whites(s)
// Use: Compat->trim(s)

// Instead of: Parser.Pike.split(code)
// Use: Compat->pike_split(code)

// Instead of: Parser.Pike.tokenize(tokens)
// Use: Compat->pike_tokenize(tokens)
```

### 2. Provide Version Information

```pike
// Compat.pike_version_info()
// Returns: mapping with version, capabilities
```

### 3. Centralize All Feature Detection

```pike
// All #if constant() checks in one place
// Other modules import Compat, not direct stdlib
```

### 4. Include Comprehensive Polyfills

```pike
// String utilities: trim, trim_whites, width, etc.
// Parser utilities: split, tokenize (if missing)
// Module resolution helpers
```
