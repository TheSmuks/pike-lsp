---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/stdlib-index.ts
type: service
updated: 2026-01-21
status: active
---

# stdlib-index.ts

## Purpose

Manages lazy loading and LRU caching of Pike standard library modules with memory budget enforcement and negative cache for bootstrap modules that crash introspection.

## Exports

- **StdlibIndexManager**: Manages lazy loading, LRU eviction, and memory tracking for stdlib modules
- **StdlibModuleInfo**: Interface containing module path, symbols (lazy-loaded), resolved path, inheritance info, access metadata (timestamp, count, size)

## Dependencies

- [[constants/index.js]] (MAX_STDLIB_MODULES)
- @pike-lsp/pike-bridge (PikeBridge, IntrospectedSymbol, InheritanceInfo)

## Used By

TBD

## Notes

- Enforces 20MB memory budget for stdlib cache
- Negative cache prevents introspection of bootstrap modules (Stdio, String, Array, Mapping) that cause "Parent lost, cannot clone program" errors
- Tracks access statistics (hits, misses, evictions, negativeHits)
- LRU eviction when cache exceeds maxCacheSize or memory budget