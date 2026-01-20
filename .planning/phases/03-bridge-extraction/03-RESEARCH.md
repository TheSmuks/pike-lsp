# Phase 3: Bridge Extraction - Research

**Researched:** 2026-01-20
**Domain:** Node.js child_process IPC, EventEmitter patterns, JSON-RPC over stdin/stdout
**Confidence:** HIGH

## Summary

This phase extracts IPC mechanics from `PikeBridge` into a new `PikeProcess` class. The current `PikeBridge` (803 lines) mixes low-level subprocess management (spawn, readline, event handling) with business logic (request/response correlation, timeouts, deduplication, public API methods).

The research confirms:
1. **Node.js built-in APIs are sufficient** - `child_process.spawn()`, `readline.createInterface()`, and `EventEmitter` provide all needed functionality
2. **Current implementation already uses correct patterns** - The code uses readline for line-by-line stdout reading (critical for preventing the stdin bug)
3. **Testing patterns are established** - Node.js built-in test runner (`node:test`) is used throughout the codebase
4. **The stdin bug was caused by Pike using `Stdio.read()` instead of line-by-line `gets()`** - Not a TypeScript issue, but separation of IPC would have caught this earlier

**Primary recommendation:** Create `PikeProcess` as a pure EventEmitter-based IPC wrapper, then refactor `PikeBridge` to use it internally. This allows testing IPC mechanics independently from policy logic.

## Standard Stack

The Node.js built-in modules are sufficient - no external dependencies needed.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `child_process` | Node.js built-in | `spawn()`, `ChildProcess` | Official Node.js subprocess API |
| `readline` | Node.js built-in | `createInterface()` | Line-by-line stream reading |
| `events` | Node.js built-in | `EventEmitter` | Event-driven architecture |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:test` | Node.js built-in | Test framework | Already used in codebase |
| `node:assert/strict` | Node.js built-in | Assertions | Test assertions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node.js built-ins | `spawn-mock` library | External dependency adds complexity, built-in sufficient |
| Manual mock class | Sinon stubs | Sinon not in project, manual EventEmitter mock is simpler |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure
```
packages/pike-bridge/src/
  index.ts              # Public exports (existing)
  bridge.ts             # Policy/orchestration layer (~300 lines, refactored)
  process.ts            # NEW: Pure IPC mechanics (~200 lines)
  types.ts              # Type definitions (existing)
  constants.ts          # Configuration (existing)
  errors.ts             # Error classes (existing)
  logging.ts            # Logger (existing)

packages/pike-bridge/src/
  bridge.test.ts        # Existing tests for bridge
  process.test.ts       # NEW: Tests for PikeProcess
```

### Pattern 1: EventEmitter for Process Events
**What:** Extend `EventEmitter` to provide a clean event interface for subprocess lifecycle
**When to use:** Wrapping Node.js streams/processes with typed events
**Example:**
```typescript
// Source: Current PikeBridge implementation (lines 80-204)
import { EventEmitter } from 'events';

export class PikeProcess extends EventEmitter {
  private process: ChildProcess | null = null;
  private readline: readline.Interface | null = null;

