---
phase: 04-analysis-and-entry-point
plan: 04
subsystem: router
tags: [json-rpc, dispatch-table, context, dependency-injection, pike]

# Dependency graph
requires:
  - phase: 04-analysis-and-entry-point
    plan: 04-01, 04-02, 04-03
    provides: [Analysis.pike with all three handlers]
  - phase: 03-intelligence-module
    provides: [Intelligence.pike with introspect/resolve handlers]
  - phase: 02-parser-module
    provides: [Parser.pike with parse/tokenize handlers]
  - phase: 01-foundation
    provides: [LSP.Cache, LSP.Compat, module.pmod]
provides:
  - Context service container class for dependency injection
  - HANDLERS dispatch table for O(1) method routing
  - dispatch() function for centralized error handling
  - Refactored handle_request() to use dispatch()
affects: [04-05-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: [dispatch-table-router, service-container, dependency-injection]

key-files:
  modified: [pike-scripts/analyzer.pike]

key-decisions:
  - "D031: HANDLERS initialized in main() not at module scope - Pike resolves modules lazily, module path must be set before LSP module resolution"
  - "D032: Context fields don't store Cache - LSP.Cache is a module with singleton state, handlers use LSP.Cache.get/put directly"
  - "D033: Lambdas use 'object' for Context parameter - Context class defined in same file but type annotations in lambdas have forward declaration issues"
  - "D034: intelligence_instance lazy initialization - added get_intelligence_instance() to avoid compile-time module resolution"

patterns-established:
  - "Dispatch table pattern: constant mapping with lambda handlers taking (params, object ctx)"
  - "Service container pattern: Context class holds all module singletons"
  - "Late binding pattern: modules resolved via master()->resolv() after module path set"
  - "Lazy initialization pattern: get_intelligence_instance() creates instance on first call"

# Metrics
duration: 8min
completed: 2026-01-19
---

# Phase 4: Plan 4 - Context and Dispatch Table Router Summary

**Context service container with singleton Parser/Intelligence/Analysis modules and dispatch table router for O(1) JSON-RPC method routing**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-19T22:58:00Z
- **Completed:** 2026-01-19T23:06:00Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Context class with Parser, Intelligence, Analysis module instances as singletons
- HANDLERS dispatch table with 12 method handlers (parse, tokenize, compile, batch_parse, introspect, resolve, resolve_stdlib, get_inherited, find_occurrences, analyze_uninitialized, get_completion_context, set_debug)
- dispatch() function for centralized routing and error normalization
- HANDLERS initialized in main() after module path is set (late binding pattern)
- handle_request() refactored to create Context and delegate to dispatch()

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Context class** - `4e1d5db` (feat)
2. **Task 2: Add HANDLERS dispatch table** - `4e1d5db` (feat)
3. **Task 3: Add dispatch() function** - `4e1d5db` (feat)

**Plan metadata:** TBD (docs: complete plan)

_Note: All three tasks were completed in a single commit due to tight interdependencies._

## Files Created/Modified

- `pike-scripts/analyzer.pike` - Added Context class, HANDLERS mapping, dispatch() function, refactored handle_request()

## Decisions Made

**D031: HANDLERS initialized in main() not at module scope**
- Rationale: Pike resolves modules lazily via master()->resolv(). Module path must be set before LSP module resolution. HANDLERS contains lambdas that capture Context class which references LSP modules. Initializing in main() ensures module path is set first.

**D032: Context fields don't store Cache references**
- Rationale: LSP.Cache is a module with internal singleton state (not a class), so it can't be instantiated. Handlers access cache via LSP.Cache.get/put directly. Context only stores Parser, Intelligence, Analysis instances.

**D033: Lambdas use 'object' for Context parameter**
- Rationale: Context class defined in same file but type annotations in lambdas have forward declaration issues with Pike's type checker. Using 'object' works correctly at runtime.

**D034: intelligence_instance lazy initialization**
- Rationale: Module-scope `program IntelligenceClass = master()->resolv("LSP.Intelligence")->Intelligence` tried to resolve LSP before module path was set, causing compile-time error. Added get_intelligence_instance() for lazy loading.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] HANDLERS constant with lambdas caused "Constant definition is not constant" error**
- **Found during:** Task 2 (HANDLERS dispatch table)
- **Issue:** `constant HANDLERS = ([...lambda...])` failed - Pike treats lambdas with captured types as non-constant
- **Fix:** Changed to `mapping HANDLERS;` declaration, initialize in main() after module path set
- **Files modified:** pike-scripts/analyzer.pike
- **Verification:** HANDLERS initialized correctly in main(), all 12 handlers work
- **Committed in:** 4e1d5db (part of task commit)

