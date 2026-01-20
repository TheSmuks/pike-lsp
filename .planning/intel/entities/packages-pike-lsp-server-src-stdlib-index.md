---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/stdlib-index.ts
type: service
updated: 2025-01-20
status: active
---

# stdlib-index.ts

## Purpose

Manages lazy on-demand loading of Pike standard library modules with LRU caching and 20MB memory budget. Prevents expensive stdlib introspection until modules are actually needed, then caches results with access tracking.

## Exports

- `StdlibIndexManager` - Main class managing stdlib module cache
- `StdlibModuleInfo` - Interface for cached module with symbols, inheritance, and access statistics

## Dependencies

- [[packages-pike-bridge-src-types]] - IntrospectedSymbol, InheritanceInfo, StdlibResolveResult types
- [[packages-pike-bridge-src-bridge]] - PikeBridge for module resolution
- [[packages-pike-lsp-server-src-constants-index]] - MAX_STDLIB_MODULES constant

## Used By

TBD

## Notes

Uses negative cache to avoid repeated lookups of non-existent modules. Preloads common modules (Stdio, Array, String, Mapping) on demand. Tracks hit rate and eviction statistics.
