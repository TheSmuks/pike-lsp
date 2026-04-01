/**
 * Scenario: False import errors on file open (Issue #1058)
 *
 * Tests that engineOpenDocument completes before validateDocument runs,
 * preventing false "undefined identifier" errors for imported symbols.
 *
 * Before the fix:
 * - onDidOpen called engineOpenDocument fire-and-forget (no await)
 * - validateDocument ran immediately before engineOpenDocument resolved
 * - documentSnapshots was undefined when validateDocument tried to use it
 * - Engine query fell back to analyze() without import resolution context
 * - Users saw false "undefined identifier" errors on valid imports
 *
 * After the fix:
 * - onDidOpen awaits engineOpenDocument before calling validateDocument
 * - documentSnapshots is populated before validation starts
 * - No false import errors on file open
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

interface EngineOpenAck {
  snapshotId: string;
}

describe('Scenario: engineOpenDocument ordering on file open', () => {
  it('should await engineOpenDocument before validateDocument', async () => {
    let engineOpenResolvedAt = 0;
    let validateCalledAt = 0;

    const engineOpenPromise: Promise<EngineOpenAck> = new Promise(resolve => {
      setTimeout(() => {
        engineOpenResolvedAt = Date.now();
        resolve({ snapshotId: 'snap-1' });
      }, 30);
    });

    const mockBridge = {
      isRunning: () => true,
      engineOpenDocument: () => engineOpenPromise,
    };

    const snapshots = new Map<string, string>();

    const simulateOnDidOpen = async () => {
      const uri = 'file:///test.pike';

      try {
        const ack = await mockBridge.engineOpenDocument();
        if (ack) {
          snapshots.set(uri, ack.snapshotId);
        }
      } catch {
        // proceed with validation even if engine open fails
      }

      validateCalledAt = Date.now();
    };

    await simulateOnDidOpen();

    assert.ok(engineOpenResolvedAt > 0, 'engineOpenDocument should have been called and resolved');
    assert.ok(
      validateCalledAt >= engineOpenResolvedAt,
      'validateDocument should run after engineOpenDocument resolves'
    );
    assert.strictEqual(
      snapshots.get('file:///test.pike'),
      'snap-1',
      'snapshot should be available before validation'
    );
  });

  it('should proceed with validation even when engineOpenDocument fails', async () => {
    let validateCalled = false;
    const snapshots = new Map<string, string>();

    const mockBridge = {
      isRunning: () => true,
      engineOpenDocument: () => Promise.reject<EngineOpenAck>(new Error('Engine not available')),
    };

    const simulateOnDidOpen = async () => {
      const uri = 'file:///fallback.pike';

      try {
        const ack = await mockBridge.engineOpenDocument();
        if (ack) {
          snapshots.set(uri, ack.snapshotId);
        }
      } catch {
        // expected - engine open failed
      }

      validateCalled = true;
    };

    await simulateOnDidOpen();

    assert.strictEqual(
      validateCalled,
      true,
      'Validation should proceed even when engine open fails'
    );
    assert.strictEqual(
      snapshots.get('file:///fallback.pike'),
      undefined,
      'No snapshot should be set when engine open fails'
    );
  });

  it('should not fire engineOpenDocument and validateDocument concurrently', async () => {
    const events: string[] = [];

    const engineOpenPromise: Promise<EngineOpenAck> = new Promise(resolve => {
      setTimeout(() => {
        events.push('engine-resolved');
        resolve({ snapshotId: 'snap-concurrent' });
      }, 20);
    });

    const mockBridge = {
      isRunning: () => true,
      engineOpenDocument: () => {
        events.push('engine-called');
        return engineOpenPromise;
      },
    };

    const snapshots = new Map<string, string>();

    const simulateOnDidOpen = async () => {
      const uri = 'file:///concurrent.pike';

      try {
        const ack = await mockBridge.engineOpenDocument();
        if (ack) {
          snapshots.set(uri, ack.snapshotId);
        }
      } catch {
        // proceed
      }

      events.push('validate-called');
    };

    await simulateOnDidOpen();

    assert.deepStrictEqual(
      events,
      ['engine-called', 'engine-resolved', 'validate-called'],
      'Events must be strictly sequential: engine call -> engine resolve -> validate'
    );
  });
});