**2. [Rule 3 - Blocking] Lambda parameter types caused syntax errors in mapping literal**
- **Found during:** Task 2 (HANDLERS lambda syntax)
- **Issue:** `lambda(mapping params, Context ctx)` caused "unexpected ')'" error - complex type annotations in lambdas don't parse correctly at module scope
- **Fix:** Changed Context parameter type to `object` - works at runtime via duck-typing
- **Files modified:** pike-scripts/analyzer.pike
- **Verification:** All 12 lambdas compile and execute correctly
- **Committed in:** 4e1d5db (part of task commit)

**3. [Rule 3 - Blocking] mapping(function) type annotation caused syntax error**
- **Found during:** Task 2 (HANDLERS declaration)
- **Issue:** `mapping(function) HANDLERS;` caused "unexpected ')'" error - Pike doesn't support this generic type syntax
- **Fix:** Use plain `mapping HANDLERS;` without type annotation
- **Files modified:** pike-scripts/analyzer.pike
- **Verification:** HANDLERS stores lambdas correctly
- **Committed in:** 4e1d5db (part of task commit)

**4. [Rule 3 - Blocking] Old intelligence_instance module-scope resolution caused runtime error**
- **Found during:** Task 1 (Context class compilation)
- **Issue:** `program IntelligenceClass = master()->resolv("LSP.Intelligence")->Intelligence;` at module scope tried to resolve LSP before module path set, causing "Cannot index the NULL value with 'Intelligence'" error
- **Fix:** Changed to lazy initialization via get_intelligence_instance() function, updated all references
- **Files modified:** pike-scripts/analyzer.pike
- **Verification:** Script runs without module resolution errors
- **Committed in:** 4e1d5db (part of task commit)

**5. [Rule 3 - Blocking] handle_request() Context resolution failed**
- **Found during:** Task 3 (handle_request update)
- **Issue:** `master()->resolv("main")->Context` returned NULL because "main" isn't a resolvable module name
- **Fix:** Changed to `this_program->Context` to reference the current program's Context class
- **Files modified:** pike-scripts/analyzer.pike
- **Verification:** Context created successfully and passed to dispatch()
- **Committed in:** 4e1d5db (part of task commit)

---

**Total deviations:** 5 auto-fixed (5 blocking)
**Impact on plan:** All auto-fixes were necessary for compilation and basic functionality. No scope creep - fixes were workarounds for Pike's type system and module loading quirks.

## Issues Encountered

- **Pike type system quirks:** Type annotations in lambda parameters have complex forward-declaration rules. Solved by using `object` type and relying on runtime duck-typing.
- **Module loading timing:** master()->resolv() requires module path to be set before use. Solved by initializing HANDLERS in main() after add_module_path().
- **LSP.Cache is a module not a class:** Can't instantiate Cache like other modules. Handlers use LSP.Cache directly for cache operations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Context class ready for use in dispatch()
- HANDLERS dispatch table with all 12 methods ready
- dispatch() function routes to appropriate handlers
- handle_request() creates Context and delegates to dispatch()
- Old handler functions still exist (handle_parse, handle_tokenize, etc.) - can be removed in 04-05

**Blockers for 04-05:** None - plan 04-05 will remove old handler functions and clean up dead code.

---
*Phase: 04-analysis-and-entry-point*
*Completed: 2026-01-19*
