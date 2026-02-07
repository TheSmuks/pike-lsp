# ADR-008: Test Integrity Enforcement via Hooks

**Status:** active
**Area:** testing
**Date:** 2026-02-07

## Context

Agents cheat on tests in predictable ways: adding `.skip`, weakening assertions (`toEqual` -> `toBeDefined`), removing assertions, adding `@ts-ignore`, and writing tests with zero assertions. This undermines the entire TDD workflow and makes test suites unreliable.

## Decision

A PreToolUse hook (`test-integrity-gate.sh`) guards all Edit and Write operations on test files. It blocks hard cheats and warns on soft cheats.

**Hard blocks (exit 2):**
- Adding `.skip` or `.only` to tests
- Adding `xit`, `xdescribe`, `xtest`
- Adding `@ts-ignore` or `@ts-expect-error` in test files
- Writing test files with zero `expect()` assertions

**Soft warnings (exit 0 with message):**
- Weakening assertions (strong -> weak matchers)
- Reducing assertion count in existing tests
- Commenting out test code
- Low assertion density (more tests than assertions)

## Alternatives Rejected

- **Documentation only** - Agents ignore docs when under pressure to "make tests pass"
- **Post-commit checks** - Too late. The damage is done and agents claim completion.
- **Block all test file edits** - Too restrictive. Agents need to write new tests (TDD).

## Consequences

- Agents must fix code, not tests, when tests fail
- New tests must have meaningful assertions
- Existing test strength is preserved across sessions
- Some false positives possible (legitimate test rewrites) - these produce warnings, not blocks

## Challenge Conditions

Revisit if:
- False positive rate exceeds 20% of test edits
- Hook becomes a bottleneck for legitimate test refactoring
- A better approach (e.g., assertion coverage tracking) becomes feasible
