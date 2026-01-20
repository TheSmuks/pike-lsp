# Phase 1: Lean Observability - Context

## Goal

See what's happening without complex cross-language infrastructure. TypeScript maintains error chains to track path; Pike returns flat, simple error dicts.

## Philosophy

**Opaque Fault Domains:** TypeScript maintains the chain to track *path*. Pike returns flat, simple data. We keep debuggability (knowing *where* it failed) without over-engineering Pike's error responses.

**Asymmetric Logging:** Structured logs in TypeScript only. Pike emits simple event strings to stderr. Bridge wraps Pike output into the TypeScript structure.

## Requirements Mapped

- OBS-01: Create `LSPError` class with layer tracking (`server`, `bridge`, `pike`)
- OBS-02: Create `BridgeError` subclass for IPC-layer errors
- OBS-03: Create `PikeError` subclass for Pike subprocess errors
- OBS-04: Implement error chain building (`error.chain` traverses cause hierarchy)
- OBS-05: Create `Logger` class with component-based namespacing
- OBS-06: Implement log levels: OFF, ERROR, WARN, INFO, DEBUG, TRACE
- OBS-07: Logger output includes timestamp, level, component, message, and optional context
- OBS-08: Logger.setLevel() controls global log filtering
- OBS-09: Pike errors return flat dicts with `error`, `kind`, `msg`, `line` fields
- OBS-10: Bridge captures Pike stderr and logs via TypeScript Logger

## Success Criteria

1. LSPError, BridgeError, PikeError classes exist with layer tracking
2. Error.chain property returns full path: "Hover failed -> Bridge timeout -> Pike error"
3. Logger class exists with OFF, ERROR, WARN, INFO, DEBUG, TRACE levels
4. Logger.setLevel() controls global filtering
5. Pike make_error() helper returns flat dicts: `{ error: 1, kind, msg, line }`
6. Bridge captures Pike stderr and logs via TypeScript Logger

## Deliverables

### TypeScript

**`packages/pike-lsp-server/src/core/errors.ts`:**
```typescript
class LSPError extends Error {
  constructor(
    message: string,
    public layer: 'server' | 'bridge' | 'pike',
    public cause?: Error
  ) {
    super(message);
  }

  get chain(): string {
    const parts = [this.message];
    let current = this.cause;
    while (current) {
      parts.push(current.message);
      current = (current as LSPError).cause;
    }
    return parts.join(' -> ');
  }
}

class BridgeError extends LSPError {
  constructor(message: string, cause?: Error) {
    super(message, 'bridge', cause);
  }
}

class PikeError extends LSPError {
  constructor(message: string, cause?: Error) {
    super(message, 'pike', cause);
  }
}
```

**`packages/pike-lsp-server/src/core/logging.ts`:**
```typescript
enum LogLevel { OFF, ERROR, WARN, INFO, DEBUG, TRACE }

class Logger {
  private static level: LogLevel = LogLevel.WARN;

  static setLevel(level: LogLevel) { this.level = level; }

  constructor(private component: string) {}

  private log(level: LogLevel, levelName: string, msg: string, ctx?: object) {
    if (Logger.level < level) return;
    const timestamp = new Date().toISOString();
    const context = ctx ? ' ' + JSON.stringify(ctx) : '';
    console.error(`[${timestamp}][${levelName}][${this.component}] ${msg}${context}`);
  }

  error(msg: string, ctx?: object) { this.log(LogLevel.ERROR, 'ERROR', msg, ctx); }
  warn(msg: string, ctx?: object) { this.log(LogLevel.WARN, 'WARN', msg, ctx); }
  info(msg: string, ctx?: object) { this.log(LogLevel.INFO, 'INFO', msg, ctx); }
  debug(msg: string, ctx?: object) { this.log(LogLevel.DEBUG, 'DEBUG', msg, ctx); }
  trace(msg: string, ctx?: object) { this.log(LogLevel.TRACE, 'TRACE', msg, ctx); }
}
```

### Pike

**Simple error dicts (no Errors.pike class needed yet):**
```pike
mapping make_error(string kind, string msg, int|void line) {
  return ([
    "error": 1,
    "kind": kind,      // "SYNTAX", "COMPILE", "RUNTIME"
    "msg": msg,
    "line": line
  ]);
}
```

### Bridge Integration

```typescript
// In bridge - capture and wrap Pike stderr
pikeProcess.stderr.on('data', (data) => {
  const msg = data.toString().trim();
  if (msg) {
    this.logger.debug('Pike stderr', { raw: msg });
  }
});
```

## Dependencies

None - this is the first phase.

## Notes

- No complex Pike logging library needed
- Pike just uses `werror()` as it always has
- TypeScript captures and structures Pike output
- Error chains help debug cross-boundary failures
