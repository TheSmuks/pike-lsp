# Phase 1: Foundation - Context

**Gathered:** 2026-01-19
**Status:** Ready for planning

## Phase Boundary

Establish LSP.pmod directory structure with shared utilities (module.pmod, Compat.pmod, Cache.pmod, Logging.pmod, Protocol.pmod), version compatibility layer, and cache infrastructure that all subsequent modules depend on. This phase builds foundational infrastructure — the plumbing that other modules will use.

## Implementation Decisions

### Version Detection Strategy

- **Detection method:** Use `constant(__VERSION__)` (actually `__REAL_VERSION__`) for compile-time version detection
- **Unsupported version behavior:** Graceful degradation — attempt to provide basic functionality even on unsupported versions
- **Feature exposure:** Prefer conditional functions as primary API (e.g., `Compat.trim_whites()` always exists), supplemented with feature flags when native vs polyfill has meaningful performance differences
- **Version transparency:** Expose version constants for diagnostics (`Compat.PIKE_VERSION`, `Compat.PIKE_VERSION_STRING`) — invaluable for bug reports and `--version` flag

### Cache Eviction Policy

- **Eviction strategy:** Strict LRU — evict exactly one least-recently-used item per insertion
- **Size limits:** Configurable per cache instance — caller can specify limits when creating cache
- **Invalidation:** Manual invalidation only — LSP protocol already notifies when files change, mtime checking would be redundant
- **Statistics:** Minimal stats — expose hit rate, miss rate, and current size for monitoring/debugging

### Debug Logging Interface

- **Enable mechanism:** Both environment variable (`LSP_DEBUG=1`) for development and JSON-RPC `initialize` request (`debug` flag in `options`) for client control
- **Output destination:** stderr + optional file — stderr is correct default (stdout is JSON-RPC channel), but optionally also write to file for user bug reports
- **Log levels:** Standard levels — DEBUG, INFO, WARN, ERROR (familiar to developers)
- **Message format:** Always include timestamps and source location (timestamp + file:line prefix on every message)

### Module Loading Approach

- **Directory structure:** Flat with .pike files following Pike stdlib idioms
  - `LSP.pmod/` (package marker)
  - `LSP/module.pmod` (main entry point, compile-time setup, API surface)
  - `LSP/Compat.pmod` (version compatibility)
  - `LSP/Cache.pmod` (caching infrastructure)
  - `LSP/Logging.pmod` (logging utilities)
  - `LSP/Protocol.pmod` (JSON-RPC/LSP protocol helpers)
  - `LSP/Initialize.pike`, `LSP/Completion.pike`, etc. (handler classes as .pike files)
- **module.pmod structure:** Primary API surface with compile-time setup — constants, enums, `#if` compatibility shims, small utility functions, and re-exports of complex classes. Runtime initialization stays in the program entry point.
- **Failure modes:** Module-specific strategies
  - Cache: Degrade gracefully (optimization only, LSP functional without it)
  - Protocol: Throw immediately (can't do JSON-RPC → can't be an LSP)
  - Logging (file): Degrade to stderr (core logging works, file is optional)
  - Parser: Throw immediately (can't parse → can't provide completions)
- **Circular dependencies:** No enforcement — trust developers to avoid circular imports; Pike will error anyway

### LSP Architecture Specification

**Handler Dispatch:**
- Use explicit method-to-handler mapping in Protocol.pmod
- Static mapping — LSP methods are well-defined and finite
- Each handler is a separate class instantiated per request

**Shared State:**
- Introduce a Context object that holds all shared resources: caches, logger, client capabilities
- Pass this Context to every handler's entry point
- Handlers never access global state directly

**Error Isolation:**
- Protocol layer wraps all handler invocations
- If a handler throws, log the error and return a JSON-RPC internal error response
- Server continues running — a single bad request never crashes the LSP

**Logging Separation:**
- Logging is its own class (Logging.pmod)
- Manages log level, output destinations (stderr always, file optionally), message formatting (timestamps, source location)
- Context holds a logger instance

**Module Responsibilities:**

| Module | Responsibility |
|--------|----------------|
| module.pmod | Compat shims, version constants, re-exports |
| Context | Container for shared runtime state |
| Cache | LRU storage with configurable limits and stats |
| Logging | Level filtering, formatting, output routing |
| Protocol | JSON-RPC parsing, handler dispatch, error wrapping |
| Handlers | Request-specific logic, receive params + context, return response |

**Dependency Flow:**
```
module.pmod (top-level API)
    ↓
Protocol (orchestration)
    ↓
Context (shared state)
    ↓
Cache, Logging (infrastructure)
    ↓
Handlers (leaf nodes, no cross-dependencies)
```

- Handlers depend on Context
- Handlers never depend on each other
- Infrastructure modules never depend on handlers

### Claude's Discretion

- Exact LRU implementation details (doubly-linked list vs timestamp-based)
- File log rotation strategy (if needed)
- Specific error message wording
- Exact format of version string constants

## Specific Ideas

- Follow Pike stdlib idioms as seen in `Pike.pmod`, `Parser.pmod`, `Tools.pmod`
- `.pmod` for modules (collections of functions/constants/sub-modules)
- `.pike` for classes (handler classes like Completion.pike, Hover.pike)
- Compile-time setup in module.pmod, runtime configuration in program entry point
- Reference: `LSP/error("Cache allocation failed: %s", describe_error(err));` pattern

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 01-foundation*
*Context gathered: 2026-01-19*
