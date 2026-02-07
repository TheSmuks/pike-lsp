# ADR-001: Use Parser.Pike Over Regex for Code Analysis

**Status:** active
**Area:** parsing
**Date:** 2025-12-01

## Context

Pike code needs to be tokenized and parsed for LSP features (symbols, hover, go-to-definition). Two approaches exist: regex-based parsing or Pike's built-in `Parser.Pike` module.

## Decision

Use `Parser.Pike.split()` and `Parser.Pike.tokenize()` for all Pike code analysis. Never use regex to parse Pike source code.

## Alternatives Rejected

- **Regex-based parsing** - Fragile. Cannot reliably handle nested strings, comments inside strings, multiline constructs, or Pike's complex syntax (e.g., `({})`, `(<>)`, backtick operators).
- **Tree-sitter** - No Pike grammar exists. Building one would be a major effort with no community support.

## Consequences

- All parsing logic lives in Pike (not TypeScript), executed via the bridge
- Parsing accuracy matches Pike's own compiler
- Performance depends on Pike subprocess round-trips

## Challenge Conditions

Revisit if:
- Parser.Pike proves too slow for real-time LSP use (>100ms per parse)
- A tree-sitter Pike grammar becomes available
- Pike 9.x changes the Parser.Pike API