  spawn(pikeScriptPath: string, pikePath: string = 'pike'): void {
    this.process = spawn(pikePath, [pikeScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Line-by-line reading (prevents the stdin bug)
    this.readline = readline.createInterface({
      input: this.process.stdout!,
      crlfDelay: Infinity
    });

    this.readline.on('line', (line) => {
      this.emit('message', line);
    });

    this.process.stderr?.on('data', (data) => {
      this.emit('stderr', data.toString());
    });

    this.process.on('close', (code) => {
      this.emit('exit', code);
      this.process = null;
      this.readline = null;
    });

    this.process.on('error', (err) => {
      this.emit('error', err);
    });
  }

  send(json: string): void {
    if (!this.process?.stdin?.writable) {
      throw new Error('Pike process not running');
    }
    this.process.stdin.write(json + '\n');
  }

  kill(): void {
    this.readline?.close();
    this.process?.kill();
    this.process = null;
    this.readline = null;
  }

  isAlive(): boolean {
    return this.process !== null && !this.process.killed;
  }

  get pid(): number | null {
    return this.process?.pid ?? null;
  }
}
```

### Pattern 2: Request/Response Correlation with Map
**What:** Use a `Map<number, PendingRequest>` to track in-flight requests by ID
**When to use:** JSON-RPC or any request/response protocol with correlation IDs
**Example:**
```typescript
// Source: Current PikeBridge implementation (lines 58-62, 303-315)
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// In PikeBridge class:
private requestId = 0;
private pendingRequests = new Map<number, PendingRequest>();

// Sending request:
const id = ++this.requestId;
const timeout = setTimeout(() => {
  this.pendingRequests.delete(id);
  reject(new PikeError(`Request ${id} timed out after ${this.options.timeout}ms`));
}, this.options.timeout);

this.pendingRequests.set(id, { resolve, reject, timeout });

// Handling response:
const pending = this.pendingRequests.get(response.id);
if (pending) {
  clearTimeout(pending.timeout);
  this.pendingRequests.delete(response.id);
  pending.resolve(response.result);
}
```

### Pattern 3: Request Deduplication with In-flight Map
**What:** Track in-flight requests by cache key to deduplicate concurrent identical requests
**When to use:** When multiple callers may request the same operation simultaneously
**Example:**
```typescript
// Source: Current PikeBridge implementation (lines 84, 281-331)
private inflightRequests = new Map<string, Promise<unknown>>();

private getRequestKey(method: string, params: Record<string, unknown>): string {
  return `${method}:${JSON.stringify(params)}`;
}

// In sendRequest:
const requestKey = this.getRequestKey(method, params);
const existing = this.inflightRequests.get(requestKey);
if (existing) {
  return existing as Promise<T>;
}

const promise = new Promise<T>((resolve, reject) => {
  // ... create request
});

this.inflightRequests.set(requestKey, promise);
promise.finally(() => {
  this.inflightRequests.delete(requestKey);
});

return promise;
```

### Anti-Patterns to Avoid
- **Mixing IPC and policy in one class:** Harder to test, unclear responsibilities
- **Not using readline for stdout:** Can cause fragmentation where JSON objects arrive in multiple chunks
- **Forgetting to clean up pending requests on process exit:** Causes memory leaks and hangs

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Line-by-line stdout reading | Custom buffer parsing | `readline.createInterface()` | Handles CR/LF combinations, partial lines, buffering |
| Event-driven process wrapper | Custom callback system | `EventEmitter` | Standard pattern, easier to test and mock |
| Test doubles for ChildProcess | Manual stub implementation | Mock EventEmitter class | Simpler, sufficient for IPC testing |

**Key insight:** The Node.js standard library already provides production-ready implementations for all IPC mechanics. Custom solutions only add maintenance burden and bug surface.

## Common Pitfalls

### Pitfall 1: The Stdin Bug (Historical Context)
**What goes wrong:** Pike subprocess hangs silently because it's waiting for EOF instead of reading line-by-line
**Why it happens:** Using `Stdio.read()` (blocks until EOF) instead of `Stdio.stdin.gets()` (line-by-line loop)
**How to avoid:** The TypeScript side already uses `readline.createInterface()` correctly. The fix on the Pike side (commit `b45ef37`) restored the `while ((line = Stdio.stdin.gets()))` loop pattern.
**Warning signs:** LSP features return null, no errors in logs, "nothing happens"

### Pitfall 2: Forgetting to Close Readline Interface
**What goes wrong:** Event listeners remain attached after process death, causing memory leaks
**Why it happens:** Calling `process.kill()` without `readline.close()`
**How to avoid:** Always close readline before/after killing process:
```typescript
this.readline?.close();
this.process?.kill();
```
**Warning signs:** Memory usage grows over time, tests fail with timeout

### Pitfall 3: Not Cleaning Up Pending Requests on Process Exit
**What goes wrong:** Promises never resolve, requests hang forever
**Why it happens:** Process exits but pending requests remain in Map
**How to avoid:** Clear pending requests on 'close' event:
```typescript
this.process.on('close', (code) => {
  for (const [_id, pending] of this.pendingRequests) {
    clearTimeout(pending.timeout);
    pending.reject(new PikeError(`Pike process exited with code ${code}`));
  }
  this.pendingRequests.clear();
});
```
**Warning signs:** Tests timeout, promises never resolve after process restart

### Pitfall 4: Mixing Error and Exit Events
**What goes wrong:** Error handlers called twice, unexpected behavior
**Why it happens:** `ChildProcess` emits both 'error' and 'exit' in some cases
**How to avoid:** Guard against multiple invocations:
```typescript
let handled = false;
this.process.on('error', (err) => {
  if (handled) return;
  handled = true;
  // handle error
});
```
**Warning signs:** Duplicate error messages, inconsistent state

## Code Examples

Verified patterns from current implementation and official Node.js documentation:

### Spawn with Readline (HIGH confidence)
```typescript
// Source: Current PikeBridge, lines 143-166
import { spawn } from 'child_process';
import * as readline from 'readline';

const process = spawn(pikePath, [analyzerPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

const rl = readline.createInterface({
  input: process.stdout,
  crlfDelay: Infinity  // Recognize \r\n as single newline
});

rl.on('line', (line) => {
  this.handleResponse(line);
});
```

### Graceful Shutdown (HIGH confidence)
```typescript
// Source: Current PikeBridge, lines 236-266
async stop(): Promise<void> {
  if (this.process) {
    const proc = this.process;
    proc.stdin?.end();
    proc.kill('SIGTERM');

    // Wait for graceful exit, or force kill after timeout
    const terminated = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve(false);
      }, 2000);

      proc.once('close', () => {
        clearTimeout(timeout);
        resolve(true);
      });
    });
  }
}
```

### Mock EventEmitter for Testing (MEDIUM confidence)
```typescript
// Pattern for testing without actual subprocess
export class MockPikeProcess extends EventEmitter {
  public messagesSent: string[] = [];
  public killed = false;
  public _pid = 12345;

