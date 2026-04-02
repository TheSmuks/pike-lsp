# Stress Testing Harness

Nightly stress scenarios for Pike LSP live under `src/testing/stress-scenarios/`.

## Run

```bash
bun run test:stress
```

## Stress runner

`stress-runner.ts` provides configurable repetition and concurrency:

- default iterations: `1000`
- delay injection between operations: `10-100ms`
- deterministic per-iteration seed derivation
- progress reporting
- timeout support
- failure context capture (`iteration`, `seed`, `worker`, `stack`)

Example:

```ts
const result = await stressRunner.run(
  'my-scenario',
  1000,
  async (seed, iteration) => {
    await doSomething(seed, iteration);
  },
  {
    concurrency: 5,
    delayMs: { min: 10, max: 100 },
    timeoutMs: 5000,
  }
);
```

## Scenarios

- `document-lifecycle.stress.test.ts`
- `completion-race.stress.test.ts`
- `validation-burst.stress.test.ts`
- `diagnostics-flood.stress.test.ts`
- `cancel-restart.stress.test.ts`

These tests focus on crash resistance and stale-state detection under repeated concurrent operations.
