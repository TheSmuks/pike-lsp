# Improvement Backlog

## Critical (broken functionality)
- [x] **P0: Fix diagnostics-provider tests** - FIXED by worker-1. Mock infrastructure now properly implements triggerOnDidOpen, sendDiagnostics, etc.

## High (blocking/stale work)
- [x] **PR #28** - CLOSED without merging on 2026-02-13. Work lost. Auditing what remains.
- [x] **PR #30** - FIXED by worker-3. CI now passing.

## Medium (improvements)
- [ ] **Audit Roxen features** - IN PROGRESS (worker-2). Determining what was lost when PR #28 was closed.
- [ ] Convert remaining placeholder tests (Tier 1 priority: hover, completion, definition, references, document-symbol providers)
- [ ] Add Roxen support (module resolution, API completions, RXML) - may need to re-implement

## Low (nice to have)
- [ ] Performance improvements
- [ ] Missing LSP features (code actions, code lens, folding, semantic tokens)

## Completed
- [x] Fix mock infrastructure - added `onDidChangeConfiguration`, `triggerOnDidOpen`, `onDidOpen`, `onDidSave` to mocks
- [x] Fix build issue - removed broken `prebuild` script from package.json
- [x] Clean up all stale branches (12 local, 12 remote deleted)
