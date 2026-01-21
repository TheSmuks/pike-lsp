---
path: /home/smuks/OpenCode/pike-lsp/packages/vscode-pike/src/test/integration/lsp-features.test.ts
type: test
updated: 2026-01-21
status: active
---

# lsp-features.test.ts

## Purpose

E2E integration tests that verify LSP features work end-to-end from VSCode through the LSP server and Pike bridge to detect regressions where features return null/undefined.

## Exports

None (test suite)

## Dependencies

- vscode
- assert

## Used By

TBD

## Notes

Tests require 15+ second LSP initialization delay and use a pre-existing test.pike fixture file to avoid URI scheme issues that prevent LSP document caching.