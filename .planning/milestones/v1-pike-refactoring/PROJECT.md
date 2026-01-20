# Pike LSP Analyzer Refactoring

## What This Is

Refactor the monolithic `analyzer.pike` (3,221 lines) into a modular Pike codebase following stdlib conventions. The LSP analyzer provides parsing, symbol extraction, and code intelligence for Pike language support in VSCode. Uses JSON-RPC over stdin/stdout for communication.

## Core Value

**Modularity without breaking functionality** - each handler independently testable and maintainable, supporting multiple Pike versions (7.6, 7.8, 8.0.x+) through graceful feature detection and polyfills.

## Requirements

### Validated

- ✓ JSON-RPC server with 12 LSP methods — existing
- ✓ Pike source parsing with Parser.Pike — existing
- ✓ Symbol extraction and introspection — existing
- ✓ Stdlib module resolution — existing
- ✓ Token-based analysis (occurrences, completion) — existing

### Active

- [ ] Modularize analyzer.pike into LSP.pmod/ directory structure
- [ ] Create LSP.pmod/module.pmod with shared utilities and constants
- [ ] Create LSP.pmod/Compat.pmod for version compatibility layer
- [ ] Extract Parser.pike (parse, tokenize, compile, batch_parse handlers)
- [ ] Extract Intelligence.pike (introspect, resolve, stdlib, inherited handlers)
- [ ] Extract Analysis.pike (occurrences, uninitialized, completion handlers)
- [ ] Extract Cache.pmod (program cache, stdlib cache, LRU utilities)
- [ ] Add version detection for Pike 7.6, 7.8, 8.0.x, and newer
- [ ] Add feature detection and polyfills for missing functions
- [ ] Ensure error isolation (handler failures don't crash entire server)
- [ ] Write tests for individual modules

### Out of Scope

- Changing JSON-RPC protocol — keep compatibility with existing bridge
- Rewriting algorithm logic — focus on organization, not new features
- Performance optimization beyond what modularization naturally provides

## Context

**Current state:**
- Single 3,221-line `analyzer.pike` file
- All 12 handler functions in one place
- Shared utilities (caches, debug logging, trim functions) mixed with handlers
- Hard to test individual components
- Error in one handler can affect others

**Target Pike versions:**
- Pike 7.6 (older stdlib, fewer features)
- Pike 7.8 (intermediate version)
- Pike 8.0.x (current, has String.trim_whites, Parser.Pike enhancements)
- Future 8.x versions (forward compatibility)

**Existing patterns to follow:**
- Pike stdlib uses `.pmod/` directories for namespaced modules
- `module.pmod` contains shared constants, enums, helper functions
- `#if constant(...)` for feature detection
- `#pike __REAL_VERSION__` for version-specific code
- Protected functions for internal implementation

**Technical constraints:**
- Must maintain JSON-RPC protocol compatibility with TypeScript bridge
- Graceful degradation when features unavailable
- No breaking changes to existing VSCode extension

## Constraints

- **Pike versions**: Must support 7.6, 7.8, 8.0.x, and forward-compatible with newer versions
- **Protocol**: JSON-RPC over stdin/stdout cannot change
- **Compatibility**: Existing VSCode extension must work without modification
- **File locations**: pike-scripts/ directory, bundled into extension
- **Testing**: Should enable module-level testing without full server

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use LSP.pmod/ directory structure | Follows Pike stdlib conventions; clean namespace separation | — Pending |
| Create Compat.pmod for version handling | Centralized feature detection and polyfills; easier maintenance | — Pending |
| Keep main analyzer.pike as entry point | Minimal changes to bridge; JSON-RPC routing stays in familiar place | — Pending |
| Four module files (Parser, Intelligence, Analysis, Cache) | Balanced granularity - not too many files, logical grouping | — Pending |
| Use #if constant() for feature detection | Pike stdlib pattern; works at compile time | — Pending |

---
*Last updated: 2025-01-19 after initialization*
