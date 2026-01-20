# Phase 1: Lean Observability - Research

**Researched:** 2026-01-20
**Domain:** Error handling and logging infrastructure
**Confidence:** HIGH

## Summary

This phase establishes the foundational error handling and logging infrastructure for the Pike LSP server. Research reveals a clear asymmetry between TypeScript and Pike: TypeScript has sophisticated error chaining capabilities while Pike uses flat error dictionaries. The existing codebase already uses `connection.console.log()` for logging and has a basic `LSPError` class in Pike's `module.pmod`, but lacks structured error tracking across layers.

**Primary recommendation:** Implement a three-layer error class hierarchy (LSPError, BridgeError, PikeError) with cause chain tracking, paired with a simple but effective Logger class using component-based namespacing. Keep Pike error handling simple with flat dictionaries returned via JSON-RPC.

## Standard Stack

No external libraries are needed. This is pure infrastructure using Node.js and TypeScript built-ins.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native Error | ES2022+ | Base error class | Built-in cause property in modern Node.js |
| console | Node.js built-in | Log output | Already used via connection.console |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vscode-languageserver | current | connection.console | When running as LSP server |
| Date.toISOString() | ES5 | Timestamp formatting | Standard timestamp format |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native Error.cause | Custom cause tracking | Less standard, interop issues |
| console.error | Winston/Pino | Over-engineering for current needs |
| werror() in Pike | Custom Pike Logger | Pike lacks context, keeps it simple |

**Installation:**
```bash
# No external packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
packages/pike-lsp-server/src/
├── core/
│   ├── errors.ts       # LSPError, BridgeError, PikeError classes
│   └── logging.ts      # Logger class with levels
packages/pike-bridge/src/
├── errors.ts           # Bridge error definitions (shared)
pike-scripts/LSP.pmod/
├── Errors.pike         # make_error() helper (new)
```

### Pattern 1: Error Class Hierarchy
**What:** Three error classes with layer tracking and cause chaining
**When to use:** All error creation should use these classes instead of plain Error
**Example:**
```typescript
// Source: Based on Context.md requirements, existing pike-bridge patterns
class LSPError extends Error {
    constructor(
        message: string,
        public layer: 'server' | 'bridge' | 'pike',
        public cause?: Error
    ) {
        super(message);
        this.name = 'LSPError';
        // Use Error.cause if available (Node.js 16.9.0+)
        if (cause && !('cause' in this)) {
            (this as unknown as { cause: Error }).cause = cause;
        }
    }

    get chain(): string {
        const parts = [this.message];
        let current = this.cause;
        while (current) {
            parts.push(current.message);
            // Follow standard Error.cause chain
            current = (current as { cause?: Error }).cause;
        }
        return parts.join(' -> ');
    }
}

class BridgeError extends LSPError {
    constructor(message: string, cause?: Error) {
        super(message, 'bridge', cause);
        this.name = 'BridgeError';
    }
}

class PikeError extends LSPError {
    constructor(message: string, cause?: Error) {
        super(message, 'pike', cause);
        this.name = 'PikeError';
    }
}
```

### Pattern 2: Logger with Component Namespacing
**What:** Simple logger class with log levels and component-based filtering
**When to use:** All logging throughout the codebase
**Example:**
```typescript
// Source: Based on Context.md requirements
enum LogLevel {
    OFF = 0,
    ERROR = 1,
    WARN = 2,
    INFO = 3,
    DEBUG = 4,
    TRACE = 5
}

class Logger {
    private static globalLevel: LogLevel = LogLevel.WARN;

    static setLevel(level: LogLevel): void {
        Logger.globalLevel = level;
    }

    constructor(private component: string) {}

    private log(level: LogLevel, levelName: string, msg: string, ctx?: object): void {
        if (level > Logger.globalLevel) return;
        const timestamp = new Date().toISOString();
        const context = ctx ? ' ' + JSON.stringify(ctx) : '';
        console.error(`[${timestamp}][${levelName}][${this.component}] ${msg}${context}`);
    }

    error(msg: string, ctx?: object): void {
        this.log(LogLevel.ERROR, 'ERROR', msg, ctx);
    }
    warn(msg: string, ctx?: object): void {
        this.log(LogLevel.WARN, 'WARN', msg, ctx);
    }
    info(msg: string, ctx?: object): void {
        this.log(LogLevel.INFO, 'INFO', msg, ctx);
    }
    debug(msg: string, ctx?: object): void {
        this.log(LogLevel.DEBUG, 'DEBUG', msg, ctx);
    }
    trace(msg: string, ctx?: object): void {
        this.log(LogLevel.TRACE, 'TRACE', msg, ctx);
    }
}

// Usage
const logger = new Logger('PikeBridge');
logger.debug('Process started', { pid: 12345 });
```

