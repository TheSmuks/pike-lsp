# Simulation Testing for Pike LSP

Inspired by TigerBeetle's VOPR (Viewstamped Operation Replicator).

## Problem Statement

Current testing relies on scenarios with predetermined sequences. Real-world usage has:

- Unpredictable timing (typing bursts, pauses)
- Concurrent operations (completion while validating)
- Faults (bridge crashes, file changes, disk issues)
- Complex event interleavings that are hard to hand-craft

## Core Concepts from TigerBeetle

### 1. Deterministic Simulation

- Pseudo-random event generation with seed
- Same seed = same event sequence = reproducible bugs
- Controlled chaos instead of real chaos

### 2. Two-Mode Testing

#### Safety Mode

- Random faults: bridge restarts, slow operations, file changes
- Checks invariants never violated
- Finds data corruption, crashes, wrong results

#### Liveness Mode

- Pick a "core" set of operations that MUST work
- Make all other faults PERMANENT
- Verify core operations still complete
- Finds deadlock, starvation, livelock

### 3. Fault Injection Points

- Bridge process: crash, slow, restart
- File system: file modified externally, permission denied
- Timing: operation delays, event ordering variations
- User input: typing bursts, rapid edits, cursor jumps

## Pike LSP Adaptation

### Events to Simulate

```typescript
type SimulatedEvent =
  // Document lifecycle
  | { type: 'didOpen'; uri: string; content: string }
  | { type: 'didChange'; uri: string; changes: TextDocumentContentChangeEvent[] }
  | { type: 'didSave'; uri: string }
  | { type: 'didClose'; uri: string }

  // User requests
  | { type: 'completion'; uri: string; position: Position }
  | { type: 'hover'; uri: string; position: Position }
  | { type: 'definition'; uri: string; position: Position }
  | { type: 'diagnostics'; uri: string }

  // System events
  | { type: 'bridgeCrash' }
  | { type: 'bridgeRestart' }
  | { type: 'fileExternallyModified'; uri: string }
  | { type: 'delay'; ms: number }

  // Idle/activity
  | { type: 'idleStart' }
  | { type: 'idleEnd' };
```

### Invariants to Check (Safety)

1. **Cache Consistency**: Cached document version always ≤ live document version
2. **No Stale Diagnostics**: Diagnostics sent match current document version
3. **Symbol Integrity**: Cached symbols never reference non-existent positions
4. **Request Completion**: Every request eventually gets response (or cancellation)
5. **No Duplicate Validation**: Same URI not validated twice simultaneously
6. **Bridge Health**: If bridge isRunning(), it responds to ping

### Liveness Checks

1. **Core Operation Completes**: Given healthy bridge, completion request returns
2. **Recovery After Crash**: After bridge restart, next validation succeeds
3. **No Validation Starvation**: All documents eventually validated if stable
4. **Progress**: Diagnostics version number always increases over time

### Simulation Runner

```typescript
class LSPSimulator {
  private seed: number;
  private rng: PRNG;
  private eventLog: SimulatedEvent[];
  private invariants: Invariant[];

  constructor(seed: number) {
    this.seed = seed;
    this.rng = new PRNG(seed);
    this.eventLog = [];
  }

  // Generate event sequence
  generateEvents(count: number): SimulatedEvent[] {
    const events: SimulatedEvent[] = [];
    for (let i = 0; i < count; i++) {
      events.push(this.randomEvent());
    }
    return events;
  }

  // Run single simulation
  async run(options: {
    mode: 'safety' | 'liveness';
    eventCount: number;
    faultRate: number;
  }): Promise<SimulationResult> {
    const events = this.generateEvents(options.eventCount);

    // Execute with fault injection
    for (const event of events) {
      await this.executeEvent(event);

      // Check invariants after each event
      for (const invariant of this.invariants) {
        const check = await invariant.check();
        if (!check.passed) {
          return {
            status: 'invariant-violated',
            event,
            invariant: invariant.name,
            details: check.details,
            seed: this.seed,
            eventLog: this.eventLog,
          };
        }
      }
    }

    return { status: 'passed', seed: this.seed };
  }
}
```

## Implementation Phases

### Phase 1: Core Simulator

- Virtual Timer with deterministic time advancement
- Event Generator with pseudo-random sequences
- Mock Bridge with fault injection hooks
- Invariant Framework

### Phase 2: Fault Injection

- Bridge faults: crash, slow, restart
- File system faults: external modification
- Timing faults: variable delays

### Phase 3: Safety Mode

- Random fault injection per-event
- All invariant checks
- State capture on failure
- Event sequence minimization

### Phase 4: Liveness Mode

- Core operation selection
- Permanent faults on non-core
- Progress checking
- Timeout detection

### Phase 5: CI Integration

- Run N simulations per commit
- Track failing seeds
- Regression suite
- Metrics collection

## Success Criteria

- [ ] 10,000 safety-mode simulations pass
- [ ] 1,000 liveness-mode simulations pass
- [ ] Reproducible: same seed = same result
- [ ] Fast: < 1 second per simulation
- [ ] CI: 100 simulations per commit
- [ ] Found at least 1 new bug
