# Phase 12: Request Consolidation - Research

**Researched:** 2026-01-22
**Domain:** Pike LSP - IPC optimization, Pike-to-TypeScript bridge, unified analysis API
**Confidence:** HIGH

## Summary

This phase consolidates multiple Pike IPC calls during document validation into a single unified `analyze` request. Currently, the validation pipeline makes **3 separate Pike calls** per document change:
1. `introspect` - Compiles code and extracts type information via `_typeof` introspection
2. `parse` - Parses code using `Tools.AutoDoc.PikeParser` for symbol positions
3. `analyze_uninitialized` - Tokenizes and analyzes for uninitialized variable usage

Each call incurs IPC overhead (~0.1-0.5ms) and critically, **all three methods recompile the same Pike code**. The consolidated approach will compile once, compute all results, and return them together.

**Primary recommendation:** Implement a unified `analyze` method in Pike that accepts an array of requested result types and returns all computed data in a single response. Existing methods become thin wrappers for backward compatibility.

## Current State Analysis

### Files That Must Change

| File | Current Role | Change Required |
|------|--------------|-----------------|
| `pike-scripts/analyzer.pike` | JSON-RPC router with HANDLERS dispatch table | Add `analyze` handler, add wrapper methods for backward compatibility |
| `pike-scripts/LSP.pmod/Parser.pike` | `parse_request()` returns symbols+diagnostics | May need to share tokenization results |
| `pike-scripts/LSP.pmod/Intelligence.pike` | `handle_introspect()` compiles and introspects | Compile once, share compiled program |
| `pike-scripts/LSP.pmod/Analysis.pike` | Delegates to Diagnostics.pmod | Add unified analysis handler |
| `pike-scripts/LSP.pmod/Analysis.pmod/Diagnostics.pike` | `handle_analyze_uninitialized()` tokenizes | Reuse tokenization from parser |
| `packages/pike-bridge/src/bridge.ts` | `introspect()`, `parse()`, `analyzeUninitialized()` methods | Add `analyze()` method, update TypeScript types |
| `packages/pike-bridge/src/types.ts` | `PikeRequest`, `PikeResponse` type definitions | Add unified request/response types |
| `packages/pike-lsp-server/src/features/diagnostics.ts` | `validateDocument()` calls 3 Pike methods | Call `analyze()` once, cache and distribute results |
| `packages/pike-lsp-server/src/services/bridge-manager.ts` | Pass-through methods for each Pike operation | Add `analyze()` method |

### Current Validation Pipeline Flow

```typescript
// From packages/pike-lsp-server/src/features/diagnostics.ts
async function validateDocument(document: TextDocument): Promise<void> {
    // THREE separate Pike calls:

    // 1. Introspect - compiles code, extracts type info via _typeof
    const introspectResult = await bridge.introspect(text, filename);
    // Returns: { success, symbols, functions, variables, classes, inherits, diagnostics }

    // 2. Parse - parses code using Tools.AutoDoc.PikeParser for positions
    const parseResult = await bridge.parse(text, filename);
    // Returns: { symbols, diagnostics }

    // 3. Analyze uninitialized - tokenizes and analyzes
    const uninitResult = await bridge.analyzeUninitialized(text, filename);
    // Returns: { diagnostics }

    // Results are merged, cached, and sent to client
}
```

**Problem:** Each of these methods independently:
- Compiles the same Pike code (`compile_string()` or master()->resolv())
- Tokenizes the same code (`Parser.Pike.split()` + `Parser.Pike.tokenize()`)
- Triggers separate IPC round-trips

### Existing JSON-RPC Methods to Wrap

| Method | Location | Current Signature | Wrapper Strategy |
|--------|----------|-------------------|------------------|
| `introspect` | `Intelligence.pike` | `(code, filename) -> IntrospectionResult` | Call `analyze({include: ["introspect"]})`, extract introspect result |
| `parse` | `Parser.pike` | `(code, filename, line) -> ParseResult` | Call `analyze({include: ["parse"]})`, extract parse result |
| `analyze_uninitialized` | `Analysis.pmod/Diagnostics.pike` | `(code, filename) -> AnalyzeUninitializedResult` | Call `analyze({include: ["diagnostics"]})`, extract diagnostics |
| `tokenize` | `Parser.pike` | `(code) -> {tokens}` | Call `analyze({include: ["tokenize"]})` (optional) |
| `compile` | `Parser.pike` | `(code, filename) -> {symbols, diagnostics}` | Already similar to `parse`, may merge with parse |

