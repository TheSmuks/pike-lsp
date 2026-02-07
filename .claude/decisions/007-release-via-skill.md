# ADR-007: Release Only Via pike-lsp-release Skill

**Status:** active
**Area:** release
**Date:** 2026-02-07

## Context

Agents bypassed the release protocol (version sync, changelog, readme check) by running `git push` and `git tag` directly, causing broken releases.

## Decision

A PreToolUse hook blocks all direct `git push` to main and `git tag` creation. The only way to release is through the `/pike-lsp-release` skill, which handles the full protocol.

## Alternatives Rejected

- **Documentation only** - Agents don't follow docs consistently
- **Pre-push git hook** - Only catches at push time, not at the agent decision point
- **CI validation only** - Too late, already pushed broken state

## Consequences

- Releases always follow the full protocol
- Agents can't "quick push" to main
- Feature branch pushes are unrestricted
- The release skill is the single entry point for all releases

## Challenge Conditions

Revisit if:
- The release skill becomes a bottleneck for rapid iteration
- CI validation becomes robust enough to catch all issues post-push
