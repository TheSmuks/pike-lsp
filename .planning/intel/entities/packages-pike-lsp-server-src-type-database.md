---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/type-database.ts
type: service
updated: 2025-01-20
status: active
---

# type-database.ts

## Purpose

Central storage for compiled program information and type inferences. Manages program cache, cross-file symbol index, inheritance hierarchy graph, and type inference cache with a 50MB memory budget enforced via LRU eviction.

## Exports

- `TypeDatabase` - Main class managing all type information storage
- `CompiledProgramInfo` - Interface for document's compiled program data
- `SymbolLocation` - Cross-reference linking symbol to its source URI
- `InferenceContext` - Context for type inference operations
- `TypeDatabase.estimateProgramSize()` - Static method to estimate memory footprint

## Dependencies

- [[packages-pike-bridge-src-types]] - IntrospectedSymbol and InheritanceInfo types
- [[packages-pike-lsp-server-src-constants-index]] - TYPE_DB_MAX_MEMORY_BYTES constant

## Used By

TBD

## Notes

Enforces 50MB memory budget by evicting oldest programs when limit exceeded. Programs stored with separate Maps for symbols, functions, variables, and classes for efficient lookup.
