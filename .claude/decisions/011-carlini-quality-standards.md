# ADR-011: Carlini Quality Standards for All New Code

**Status:** active
**Area:** workflow
**Date:** 2026-02-07
**Inspired by:** "Building a C compiler with parallel Claudes" - Anthropic (Nicholas Carlini)

## Context

The agent team protocols (hooks, test-agent.sh, ADRs) enforce quality on existing workflows. But new features, tests, and scripts can still regress on quality if agents don't know the standards. This ADR codifies the Carlini principles as mandatory for all future work.

## Decision

All new code, tests, scripts, and agent output MUST follow these principles:

### 1. Agent-Friendly Output

- Scripts MUST log verbose output to files, not stdout
- Stdout output MUST be compact and grep-friendly: `ERROR: [context] message`
- No Electron/dbus/framework noise in agent-visible output
- Use `scripts/test-agent.sh` patterns as the reference implementation

### 2. Honest Tests (No Inflation)

- New tests MUST have real assertions (not `assert.ok(true)`)
- Use `test.skip('description')` for planned-but-unimplemented tests
- Each test MUST verify specific behavior, not just "doesn't crash"
- Assertion messages MUST say what's broken: `'Should return hover data (not null) - LSP hover feature may be broken'`
- Enforced by: `.claude/hooks/test-integrity-gate.sh`

### 3. Context Window Discipline

- Do NOT print full file contents to stdout when a summary suffices
- Do NOT re-run full test suites repeatedly - use `--fast` for iteration
- Do NOT dump stack traces when a one-line error suffices
- Log details to `.omc/test-logs/` or temp files, reference by path

### 4. Regression Prevention

- Every commit runs fast regression tests (`.husky/pre-commit`)
- Every push runs full suite including E2E (`.husky/pre-push`)
- New features MUST include tests that would catch regression if the feature breaks
- Enforced by: pre-commit and pre-push hooks

### 5. Failed Approach Logging

- When an approach fails, log it in `STATUS.md` "Failed Approaches" section
- Include: what was tried, why it failed, what to do instead
- This prevents future agents from repeating dead-end experiments

### 6. Orient Before Working

- Read `STATUS.md` and decision index before starting any task
- Check `scripts/task-lock.sh list` to avoid duplicate work
- Run `scripts/test-agent.sh --fast` to confirm baseline is green
- Enforced by: `.claude/hooks/decisions-inject.sh` (injects index every prompt)

### 7. Leave Breadcrumbs

- Update `STATUS.md` before stopping work
- Unlock tasks: `scripts/task-lock.sh unlock "task-name"`
- Commit breadcrumbs so the next agent can pick up where you left off

## Alternatives Rejected

- **Trust agents to follow guidelines without enforcement** - Agents consistently skip guidelines after a few context window rotations. Hooks and injection enforce compliance.
- **Enforce only at PR review** - Too late. Quality should be maintained during development, not just at merge time.

## Consequences

- Every agent, every session, follows the same quality bar
- Test quality only improves over time (never regresses)
- Agent context windows stay clean and efficient
- New agents can orient quickly via STATUS.md and decision index

## Challenge Conditions

Revisit if:
- Hooks are too slow (>5s per tool call) and need optimization
- Standards are too strict for rapid prototyping phases
- A new Carlini-style insight suggests different principles
