---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/constants/index.ts
type: config
updated: 2025-01-20
status: active
---

# index.ts

## Purpose

Centralized configuration values for Pike LSP server (MAINT-004). Defines performance limits, memory budgets, timeouts, and LSP protocol constants in one location.

## Exports

- `PARSER_MAX_ITERATIONS` - Maximum 10000 iterations for parser loops
- `BATCH_PARSE_MAX_SIZE` - Maximum 50 files per batch
- `VALIDATION_DELAY_DEFAULT` - 250ms debounce for document validation
- `MAX_CACHED_PROGRAMS` - Maximum 30 cached programs
- `MAX_STDLIB_MODULES` - Maximum 50 stdlib modules in cache
- `BRIDGE_TIMEOUT_DEFAULT` - 30000ms default timeout
- `MAX_DOCUMENT_CACHE_SIZE` - Maximum 100 cached documents
- `MAX_FILE_SIZE` - 1MB maximum file size to parse
- `TYPE_DB_MAX_MEMORY_BYTES` - 50MB type database limit
- `DEFAULT_MAX_PROBLEMS` - Maximum 100 diagnostics
- `DIAGNOSTIC_DELAY_DEFAULT` - 200ms diagnostic delay
- `LSP` - Object with MAX_COMPLETION_ITEMS, MAX_WORKSPACE_SYMBOLS, MAX_DOCUMENT_SYMBOLS, HOVER_CONTEXT_LINES, MAX_REFERENCES

## Dependencies

None

## Used By

TBD

## Notes

MAINT-004: Single source of truth prevents magic numbers and inconsistent configuration.
