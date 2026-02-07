# ADR-010: Project-Specific Agent Roles

**Status:** active
**Area:** workflow
**Date:** 2026-02-07
**Inspired by:** Carlini's parallel Claude agents with specialized roles

## Context

Carlini's C compiler project used specialized agents: one for code quality, one for documentation, one for performance, one for design critique. LLM-written code frequently re-implements existing functionality and drifts in quality without dedicated reviewers.

## Decision

Define 5 project-specific agent roles for pike-lsp. These are personas agents adopt when spawned for specific tasks, NOT separate running processes.

### Role Definitions

**1. Builder** (default role)
- Implements features and fixes bugs
- Follows TDD, uses test-agent.sh for regression checks
- Locks tasks before starting, unlocks when done

**2. Quality Guardian**
- Finds and coalesces duplicate code
- Ensures consistent patterns across TypeScript and Pike
- Reviews for anti-patterns defined in CLAUDE.md
- Trigger: run periodically or after large feature merges

**3. Documentation Keeper**
- Keeps README.md, STATUS.md, CHANGELOG.md in sync with code
- Updates CLAUDE.md when patterns change
- Ensures ADRs are current (challenges outdated ones)
- Trigger: before releases or after significant changes

**4. Performance Agent**
- Runs benchmarks, profiles bottlenecks
- Optimizes Pike subprocess round-trips
- Tracks performance in CHANGELOG.md Optimization sections
- Trigger: after feature completion, before releases

**5. Pike Critic**
- Reviews code from a Pike developer's perspective
- Ensures Pike stdlib is used (not reinvented)
- Validates Pike 8.0.1116 compatibility
- Checks that Parser.Pike is used over regex
- Trigger: after any Pike code changes

## Alternatives Rejected

- **Always-running agents** - Too expensive. Roles are adopted on-demand.
- **No specialization** - Generic agents miss domain-specific issues.

## Consequences

- Agents have clear scope when spawned for specific tasks
- Quality doesn't drift between sessions
- Documentation stays in sync automatically
- Pike-specific patterns are validated by a specialist

## Challenge Conditions

Revisit if:
- Roles overlap too much (merge them)
- A role is never used (remove it)
- New domain needs arise (add roles)
