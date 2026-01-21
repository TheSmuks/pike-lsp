---
path: /home/smuks/OpenCode/pike-lsp/packages/vscode-pike/.vscode-test.mjs
type: config
updated: 2026-01-21
status: active
---

# .vscode-test.mjs

## Purpose

Configuration file for VSCode extension integration testing using @vscode/test-cli. Defines test runner settings for headless E2E tests including workspace setup, timeout, and environment variables.

## Exports

- **default** - Test configuration array for @vscode/test-cli
- **defineConfig** - Re-exported configuration builder from @vscode/test-cli

## Dependencies

@vscode/test-cli

## Used By

TBD

## Notes

- 120s timeout accommodates LSP initialization with Pike module loading
- `PIKE_LSP_TEST_MODE=true` enables Pike server debug logging to console
- Launch args disable GPU/sandbox for headless CI environments
- Targets compiled test files in `dist/test/integration/*.test.js`
- Uses TDD UI with mocha framework