### Pattern 3: Pike Flat Error Dictionaries
**What:** Simple mapping return for errors in Pike
**When to use:** All Pike error returns
**Example:**
```pike
// Source: Based on existing module.pmod LSPError pattern
mapping make_error(string kind, string msg, int|void line) {
    return ([
        "error": 1,
        "kind": kind,      // "SYNTAX", "COMPILE", "RUNTIME"
        "msg": msg,
        "line": line
    ]);
}

// Usage in handlers
mixed err = catch {
    // ... Pike code ...
};
if (err) {
    return ([
        "error": ([
            "code": -32000,
            "message": describe_error(err)
        ])
    ]);
}
```

### Anti-Patterns to Avoid
- **Leaky Pike Abstraction:** Don't try to implement stack traces in Pike - it lacks context. Return flat dicts, let TypeScript chain them.
- **Over-engineering Logger:** Don't add transports, formatters, or log rotation. Keep it simple for now.
- **Silent Errors:** Always log errors before catching/rethrowing.
- **Generic Error Throwing:** Use LSPError/BridgeError/PikeError, not plain Error.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error cause chaining | Custom `this.cause = ...` | Native `Error.cause` | Standard in Node.js 16.9.0+, better serialization |
| Timestamp formatting | Custom date formatter | `Date.toISOString()` | Standard format, no dependencies |
| JSON-RPC errors | Custom error codes | Existing LSP error codes | Standard protocol defines these |
| Log levels | Custom level objects | Numeric enum | Fast comparison, simple ordering |

**Key insight:** Error handling is a solved problem in TypeScript/Node.js. Leverage built-ins rather than building custom infrastructure.

## Common Pitfalls

### Pitfall 1: Inconsistent Error Layer Tracking
**What goes wrong:** Errors are thrown but the layer (server/bridge/pike) isn't tracked, making debugging difficult.
**Why it happens:** Developers use plain `Error` or `throw new Error()` out of habit.
**How to avoid:** Always use `LSPError`, `BridgeError`, or `PikeError` with appropriate layer.
**Warning signs:** "Error: something failed" with no indication of which layer originated it.

### Pitfall 2: Lost Error Context
**What goes wrong:** When catching and rethrowing, the original error is lost.
**Why it happens:** Using `throw new Error('New message')` discards the original cause.
**How to avoid:** Always use `throw new BridgeError('New message', caughtError)`.
**Warning signs:** Error messages that describe symptoms but not root cause.

### Pitfall 3: Over-Logging
**What goes wrong:** Excessive DEBUG/TRACE logs slow down the system and create noise.
**Why it happens:** Logger always outputs regardless of level.
**How to avoid:** Implement level checking before expensive operations.
**Warning signs:** Logs are longer than code, or performance degrades with logging enabled.

### Pitfall 4: Pike Error Mismatch
**What goes wrong:** TypeScript expects an error object but Pike returns a flat dict.
**Why it happens:** Inconsistent IPC contract between layers.
**How to avoid:** Define clear IPC types in `@pike-lsp/pike-bridge/types.ts` for error responses.
**Warning signs:** `undefined` errors or "Cannot read property 'message' of undefined".

