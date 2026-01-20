---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/tests/smoke.test.ts
type: test
updated: 2026-01-20
status: active
---

# smoke.test.ts

## Purpose

Fast validation tests for core LSP functionality, used by pre-push hooks and CI to ensure PikeBridge communication works before pushing changes.

## Exports

None

## Dependencies

- node:test
- node:assert/strict
- @pike-lsp/pike-bridge

## Used By

TBD

## Notes

Tests parse, introspect, and compile requests through PikeBridge, ensuring the bridge stays alive across multiple requests and handles invalid Pike syntax gracefully without crashing. Each test suppresses stderr output during execution.