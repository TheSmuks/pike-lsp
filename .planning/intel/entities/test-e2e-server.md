---
path: /home/smuks/OpenCode/pike-lsp/test-e2e-server.js
type: test
updated: 2025-01-20
status: active
---

# test-e2e-server.js

## Purpose

End-to-end smoke test that verifies the LSP server starts without crashes or timeouts. Simulates VSCode extension startup by spawning the server, sending initialize request, and monitoring for errors.

## Exports

None - Standalone test script executed directly

## Dependencies

- child_process - Spawns LSP server process
- [[packages-pike-lsp-server-dist-server]] - Server module under test

## Used By

TBD

## Notes

Waits 45 seconds to catch timeout issues. Checks for timeout/crash indicators in output. Exits with code 1 on critical errors, 0 on success.
