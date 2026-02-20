---
id: pike-analyzer
title: analyzer.pike
description: Development guide for analyzer.pike
---

# analyzer.pike

## Overview

Pike LSP Analyzer Script

Lightweight JSON-RPC router that delegates to LSP modules:

- Parser.pike: parse, tokenize, compile, batch_parse

- Intelligence.pike: introspect, resolve, resolve_stdlib, get_inherited

- Analysis.pike: find_occurrences, analyze_uninitialized, get_completion_context,

get_completion_context_cached (PERF-003)

Protocol: JSON-RPC over stdin/stdout

Architecture: Dispatch table router with Context service container

============================================================================

CONTEXT SERVICE CONTAINER

============================================================================

Context class provides dependency injection for all LSP modules.

Per CONTEXT.md Module Instantiation decision:

- Singleton pattern - modules created once at startup

- Explicit initialization order (caches -&gt; parser -&gt; intelligence -&gt; analysis)

- Context passed to handlers via dispatch() function

============================================================================

DISPATCH TABLE ROUTER

============================================================================

Per CONTEXT.md Router Design Pattern:

- O(1) method lookup via constant mapping

- Each lambda receives (params, Context) for dependency injection

- Handlers delegate directly to module instances via ctx-&gt;module-&gt;handler()

- set_debug is handled inline (modifies Context, no module needed)

Note: HANDLERS is initialized in main() after module path is added

Dispatch function - routes method calls to appropriate handlers

Per CONTEXT.md: Single dispatch() function handles routing and error normalization

handle_request - entry point for JSON-RPC requests

Delegates to dispatch() function for routing

get_context - Lazy initialization of Context service container

Creates Context only on first request, deferring Parser/Intelligence/Analysis

module loading until needed for startup optimization

get_compilation_cache - Get the CompilationCache instance

Initializes the cache if not already present in the Context

@param ctx The Context object

@returns The CompilationCache instance or 0 if unavailable

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `Context` | class | 41 |
| `MAX_TOP_LEVEL_ITERATIONS` | constant | 16 |
| `MAX_BLOCK_ITERATIONS` | constant | 17 |
| `BUILD_ID` | constant | 23 |
| `debug` | function | 25 |
| `create` | function | 50 |
| `dispatch` | function | 103 |
| `get_compilation_cache` | function | 183 |
| `main` | function | 191 |
| `__eval` | function | 351 |
| `create` | function | 597 |
| `start` | function | 598 |
| `stop` | function | 599 |

