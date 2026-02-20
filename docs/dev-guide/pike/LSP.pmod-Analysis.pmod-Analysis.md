---
id: pike-LSP.pmod-Analysis.pmod-Analysis
title: LSP.pmod/Analysis.pmod/Analysis.pike
description: Development guide for LSP.pmod/Analysis.pmod/Analysis.pike
---

# LSP.pmod/Analysis.pmod/Analysis.pike

## Overview

Analysis.pike - Delegating analysis class for Pike LSP

This class forwards requests to specialized handlers in the Analysis module:

- Diagnostics.pike: Uninitialized variable analysis

- Completions.pike: Completion context analysis

- Variables.pike: Find identifier occurrences

It also handles request consolidation (analyze with include=["..."])

Private handler instances (created on first use)

Static environment info (computed once)

Create a new Analysis instance

Get or create the diagnostics handler

Get or create the completions handler

Get or create the variables handler

Get static environment info

Analyze code for potentially uninitialized variable usage

Delegates to Diagnostics class in Analysis.pmod/

Get completion context at a specific position

Delegates to Completions class in Analysis.pmod/

PERF-003: Get completion context using pre-tokenized input

Delegates to Completions class in Analysis.pmod/

Find all identifier occurrences

Delegates to Variables class in Analysis.pmod/

Get CompilationCache from module-level singleton

Unified analyze handler

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `Analysis` | class | 10 |
| `create` | function | 19 |
| `get_diagnostics_handler` | function | 25 |
| `get_completions_handler` | function | 36 |
| `get_variables_handler` | function | 47 |
| `get_static_env_info` | function | 58 |
| `handle_analyze_uninitialized` | function | 69 |
| `handle_get_completion_context` | function | 79 |
| `handle_get_completion_context_cached` | function | 89 |
| `handle_find_occurrences` | function | 103 |
| `get_compilation_cache` | function | 113 |
| `handle_analyze` | function | 121 |
| `capture_compile_error` | function | 243 |

