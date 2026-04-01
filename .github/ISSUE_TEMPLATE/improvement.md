---
name: Improvement
about: Suggest an improvement to the project
title: 'imp: '
labels: enhancement
assignees: ''
---

## Improvement Type

- [ ] Performance - Speed, memory, or efficiency improvement
- [ ] Code Quality - Refactoring, reducing complexity
- [ ] Test Coverage - Adding or improving tests
- [ ] Documentation - Improving docs or comments
- [ ] User Experience - Better error messages, usability

## Required Labels

Add exactly one priority label and exactly one type label before submitting.

Examples:

- Priority: `P0-broken`, `P1-tests`, `P2-feature`, `P3-refactor`, or `P4-perf`
- Type: `type:bug`, `type:feature`, `type:performance`, `type:test`, `type:tech-debt`, or `type:docs`

## Description

<!-- What needs improvement and why -->

## Problem

<!-- Describe the current state — what is wrong or missing -->

## Expected Behavior

<!-- What should happen instead -->

## Suggested Approach

<!-- Concrete steps or pointers to relevant files/functions -->

## Affected Files

<!-- List files or packages likely involved -->

## Acceptance Criteria

- [ ] Code change implemented
- [ ] Tests added/updated
- [ ] TypeScript compiles: `bun run typecheck`
- [ ] Smoke tests pass: `scripts/test-agent.sh --fast`
- [ ] No regression in existing tests

## Environment

- Pike binary: <!-- output of: pike --version -->
- Bun version: <!-- output of: bun --version -->
- $PIKE_SRC set: <!-- YES/NO -->
- $ROXEN_SRC set: <!-- YES/NO -->
