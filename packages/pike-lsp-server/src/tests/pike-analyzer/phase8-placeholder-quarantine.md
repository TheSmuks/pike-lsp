# Phase 8 placeholder suite quarantine (issue #910)

## Scope

- Removed `src/tests/pike-analyzer/parser.test.ts` from default test discovery.
- Removed placeholder-only suites from `src/tests/pike-analyzer/analysis.test.ts`:
  - `Phase 8 Task 42.2: Analysis - Completions Context`
  - `Phase 8 Task 42.3: Analysis - Variables`
  - `Phase 8 Task 42: Analysis Test Summary`

## Why

These suites used `describe.skip` and mostly asserted hardcoded mock values rather than analyzer behavior. Keeping them in the test tree made CI look healthier than the implemented surface.

## Policy alignment

This change follows the repository testing rule that passing tests must verify real behavior (no vacuous placeholder coverage).

## Follow-up

Reintroduce coverage only when there is callable analyzer API for completions and occurrences, with assertions against real PikeBridge/Pike analyzer responses.
