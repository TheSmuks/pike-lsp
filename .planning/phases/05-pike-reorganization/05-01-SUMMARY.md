---
phase: 05-pike-reorganization
plan: 01
subsystem: pike-intelligence
tags: [pike, pmod, autodoc, introspection, symbol-extraction]

# Dependency graph
requires:
  - phase: 04-server-grouping
    provides: stable server-side LSP handlers
provides:
  - Intelligence.pmod directory with shared AutoDoc helpers
  - Introspection.pike class for symbol extraction
  - Module pattern for splitting Intelligence.pike using .pmod idiom
affects: [05-02-resolution, 05-03-type-analysis]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - .pmod directory structure for Pike code organization
    - module.pmod file for shared helper functions
    - Class-in-.pike pattern with create(object ctx) constructor
    - Error handling with catch blocks and LSPError responses

key-files:
  created:
    - pike-scripts/LSP.pmod/Intelligence.pmod/module.pmod
    - pike-scripts/LSP.pmod/Intelligence.pmod/Introspection.pike
  modified: []

key-decisions:
  - "05-01-D01: Use module.submodule.class pattern for accessing classes in nested .pmod directories"
  - "05-01-D02: Keep shared helper functions in module.pmod, classes in separate .pike files"
  - "05-01-D03: Use master()->resolv() for module resolution instead of constant exports (avoid circular dependency)"

patterns-established:
  - "Pattern 1: .pmod directories contain module.pmod (shared functions) and .pike files (classes)"
  - "Pattern 2: Classes use create(object ctx) constructor pattern"
  - "Pattern 3: Handlers wrap work in catch with LSPError response on error"
  - "Pattern 4: Access nested classes via master()->resolv(\"LSP.Module.Submodule.ClassName.ClassName\")"

# Metrics
duration: 7min
completed: 2026-01-21
---

# Phase 5 Plan 1: Intelligence.pmod Directory Structure Summary

**Created Intelligence.pmod directory with module.pmod (AutoDoc helpers) and Introspection.pike (symbol extraction class)**

## Performance

- **Duration:** 7 min (419s)
- **Started:** 2026-01-21T09:43:10Z
- **Completed:** 2026-01-21T09:50:09Z
- **Tasks:** 3
- **Files created:** 2

## Accomplishments

- Created `Intelligence.pmod/` directory structure following Pike .pmod idiom
- Extracted 4 shared helper functions to `module.pmod`: extract_autodoc_comments, extract_symbol_name, process_inline_markup, replace_markup
- Created `Introspection.pike` class with introspection handlers for symbol extraction
- Established .pmod pattern for splitting Intelligence.pike (1660 lines) into smaller, focused files

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Intelligence.pmod directory with module.pmod** - `5421142` (feat)
2. **Task 2: Create Introspection.pike with Introspection class** - `6d93b2d` (feat)
3. **Task 3: Document Pike module resolution pattern** - `da35594` (fix)

**Plan metadata:** pending (docs: complete plan)

## Files Created

- `pike-scripts/LSP.pmod/Intelligence.pmod/module.pmod` (224 lines) - Shared AutoDoc parsing helpers
- `pike-scripts/LSP.pmod/Intelligence.pmod/Introspection.pike` (413 lines) - Symbol extraction class

## Decisions Made

### 05-01-D01: Module resolution pattern for nested .pmod directories
- **Context:** Pike creates submodules for .pike files inside .pmod directories
- **Decision:** Access Introspection class via `LSP.Intelligence.Introspection.Introspection` (module.submodule.class)
- **Rationale:** Constant export creates circular dependency at compile time; runtime resolution works correctly

### 05-01-D02: module.pmod for shared functions, .pike for classes
- **Context:** Need to share helpers across classes in Intelligence.pmod
- **Decision:** Functions in module.pmod are merged into module namespace, classes in separate .pike files
- **Rationale:** Pike's .pmod system merges module.pmod contents directly into module namespace

### 05-01-D03: No constant re-export due to circular dependency
- **Context:** Attempted to export Introspection class from module.pmod
- **Decision:** Document the access pattern instead of using constant exports
- **Rationale:** `constant Introspection = Introspection.Introspection` fails with "Constant is not defined yet" error

## Deviations from Plan

### Discovered: Pike module system behavior differs from plan assumption

**Original plan requirement:**
> master()->resolv("LSP.Intelligence.Introspection") returns the class program

**Actual behavior:**
- With `Intelligence.pmod/Introspection.pike` containing class `Introspection`
- Access path is `LSP.Intelligence.Introspection.Introspection` (module.submodule.class)
- This is Pike's standard behavior for .pike files inside .pmod directories

**Resolution:**
- Updated module.pmod documentation to explain the access pattern
- Verification tests use correct path: `master()->resolv("LSP.Intelligence.Introspection.Introspection")`
- All functionality works correctly with the adjusted path

**Impact:** Documentation change only, no functional impact

## Issues Encountered

1. **Circular dependency with constant export**
   - Initial attempt: `constant Introspection = Introspection.Introspection`
   - Error: "Constant is not defined yet"
   - Resolution: Document the proper access pattern instead of re-exporting

2. **Function type checking via module index vs resolv**
   - `mod->extract_autodoc_comments` returns `mixed` type (not recognized as function)
   - `master()->resolv("LSP.Intelligence.extract_autodoc_comments")` returns function type correctly
   - Resolution: Use resolv for type checking, but functions work correctly in both cases

## Next Phase Readiness

**Ready for Plan 05-02 (Resolution.pike):**
- module.pmod helpers are available for Resolution class to use
- .pmod directory structure is established
- Pattern for class creation is documented

**Blockers/Concerns:**
- None

## Verification Commands

```bash
# Test module loading
pike -e '
  master()->add_module_path("pike-scripts");
  mixed fn = master()->resolv("LSP.Intelligence.extract_autodoc_comments");
  werror("extract_autodoc_comments: %s\n", functionp(fn) ? "OK" : "FAIL");
  mixed cls = master()->resolv("LSP.Intelligence.Introspection.Introspection");
  werror("Introspection class: %s\n", programp(cls) ? "OK" : "FAIL");
'
```

---
*Phase: 05-pike-reorganization*
*Completed: 2026-01-21*
