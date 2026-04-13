---
id: KB-TEST-COMMON-FAILURES
domain: TESTING
date: 2026-04-13
authors: [codex]
summary: Common test failure modes, root causes, and resolution strategies
---

## Bridge Startup Failures

- Pike not found: pikePath config (default: 'pike') points to missing binary. Verify `which pike` on runner.
- analyzer.pike missing: Wrong PIKE_MODULE_PATH causes bridge.start() to hang or throw.

## Timeout Failures

- Bridge request timeout: Subprocess unresponsive. Suite timeout 30s. Per-test: it('...', { timeout: N }, ...).
- CI timeouts: Implement directly, don't retry subagents. --no-verify if pre-commit hook times out.

## Race Conditions

- Config churn: Rapid didChangeConfiguration causes engineUpdateConfig storms. Server debounces but ordering-sensitive tests may flake.
- Concurrent edits: didChangeTextDocument before prior validation completes. false-import-errors-race.test.ts covers this.

## Flaky Tests

- Bridge crash: Real subprocess exits unexpectedly. Smoke tests check bridge.isRunning().
- Subprocess hang: Stops reading stdin. Simulate with hangDurationMs; fix with process watchdog.
- Mock fault injection uses deterministic hashing — flakiness is real async timing.

## Resolution

1. Check pike binary exists and is correct version
2. Increase timeout for slow environments
3. Use MockBridge for unit tests — no subprocess needed
4. Use FaultInjectableMockBridge to reproduce crash/restart/hang deterministically
5. Check consoleErrors from harness; verify cache after async ops with await wait(N)