### Pitfall 5: Stderr Not Captured
**What goes wrong:** Pike `werror()` output goes to the void, not the logs.
**Why it happens:** PikeBridge doesn't attach stderr handler or suppresses output.
**How to avoid:** Always attach stderr handler in PikeBridge and log via Logger.
**Warning signs:** Pike compilation errors don't appear in logs.

## Code Examples

Verified patterns from official sources:

### Throwing Layered Errors
```typescript
// Source: Based on existing pike-bridge error handling patterns
try {
    await bridge.parse(code, filename);
} catch (e) {
    throw new BridgeError('Failed to parse document', e as Error);
}
```

### Pike Error with Response Wrapper
```pike
// Source: Existing LSP.pmod/module.pmod LSPError pattern
if (err) {
    return LSP.module.LSPError(-32000, describe_error(err))->to_response();
}
```

### Logging with Context
```typescript
// Source: Based on existing MockOutputChannel pattern
logger.error('Pike process exited unexpectedly', {
    code,
    signal,
    pendingRequests: this.pendingRequests.size
});
```

### Bridge Stderr Capture
```typescript
// Source: Existing PikeBridge.ts stderr handler (lines 165-184)
this.process.stderr?.on('data', (data: Buffer) => {
    const message = data.toString().trim();
    if (message) {
        // Filter out false positive warnings
        const suppressedPatterns = [/^Illegal comment/, /^Missing ['"]>?['"]\)/];
        const isSuppressed = suppressedPatterns.some(p => p.test(message));

        if (!isSuppressed) {
            this.debugLog(`STDERR: ${message}`);
            this.emit('stderr', message);
        }
    }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `console.log()` everywhere | Structured Logger class | This phase | Consistent log format, level filtering |
| Plain `throw new Error()` | Layered LSPError hierarchy | This phase | Debuggable error chains across layers |
| No stderr capture | Bridge stderr to Logger | This phase | Pike errors visible in logs |
| Pike errors unknown | Flat error dicts with make_error() | This phase | Explicit Pike error contract |

**Deprecated/outdated:**
- `connection.console.log()` for everything: Replace with Logger for structured output
- Plain Error throwing: Use LSPError/BridgeError/PikeError
- Werror directly to process: Route through Bridge stderr capture

## Open Questions

1. **Error serialization over IPC**
   - What we know: Pike returns flat dicts with error/code/message
   - What's unclear: Should we add error kinds to the IPC protocol?
   - Recommendation: Start with existing JSON-RPC error format, add kinds if needed

2. **Log output destination in production**
   - What we know: VSCode extension can use OutputChannel
   - What's unclear: Should logs go to client OutputChannel or server console?
   - Recommendation: Use connection.console for server logs, let client decide OutputChannel

3. **Pike-side error enrichment**
   - What we know: Pike has `describe_error()` for error messages
   - What's unclear: Should we add more context to Pike errors (stack, module)?
   - Recommendation: Keep Pike errors simple as per philosophy - TypeScript adds context

## Sources

### Primary (HIGH confidence)
- `/home/smuks/OpenCode/pike-lsp/.planning/phases/01-lean-observability/01-CONTEXT.md` - Phase requirements
- `/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/bridge.ts` - Existing error/stderr patterns
- `/home/smuks/OpenCode/pike-lsp/pike-scripts/LSP.pmod/module.pmod` - Pike LSPError class
- `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/server.ts` - Existing connection.console usage
- `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/utils/validation.ts` - Error throwing pattern

### Secondary (MEDIUM confidence)
- MDN Web Docs - Error.cause property (Node.js 16.9.0+)
- TypeScript Handbook - Error handling patterns
- JSON-RPC 2.0 specification - Error response format

### Tertiary (LOW confidence)
- None - all findings verified from actual codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Native APIs, verified from codebase
- Architecture: HIGH - Based on existing patterns and Context.md requirements
- Pitfalls: HIGH - Observed from existing code issues

**Research date:** 2026-01-20
**Valid until:** 30 days (stable infrastructure patterns)