## Standard Stack

### Core (No additional dependencies needed)

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Pike `Parser.Pike` | Built-in | Tokenization and parsing | Only way to accurately tokenize Pike code |
| Pike `Tools.AutoDoc.PikeParser` | Built-in | Symbol extraction with positions | Already used, provides AST-level info |
| Pike `compile_string()` | Built-in | Code compilation for introspection | Required for type extraction |
| Pike `_typeof` operator | Built-in | Runtime type introspection | Only way to extract function signatures |
| Pike `master()->resolv()` | Built-in | Module resolution | Standard Pike module loading |

### Supporting

| Component | Version | Purpose | When to Use |
|-----------|---------|---------|-------------|
| `LSP.Cache` | Existing | In-memory caching of compiled programs | Cache compiled code during analysis to avoid recompilation |
| `LSP.Compat` | Existing | Pike version compatibility helpers | Use `trim_whites()` for string operations |

### New Types Needed

```typescript
// Unified analyze request
export interface AnalyzeRequest {
    code: string;
    filename?: string;
    include: Array<'parse' | 'introspect' | 'diagnostics' | 'tokenize'>;
}

// Unified analyze response with partial success support
export interface AnalyzeResponse {
    result?: {
        parse?: PikeParseResult;
        introspect?: IntrospectionResult;
        diagnostics?: AnalyzeUninitializedResult;
        tokenize?: { tokens: PikeToken[] };
    };
    failures?: {
        parse?: { message: string; kind: string };
        introspect?: { message: string; kind: string };
        diagnostics?: { message: string; kind: string };
        tokenize?: { message: string; kind: string };
    };
    _perf?: {
        pike_total_ms: number;
        compilation_ms?: number;
        tokenization_ms?: number;
    };
}
```

## Architecture Patterns

### Recommended Pike Structure

```
pike-scripts/
├── analyzer.pike          # Add 'analyze' handler, wrap existing handlers
└── LSP.pmod/
    ├── Parser.pike         # Extract tokenization for sharing
    ├── Intelligence.pike   # Extract compilation for sharing
    ├── Analysis.pike       # Add handle_analyze() unified handler
    └── Analysis.pmod/
        └── Diagnostics.pike # Accept pre-tokenized input (optional)
```

### Pattern 1: Unified Analysis Handler

**What:** A new `handle_analyze()` method that orchestrates all analysis types

**When to use:** As the primary entry point for document validation

**Implementation approach:**

```pike
// In LSP.pmod/Analysis.pike or new LSP.pmod/Consolidated.pike
mapping handle_analyze(mapping params) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";
    array(string) include = params->include || ({});

    mapping result = ([]);
    mapping failures = ([]);

    // Shared state across all analyses
    string preprocessed = "";
    array tokens = ({});
    program compiled_prog = 0;
    array compilation_diagnostics = ({});

    // Step 1: Tokenize (if needed by any requested analysis)
    if (has_value(include, "parse") || has_value(include, "diagnostics")) {
        mixed err = catch {
            array(string) split_tokens = Parser.Pike.split(code);
            tokens = Parser.Pike.tokenize(split_tokens);
        };
        if (err) {
            failures->parse = (["message": describe_error(err), "kind": "TokenizationError"]);
            failures->diagnostics = (["message": describe_error(err), "kind": "TokenizationError"]);
        }
    }

    // Step 2: Compile (if needed for introspection)
    if (has_value(include, "introspect") && !failures->introspect) {
        mixed err = catch {
            // Use same compilation logic as handle_introspect
            compiled_prog = compile_string(code, filename);
        };
        if (err) {
            failures->introspect = (["message": describe_error(err), "kind": "CompilationError"]);
        }
    }

    // Step 3: Generate results based on requests

    // Parse result
    if (has_value(include, "parse")) {
        if (!failures->parse) {
            // Reuse tokens or call Parser.pike
            // TODO: Need to refactor Parser.pike to accept pre-tokenized input
            // For now, delegate to existing parse_request with code
            result->parse = ctx->parser->parse_request(params);
        }
    }

    // Introspect result
    if (has_value(include, "introspect")) {
        if (!failures->introspect && compiled_prog) {
            // Reuse compiled_prog for introspection
            // TODO: Need to refactor Intelligence.pike to accept pre-compiled program
            result->introspect = introspect_program(compiled_prog);
        }
    }

    // Diagnostics result (uninitialized variables)
    if (has_value(include, "diagnostics")) {
        if (!failures->diagnostics) {
            // Reuse tokens for uninitialized analysis
            // TODO: Need to refactor Diagnostics.pike to accept pre-tokenized input
            result->diagnostics = analyze_uninitialized_with_tokens(tokens, code, filename);
        }
    }

    return ([
        "result": sizeof(result) > 0 ? result : 0,
        "failures": sizeof(failures) > 0 ? failures : 0,
    ]);
}
```

