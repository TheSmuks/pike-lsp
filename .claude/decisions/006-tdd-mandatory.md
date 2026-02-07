# ADR-006: TDD Mandatory for All Features and Fixes

**Status:** active
**Area:** testing
**Date:** 2025-12-01

## Context

Agents sometimes write implementation code without tests, leading to regressions and untestable code.

## Decision

TDD is mandatory: RED (write failing test) -> GREEN (minimal implementation) -> REFACTOR. No exceptions for features or bug fixes.

Exempt: documentation, config changes, pure refactoring with existing coverage.

## Alternatives Rejected

- **Test-after** - Agents skip tests when "done". TDD ensures tests exist before implementation.
- **No testing requirement** - Regressions compound across sessions. Future agents can't verify their changes.

## Consequences

- Every feature has at least one test from day one
- Bug fixes include regression tests
- Slower initial development, much faster iteration long-term
- Target 80%+ coverage on changed files

## Challenge Conditions

Revisit if:
- TDD overhead exceeds 40% of development time
- Test infrastructure becomes unreliable