  send(json: string): void {
    this.messagesSent.push(json);
  }

  kill(): void {
    this.killed = true;
    this.emit('exit', 0);
  }

  isAlive(): boolean {
    return !this.killed;
  }

  get pid(): number {
    return this._pid;
  }

  // Simulate receiving a response
  simulateResponse(response: string): void {
    this.emit('message', response);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Stdio.read()` in Pike | `Stdio.stdin.gets()` loop | Jan 2026 (commit b45ef37) | Fixed silent hangs in LSP |
| Direct stdout reading | `readline.createInterface()` | Already in use | Prevents JSON fragmentation |
| Mixed IPC/policy class | Separated concerns | This phase | Enables isolated testing |

**Deprecated/outdated:**
- Using `data` events directly on stdout: Can receive partial JSON objects
- Single-class bridge/pipeline: Cannot test IPC independently
- Not cleaning up pending requests: Causes hangs after restart

## Open Questions

None - The research fully covered the domain with HIGH confidence.

## Sources

### Primary (HIGH confidence)
- [Node.js Child Process Documentation v25.2.1](https://nodejs.org/api/child_process.html) - `spawn()`, `ChildProcess` class, events
- [Node.js Readline Documentation v25.2.1](https://nodejs.org/api/readline.html) - `createInterface()`, line event handling
- [Current PikeBridge implementation](/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/bridge.ts) - Lines 1-803, existing patterns verified
- [Stdin bug fix commit b45ef37](/home/smuks/OpenCode/pike-lsp) - Shows the Pike-side fix for line-by-line reading

### Secondary (MEDIUM confidence)
- [Unit-testing child processes](https://unhandledexception.dev/unit-testing-a-child-process-in-a-node-js-typescript-app-b7d89615e8e0) - Testing patterns for subprocess code
- [How to mock spawn function](https://stackoverflow.com/questions/26839932/how-to-mock-the-node-js-child-process-spawn-function) - Mock patterns for EventEmitter

### Tertiary (LOW confidence)
- [spawn-mock library](https://github.com/TylorS/spawn-mock) - External library option (not needed)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Node.js built-ins are authoritative
- Architecture: HIGH - Verified against current working implementation
- Pitfalls: HIGH - Based on actual bug history (commit b45ef37) and proven patterns

**Research date:** 2026-01-20
**Valid until:** 90 days (Node.js APIs stable)
