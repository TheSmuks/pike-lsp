# ADR-002: Target Pike 8.0.1116

**Status:** active
**Area:** compat
**Date:** 2025-12-01

## Context

Pike has multiple versions (7.8, 8.0, 8.1, 9.0). APIs differ significantly between versions. The LSP needs a stable target.

## Decision

Target Pike 8.0.1116 as the minimum supported version. Do not use APIs introduced after 8.0.

Key implications:
- Use `String.trim_all_whites()` not `String.trim()` (unavailable in 8.0)
- Use `LSP.Compat` module for version-dependent functionality
- Test against 8.0.1116 in CI

## Alternatives Rejected

- **Pike 8.1+** - Not widely deployed. Would exclude most existing Pike users.
- **Multi-version support** - Complex, doubles testing surface. Compat module handles edge cases.

## Consequences

- Must check `/usr/local/pike/8.0.1116/lib/` for available APIs
- Some newer Pike features are unavailable
- Broader compatibility with existing Pike installations

## Challenge Conditions

Revisit if:
- Pike 8.1+ becomes the dominant deployed version
- A critical feature requires newer APIs with no workaround