### Pattern 2: Backward Compatibility Wrappers

**What:** Existing methods become thin wrappers calling `analyze`

**When to use:** Maintain API compatibility for external consumers

**Implementation approach:**

```pike
// In analyzer.pike HANDLERS table:
HANDLERS = ([
    // Existing handlers become wrappers
    "introspect": lambda(mapping params, object ctx) {
        // Deprecation warning
        werror("[DEPRECATED] introspect is deprecated, use analyze with include=[\"introspect\"]\n");

        // Call analyze with just introspect
        mapping analyze_params = params + (["include": ({"introspect"})]);
        mapping response = ctx->analysis->handle_analyze(analyze_params);

        // Extract just the introspect result for backward compatibility
        if (response->result && response->result->introspect) {
            return (["result": response->result->introspect]);
        }
        return response;  // Pass through errors
    },

    "parse": lambda(mapping params, object ctx) {
        werror("[DEPRECATED] parse is deprecated, use analyze with include=[\"parse\"]\n");

        mapping analyze_params = params + (["include": ({"parse"})]);
        mapping response = ctx->analysis->handle_analyze(analyze_params);

        if (response->result && response->result->parse) {
            return (["result": response->result->parse]);
        }
        return response;
    },

    "analyze_uninitialized": lambda(mapping params, object ctx) {
        werror("[DEPRECATED] analyze_uninitialized is deprecated, use analyze with include=[\"diagnostics\"]\n");

        mapping analyze_params = params + (["include": ({"diagnostics"})]);
        mapping response = ctx->analysis->handle_analyze(analyze_params);

        if (response->result && response->result->diagnostics) {
            return (["result": response->result->diagnostics]);
        }
        return response;
    },

    // New unified method
    "analyze": lambda(mapping params, object ctx) {
        return ctx->analysis->handle_analyze(params);
    },
]);
```

### Pattern 3: TypeScript Client-Side Caching

**What:** Cache the unified response and distribute to LSP features

**When to use:** In validation pipeline after receiving `analyze` response

**Implementation approach:**

