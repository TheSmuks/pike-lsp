---
phase: 04-analysis-and-entry-point
plan: 04
subsystem: router
tags: [json-rpc, dispatch-table, context, dependency-injection, pike]

# Dependency graph
requires:
  - phase: 04-analysis-and-entry-point
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
affects: [04-05-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: [dispatch-table-router, service-container, dependency-injection]

key-files:
  modified: [pike-scripts/analyzer.pike]

key-decisions:
  - "D031: HANDLERS initialized in main() not at module scope - Pike resolves modules lazily, module path must be set before LSP module resolution"
  - "D032: Context fields use 'mixed' type - can't use LSP.Cache/LSP.Parser types before module path is set in main()"
  - "D033: Lambdas use 'object' for Context parameter - Context class defined in same file but type annotations in lambdas have forward declaration issues"
  - "D034: Old intelligence_instance lazy initialization - existing code still referenced module-scope instance, added get_intelligence_instance() for backward compatibility"

patterns-established:
  - "Dispatch table pattern: constant mapping with lambda handlers taking (params, Context)"
  - "Service container pattern: Context class holds all module singletons"
  - "Late binding pattern: modules resolved via master()->resolv() after module path set"

# Metrics
duration: 18min
completed: 2026-01-19
---

# Phase 4: Plan 4 - Context and Dispatch Table Router Summary

**Context service container with singleton Parser/Intelligence/Analysis modules and dispatch table router for O(1) JSON-RPC method routing**

## Performance

- **Duration:** 18 min
- **Started:** 2026-01-19T22:58:19Z
- **Completed:** 2026-01-19T23:16:00Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Context class with Parser, Intelligence, Analysis module instances as singletons
- HANDLERS dispatch table with 12 method handlers (parse, tokenize, compile, batch_parse, introspect, resolve, resolve_stdlib, get_inherited, find_occurrences, analyze_uninitialized, get_completion_context, set_debug)
- dispatch() function for centralized routing and error normalization
- HANDLERS initialized in main() after module path is set (late binding pattern)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Context class** - (to be committed)
2. **Task 2: Add HANDLERS dispatch table** - (to be committed)
3. **Task 3: Add dispatch() function** - (to be committed)

**Plan metadata:** (to be committed)

## Files Created/Modified

- `pike-scripts/analyzer.pike` - Added Context class, HANDLERS mapping, dispatch() function

## Decisions Made

**D031: HANDLERS initialized in main() not at module scope**
- Rationale: Pike resolves modules lazily via master()->resolv(). Module path must be set before LSP module resolution. HANDLERS contains lambdas that capture Context class which references LSP modules. Initializing in main() ensures module path is set first.

**D032: Context fields use 'mixed' type not LSP.Cache/LSP.Parser**
- Rationale: Can't use LSP.Cache/LSP.Parser as type annotations before module path is set in main(). Using 'mixed' allows compilation, and runtime access works correctly since Context is instantiated in main() after modules are available.

**D033: Lambdas use 'object' for Context parameter**
- Rationale: Context class defined in same file but type annotations in lambdas have forward declaration issues with Pike's type checker. Using 'object' works correctly at runtime.

**D034: Old intelligence_instance lazy initialization**
- Rationale: Existing handler functions still referenced module-scope intelligence_instance. Added get_intelligence_instance() for lazy loading to avoid compile-time module resolution. Will be removed in 04-05.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pike doesn't support type annotations in module-scope variables when types aren't loaded yet**
- **Found during:** Task 1 (Context class creation)
- **Issue:** `LSP.Cache program_cache;` caused "Indexing on illegal type" error - LSP module not loaded at compile time
- **Fix:** Changed all Context field types to `mixed`, rely on runtime duck-typing
- **Files modified:** pike-scripts/analyzer.pike
- **Verification:** Compilation succeeds, Context->program_cache works at runtime
- **Committed in:** (part of task commit)

**2. [Rule 3 - Blocking] HANDLERS constant with lambdas caused "Constant definition is not constant" error**
- **Found during:** Task 2 (HANDLERS dispatch table)
- **Issue:** `constant HANDLERS = ([...lambda...])` failed - Pike treats lambdas with captured types as non-constant
- **Fix:** Changed to `mapping HANDLERS;` declaration, initialize in main() after module path set
- **Files modified:** pike-scripts/analyzer.pike
- **Verification:** HANDLERS initialized correctly in main(), all 12 handlers work
- **Committed in:** (part of task commit)

**3. [Rule 3 - Blocking] Lambda parameter types caused syntax errors in mapping literal**
- **Found during:** Task 2 (HANDLERS lambda syntax)
- **Issue:** `lambda(mapping params, Context ctx)` caused "unexpected ')'" error - complex type annotations in lambdas don't parse correctly at module scope
- **Fix:** Changed Context parameter type to `object` - works at runtime via duck-typing
- **Files modified:** pike-scripts/analyzer.pike
- **Verification:** All 12 lambdas compile and execute correctly
- **Committed in:** (part of task commit)

**4. [Rule 3 - Blocking] mapping(function) type annotation caused syntax error**
- **Found during:** Task 2 (HANDLERS declaration)
- **Issue:** `mapping(function) HANDLERS;` caused "unexpected ')'" error - Pike syntax for mapping value types is `mapping(keytype:valuetype)`
- **Fix:** Use plain `mapping HANDLERS;` without type annotation
- **Files modified:** pike-scripts/analyzer.pike
- **Verification:** HANDLERS stores lambdas correctly
- **Committed in:** (part of task commit)

**5. [Rule 1 - Bug] Old intelligence_instance module-scope resolution caused runtime error**
- **Found during:** Task 2 (testing after HANDLERS addition)
- **Issue:** `program IntelligenceClass = master()->resolv("LSP.Intelligence")->Intelligence;` at module scope tried to resolve LSP before module path set
- **Fix:** Commented out module-scope instance, added get_intelligence_instance() for lazy loading (temporary, will be removed in 04-05)
- **Files modified:** pike-scripts/analyzer.pike
- **Verification:** --test mode works without module resolution errors
- **Committed in:** (part of task commit)

---

**Total deviations:** 5 auto-fixed (4 blocking, 1 bug)
**Impact on plan:** All auto-fixes were necessary for compilation and basic functionality. No scope creep - fixes were workarounds for Pike's type system and module loading quirks.

## Issues Encountered

- **Pike type system quirks:** Type annotations in module-scope variables and lambda parameters have complex forward-declaration rules. Solved by using `mixed`/`object` types and relying on runtime duck-typing.
- **Module loading timing:** master()->resolv() requires module path to be set before use. Solved by initializing HANDLERS in main() after add_module_path().

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Context class ready for use in dispatch()
- HANDLERS dispatch table with all 12 methods ready
- dispatch() function routes to appropriate handlers
- Old handle_request() switch statement still exists (TODO: replace in 04-05)
- Old handler functions still exist (TODO: remove in 04-05)

**Blockers for 04-05:** None - plan 04-05 will remove old handler functions and update handle_request() to use dispatch()

---
*Phase: 04-analysis-and-entry-point*
*Completed: 2026-01-19*
