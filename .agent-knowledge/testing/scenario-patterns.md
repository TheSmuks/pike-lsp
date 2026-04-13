---
id: KB-TEST-SCENARIO-PATTERNS
domain: TESTING
date: 2026-04-13
authors: [codex]
summary: Test frameworks, patterns, and conventions for pike-lsp-server tests
---

## Test Framework

bun:test with describe/it/beforeAll/afterAll. Assertions via node:assert/strict (deepStrictEqual, ok, equal). Suite timeout: describe('...', { timeout: 30000 }, ...).

## Smoke Tests (src/tests/smoke.test.ts)

Fast validation with real PikeBridge. start() in beforeAll, stop() in afterAll. Tests call parse(), analyze(), compile() directly. Verifies results exist, invalid input doesn't crash. Suite timeout 30s.

## MockBridge (src/tests/helpers/mock-bridge.ts)

- MockBridge — base mock. Configurable analyzeResult, delayMs, onQuery, onCancel. Tracks callCount, revisionClock, cancelledRequestIds. Engine methods return deterministic acks.
- FaultInjectableMockBridge — adds FaultInjectionConfig: restartAtIteration, crashAtOperation, delayMs range, failWithError, hangDurationMs, probability, triggerAfterMs. Tracks FaultStats. Uses FNV-1a hash for reproducible probability.

## Scenario Tests (src/scenarios/)

Integration tests for specific issues. No real Pike process. createHarness(bridge) wires mock bridge into real services (registerDiagnosticsHandlers, mock connection/cache). Returns { docs, cache, diagnostics, consoleErrors }. Assertions on request ordering, error recovery, cache state.

## Lifecycle Pattern

All tests: start() in beforeAll, stop() in afterAll. Real bridge for smoke, MockBridge for unit/scenario.