```typescript
// In packages/pike-lsp-server/src/features/diagnostics.ts
async function validateDocument(document: TextDocument): Promise<void> {
    const text = document.getText();
    const filename = decodeURIComponent(document.uri.replace(/^file:\/\//, ''));

    // SINGLE call to Pike
    const analyzeResult = await bridge.analyze(text, filename, {
        include: ['introspect', 'parse', 'diagnostics']
    });

    // Handle partial failures
    if (analyzeResult.failures?.introspect) {
        connection.console.warn(`[VALIDATE] Introspection failed: ${analyzeResult.failures.introspect.message}`);
    }

    // Extract results with fallbacks
    const introspect = analyzeResult.result?.introspect;
    const parse = analyzeResult.result?.parse;
    const uninitializedDiags = analyzeResult.result?.diagnostics;

    // Cache for features (symbols, hover, completion read from cache)
    if (parse?.symbols) {
        documentCache.set(uri, {
            version: document.version,
            symbols: parse.symbols,
            diagnostics: [],  // Will be populated
            symbolPositions: await buildSymbolPositionIndex(text, parse.symbols),
        });
    }

    // Update type database from introspection
    if (introspect?.success) {
        typeDatabase.setProgram({...});
    }

    // Merge diagnostics from all sources
    const allDiagnostics = [
        ...(introspect?.diagnostics || []),
        ...(parse?.diagnostics || []),
        ...(uninitializedDiags?.diagnostics || [])
    ];

    connection.sendDiagnostics({ uri, diagnostics: allDiagnostics });
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Result type filtering | Custom filtering logic | Array-based `include` param with Pike's `has_value()` | Simple, declarative, O(n) lookup |
| Partial error handling | Ad-hoc error objects | Structured `failures` map with `kind` strings | Type-safe, O(1) client lookup |
| Request deduplication | Custom cache keys | PikeBridge's existing inflight request deduplication | Already implemented, works per-request-key |
| Tokenization | Custom tokenizer | `Parser.Pike.split()` + `Parser.Pike.tokenize()` | Only accurate way to tokenize Pike code |
| Compilation caching | Custom cache | `LSP.Cache.put("program_cache", ...)` | Existing infrastructure, LRU-managed |

**Key insight:** The consolidation should leverage existing Pike stdlib tools rather than reimplementing parsing logic. The main work is orchestrating existing analyses and sharing intermediate results (tokens, compiled program).

## Common Pitfalls

### Pitfall 1: Breaking Backward Compatibility

**What goes wrong:** External consumers or tests rely on existing `introspect`/`parse`/`analyze_uninitialized` methods

**Why it happens:** Focus on the new API without maintaining the old one

**How to avoid:**
- Implement wrappers first, then change internals
- Keep exact response structure of old methods
- Add deprecation warnings but don't break functionality

**Warning signs:** Tests failing that call `bridge.introspect()` directly

### Pitfall 2: Not Sharing Intermediate Results

**What goes wrong:** Unified method still tokenizes/compiles multiple times

**Why it happens:** Calling existing handlers rather than refactoring to share state

**How to avoid:**
- Extract tokenization into a shared function that returns tokens
- Extract compilation into a shared function that returns compiled program
- Refactor existing handlers to use shared functions

**Warning signs:** `_perf` timing shows similar total time to individual calls

### Pitfall 3: Inconsistent Response Structure

**What goes wrong:** TypeScript can't narrow types when checking for failures

**Why it happens:** Mixing error objects directly in result or using arrays for failures

**How to avoid:** Use the exact inverse structure specified in CONTEXT.md:
- For each key in `include`, response has entry in either `result` or `failures`, never both
- Failures are a mapping, not an array: `response.failures?.symbols` for O(1) lookup

**Warning signs:** TypeScript type guards become complex

### Pitfall 4: Forgetting _perf Metadata

**What goes wrong:** Can't measure performance improvement

**Why it happens:** New method doesn't include timing metadata

**How to avoid:** Always include `_perf` with at least `pike_total_ms`
- Add breakdown: `compilation_ms`, `tokenization_ms` for insight

**Warning signs:** Benchmark shows no improvement or degradation

## Code Examples

### Existing Handler Signature (for reference)

```pike
// From Intelligence.pike - handle_introspect
mapping handle_introspect(mapping params) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";

    array diagnostics = ({});
    program compiled_prog;

    // Compilation with error capture
    void compile_error_handler(string file, int line, string msg) {
        diagnostics += ({(["message": msg, "severity": "error", "position": ...])});
    };

    mixed old_error_handler = master()->get_inhibit_compile_errors();
    master()->set_inhibit_compile_errors(compile_error_handler);

    compiled_prog = compile_string(code, filename);

    master()->set_inhibit_compile_errors(old_error_handler);

    // Introspect compiled program
    mapping result = introspect_program(compiled_prog);
    result->success = 1;
    result->diagnostics = diagnostics;

    return (["result": result]);
}
```

### New Unified Handler Structure

```pike
// Pattern for handle_analyze in Analysis.pike or new Consolidated.pike
mapping handle_analyze(mapping params, object ctx) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";
    array(string) include = params->include || ({});

    mapping result = ([]);
    mapping failures = ([]);

    // Shared intermediates
    array tokens = ({});
    program compiled = 0;

    // Phase 1: Tokenize (shared by parse and diagnostics)
    if (sizeof(include & ({"parse", "diagnostics"})) > 0) {
        mixed err = catch {
            array(string) split_tokens = Parser.Pike.split(code);
            tokens = Parser.Pike.tokenize(split_tokens);
        };
        if (err) {
            failures->parse = (["message": describe_error(err), "kind": "TokenizationError"]);
            failures->diagnostics = (["message": describe_error(err), "kind": "TokenizationError"]);
        }
    }

    // Phase 2: Compile (for introspect)
    if (has_value(include, "introspect") && !failures->introspect) {
        // Use Intelligence.pike's compilation logic
        // TODO: Extract to shared function to avoid duplication
        mixed err = catch {
            compiled = compile_string(code, filename);
        };
        if (err) {
            failures->introspect = (["message": describe_error(err), "kind": "CompilationError"]);
        }
    }

    // Phase 3: Generate each requested result
    // (Each would call the existing handler logic or extracted shared functions)

    return ([
        "result": sizeof(result) > 0 ? result : 0,
        "failures": sizeof(failures) > 0 ? failures : 0,
    ]);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A | Request Consolidation | Phase 12 (current) | Will reduce validation latency by ~66% (3 calls -> 1 call) |

