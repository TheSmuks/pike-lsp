---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/process.test.ts
type: test
updated: 2026-01-20
status: active
---

# process.test.ts

## Purpose

Unit tests for PikeProcess IPC mechanics, using mock subprocess pattern to test without requiring actual Pike installation.

## Exports

None

## Dependencies

- [[process]] - PikeProcess class under test
- node:test - Test runner and mocking utilities
- node:assert/strict - Assertion library
- events - EventEmitter for mock implementation

## Used By

TBD

## Notes

Contains `MockPikeProcess` class that simulates ChildProcess behavior for isolated testing. Tests cover message events, stderr, error handling, kill operations, and send failures.