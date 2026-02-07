# ADR-009: Agent-Oriented Testing (Carlini Protocol)

**Status:** active
**Area:** testing
**Date:** 2026-02-07
**Inspired by:** "Building a C compiler with a team of parallel Claudes" - Nicholas Carlini, Anthropic

## Context

Tests serve a dual purpose: verifying code correctness AND guiding autonomous agents. When agents run tests, they need compact, actionable output - not verbose human-readable logs. Agents also waste time running full suites when a quick regression check would suffice.

## Decision

Adopt the Carlini testing philosophy across all agent protocols:

### 1. Tests are the agent's primary guidance mechanism
Tests define what "progress" means. Without high-quality tests, agents solve the wrong problems.

### 2. Agent-friendly output
- Print ERROR: prefix on failure lines (grep-friendly)
- Log verbose output to files, not stdout (prevents context pollution)
- Pre-compute summary statistics (pass/fail counts)
- Keep output under 50 lines for any single test run

### 3. Fast mode for regression checks
- `--fast` flag runs smoke tests in <30 seconds
- Full suite runs only before commits/pushes
- Deterministic subset per agent, random across agents

### 4. STATUS.md as agent orientation
- Git-tracked file agents read on startup and update before stopping
- Contains: current state, failing tests, known issues, failed approaches
- Prevents agents from repeating failed strategies across sessions

### 5. Task locking for parallel work
- File-based locks prevent duplicate work across parallel agents
- Lock before starting, unlock when done
- Stale lock cleanup after 2 hours

## Alternatives Rejected

- **Verbose test output** - Pollutes agent context window with thousands of useless bytes
- **No fast mode** - Agents spend hours running full suites instead of making progress
- **No progress tracking** - Each agent starts from scratch, repeating failed approaches

## Consequences

- Agents can self-orient in <30 seconds
- Parallel agents never duplicate work
- Test failures are immediately actionable (ERROR lines)
- Context window stays clean for actual problem-solving

## Challenge Conditions

Revisit if:
- Test suite grows beyond 5 minutes for full run (need better sharding)
- STATUS.md becomes stale and misleading (need automated freshness checks)
- Task locking creates deadlocks (need timeout enforcement)