**Current benchmark baseline:**
From `packages/pike-lsp-server/benchmarks/runner.ts`, the validation pipeline makes 3 calls:
```typescript
results.introspect = await bridge.introspect(code, filename);  // ~1-2ms Pike time
results.parse = await bridge.parse(code, filename);            // ~1-2ms Pike time
results.analyze = await bridge.analyzeUninitialized(code, filename);  // ~0.5-1ms Pike time
```

**Target after consolidation:**
```typescript
const result = await bridge.analyze(code, filename, {
    include: ['introspect', 'parse', 'diagnostics']
});  // Single call, shared compilation/tokenization
```

## Open Questions

1. **Refactoring approach for sharing intermediates:**
   - What we know: `Parser.pike`, `Intelligence.pike`, and `Diagnostics.pike` all need compilation/tokenization
   - What's unclear: Should we extract shared functions first, or implement `handle_analyze` with duplication then refactor?
   - Recommendation: Extract shared functions first to avoid technical debt

2. **Tokenization reuse:**
   - What we know: `Parser.Pike.split()` + `Parser.Pike.tokenize()` are called by both parse and diagnostics
   - What's unclear: Can we cache tokens between calls without memory blowout?
   - Recommendation: Tokens are lightweight (array of small objects), caching for duration of single analyze call is fine

3. **Error kind taxonomy:**
   - What we know: CONTEXT.md specifies string error kinds like `ParseError`, `ResolutionError`
   - What's unclear: Full list of error kinds to support
   - Recommendation: Start with basic kinds: `ParseError`, `CompilationError`, `ResolutionError`, `InternalError`

## Sources

### Primary (HIGH confidence)

- `/home/smuks/OpenCode/pike-lsp/pike-scripts/analyzer.pike` - Current JSON-RPC dispatch table and handler registration
- `/home/smuks/OpenCode/pike-lsp/pike-scripts/LSP.pmod/Parser.pike` - Current parse_request implementation
- `/home/smuks/OpenCode/pike-lsp/pike-scripts/LSP.pmod/Intelligence.pike` - Current handle_introspect implementation
- `/home/smuks/OpenCode/pike-lsp/pike-scripts/LSP.pmod/Analysis.pike` - Current handle_analyze_uninitialized delegation
- `/home/smuks/OpenCode/pike-lsp/pike-scripts/LSP.pmod/Analysis.pmod/Diagnostics.pike` - Current uninitialized variable analysis
- `/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/bridge.ts` - Current PikeBridge methods
- `/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/types.ts` - Current TypeScript type definitions
- `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/diagnostics.ts` - Current validation pipeline
- `/home/smuks/OpenCode/pike-lsp/.planning/phases/12-request-consolidation/12-CONTEXT.md` - Implementation decisions from discussion phase

### Secondary (MEDIUM confidence)

- `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/benchmarks/runner.ts` - Benchmark infrastructure for measuring improvement

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All code examined from actual implementation
- Architecture: HIGH - Clear understanding of current flow and required changes
- Pitfalls: HIGH - Common IPC consolidation issues are well-understood
- Implementation details: MEDIUM - Some refactoring decisions (shared functions vs duplication) are implementation choices

**Research date:** 2026-01-22
**Valid until:** 7 days (fast-moving phase with active implementation)
