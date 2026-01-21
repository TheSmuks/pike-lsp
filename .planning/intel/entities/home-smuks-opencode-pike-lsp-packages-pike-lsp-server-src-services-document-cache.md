---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/services/document-cache.ts
type: service
updated: 2026-01-20
status: active
---

# document-cache.ts

## Purpose

Manages in-memory cache of parsed document symbols and diagnostics for O(1) lookup by URI during LSP session.

## Exports

- `DocumentCache` - Map-based cache for DocumentCacheEntry objects with get/set/delete/has/clear/entries/keys/size methods

## Dependencies

- [[core/types]]
- @pike-lsp/pike-bridge
- vscode-languageserver/node

## Used By

TBD

## Notes

Extracted from server.ts to enable modular feature handlers. Wraps a native Map<string, DocumentCacheEntry> with convenience methods.