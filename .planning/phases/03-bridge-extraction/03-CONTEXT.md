# Phase 3: Bridge Extraction - Context

## Goal

Isolate IPC mechanics from business logic. The stdin bug would be caught here - pure IPC can be tested independently from policy logic.

## Philosophy

**Critical Refactor:** The bridge is where TypeScript and Pike communicate. Separating IPC mechanics (how we talk) from policy (what we say, retries, timeouts) makes both independently testable.

## Requirements Mapped

- BRG-01: Create `PikeProcess` class in `packages/pike-bridge/src/process.ts`
- BRG-02: PikeProcess handles spawn with stdin/stdout/stderr pipes
- BRG-03: PikeProcess uses readline interface for line-by-line stdout reading
- BRG-04: PikeProcess emits events: `message`, `stderr`, `exit`, `error`
- BRG-05: PikeProcess.send() writes JSON + newline to stdin
- BRG-06: PikeProcess.kill() cleans up readline and child process
- BRG-07: PikeProcess.isAlive() returns process health status
- BRG-08: Refactor `PikeBridge` to use `PikeProcess` internally
- BRG-09: PikeBridge handles request/response correlation with pending map
- BRG-10: PikeBridge implements timeout policy for requests (30s default)
- BRG-11: PikeBridge wraps Pike errors in `PikeError` class
- BRG-12: Unit tests for PikeProcess IPC mechanics
- BRG-13: Unit tests for PikeBridge policy logic (with mock process)

## Success Criteria

1. `PikeProcess` class exists in `packages/pike-bridge/src/process.ts`
2. PikeProcess handles spawn, readline, events (message, stderr, exit, error)
3. PikeProcess can be tested in isolation (pure IPC mechanics)
4. `PikeBridge` refactored to use PikeProcess internally
5. PikeBridge handles request/response correlation, timeouts, error wrapping
6. PikeBridge can be tested with mock PikeProcess (policy logic only)

## Deliverables

### New Structure

```
packages/pike-bridge/src/
  index.ts              # Public exports
  bridge.ts             # Orchestrator + policy (retries, timeouts) (~300 lines)
  process.ts            # Pure IPC mechanics (~200 lines)
  types.ts              # (existing) type definitions
  constants.ts          # (existing) config constants
```

### process.ts - Pure IPC

```typescript
import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';

export class PikeProcess extends EventEmitter {
  private process: ChildProcess | null = null;
  private rl: readline.Interface | null = null;

  spawn(pikeScriptPath: string): void {
    this.process = spawn('pike', [pikeScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Line-by-line reading (prevents the stdin bug)
    this.rl = readline.createInterface({
      input: this.process.stdout!,
      crlfDelay: Infinity
    });

    this.rl.on('line', (line) => {
      this.emit('message', line);
    });

    this.process.stderr!.on('data', (data) => {
      this.emit('stderr', data.toString());
    });

    this.process.on('exit', (code) => {
      this.emit('exit', code);
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
    this.rl?.close();
    this.process?.kill();
    this.process = null;
    this.rl = null;
  }

  isAlive(): boolean {
    return this.process !== null && !this.process.killed;
  }

  get pid(): number | null {
    return this.process?.pid ?? null;
  }
}
```

### bridge.ts - Policy and Orchestration

```typescript
import { PikeProcess } from './process';
import { Logger } from '../core/logging';
import { BridgeError, PikeError } from '../core/errors';

export class PikeBridge {
  private process: PikeProcess;
  private logger: Logger;
  private pendingRequests: Map<number, { resolve: Function; reject: Function }>;
  private nextId = 1;

  constructor() {
    this.process = new PikeProcess();
    this.logger = new Logger('bridge');
    this.pendingRequests = new Map();
  }

  async start(): Promise<void> {
    this.logger.info('Starting Pike process');
    this.process.spawn('pike-scripts/analyzer.pike');

    this.process.on('message', (line) => this.handleMessage(line));
    this.process.on('stderr', (msg) => this.logger.debug('Pike stderr', { raw: msg }));
    this.process.on('exit', (code) => this.handleExit(code));
    this.process.on('error', (err) => this.handleError(err));
  }

  private async call(method: string, params: object): Promise<any> {
    const id = this.nextId++;
    const request = JSON.stringify({ jsonrpc: '2.0', id, method, params });

    this.logger.debug('Sending request', { method, id });

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new BridgeError(`Timeout waiting for ${method}`));
        }
      }, 30000);

      this.process.send(request);
    });
  }

  private handleMessage(line: string): void {
    try {
      const response = JSON.parse(line);
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        this.pendingRequests.delete(response.id);
        if (response.error) {
          pending.reject(new PikeError(response.error.message));
        } else {
          pending.resolve(response.result);
        }
      }
    } catch (err) {
      this.logger.error('Failed to parse response', { line });
    }
  }

  // Public API methods
  async parse(code: string, filename: string) {
    return this.call('parse', { code, filename });
  }

  async introspect(code: string, filename: string) {
    return this.call('introspect', { code, filename });
  }
}
```

## Dependencies

- Phase 1: BridgeError class needed for error wrapping

## Notes

**Why this split matters:**
- `process.ts` can be tested in isolation (does IPC work?)
- `bridge.ts` can be tested with a mock process (does policy work?)
- The stdin bug would be caught by `process.ts` tests alone
- Line-by-line reading via readline prevents message fragmentation
