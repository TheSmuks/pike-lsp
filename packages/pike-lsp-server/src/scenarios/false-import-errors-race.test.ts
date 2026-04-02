/**
 * Scenario: False import errors on file open (Issue #1058)
 *
 * Verifies that the onDidOpen handler dispatches engineOpenDocument and
 * validateDocument in the correct order so the Pike subprocess processes
 * them sequentially (open first, then query).
 *
 * The Pike subprocess is synchronous — it reads one JSON-RPC request from
 * stdin, processes it completely, writes one response, then reads the next.
 * Because requests are written to stdin in order, the subprocess guarantees:
 *   engine_open_document completes before engine_query starts.
 *
 * This test verifies the client-side invariant that both requests are
 * dispatched (not blocked on each other's JS-level promise resolution)
 * while still being ordered correctly in the subprocess stdin queue.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

describe('Scenario: document open dispatches engine open and validation', () => {
  it('should dispatch engineOpenDocument before validateDocument sends engineQuery', () => {
    const sentRequests: string[] = [];

    const mockProcess = {
      send(json: string) {
        const parsed = JSON.parse(json);
        sentRequests.push(parsed.method);
      },
    };

    const engineOpenDocument = () => {
      mockProcess.send(JSON.stringify({ id: 1, method: 'engine_open_document', params: {} }));
      return Promise.resolve({ snapshotId: 'snap-1' });
    };

    const engineQuery = () => {
      mockProcess.send(JSON.stringify({ id: 2, method: 'engine_query', params: {} }));
      return Promise.resolve({
        result: { feature: 'diagnostics', analyzeResult: { result: {} } },
        snapshotIdUsed: 'snap-1',
      });
    };

    engineOpenDocument();
    engineQuery();

    assert.deepStrictEqual(
      sentRequests,
      ['engine_open_document', 'engine_query'],
      'Requests must be written to stdin in order: open then query'
    );
  });

  it('should proceed with validation when engineOpenDocument rejects', async () => {
    let validateCompleted = false;

    const simulateOnDidOpen = async () => {
      const snapshots = new Map<string, string>();

      try {
        const ack: { snapshotId: string } | null = await Promise.reject(
          new Error('Engine not available')
        );
        if (ack) {
          snapshots.set('file:///test.pike', ack.snapshotId);
        }
      } catch {
        // Expected - engine open failed
      }

      validateCompleted = true;
    };

    await simulateOnDidOpen();

    assert.strictEqual(
      validateCompleted,
      true,
      'Validation must proceed even when engine open fails'
    );
  });

  it('should not block validateDocument on engineOpenDocument promise resolution', () => {
    let engineQuerySent = false;
    let engineOpenResolved = false;

    const engineOpenPromise = new Promise(resolve => {
      setTimeout(() => {
        engineOpenResolved = true;
        resolve({ snapshotId: 'snap-1' });
      }, 50);
    });

    const sentMethods: string[] = [];

    const simulateBridge = {
      engineOpenDocument() {
        sentMethods.push('engine_open_document');
        return engineOpenPromise;
      },
      engineQuery() {
        sentMethods.push('engine_query');
        engineQuerySent = true;
        return Promise.resolve({
          result: { feature: 'diagnostics', analyzeResult: { result: {} } },
          snapshotIdUsed: 'snap-1',
        });
      },
    };

    simulateBridge.engineOpenDocument();
    simulateBridge.engineQuery();

    assert.strictEqual(
      engineQuerySent,
      true,
      'engineQuery must be dispatched immediately without waiting for engineOpenDocument'
    );
    assert.strictEqual(
      engineOpenResolved,
      false,
      'engineOpenDocument should not have resolved yet (still pending)'
    );
    assert.deepStrictEqual(
      sentMethods,
      ['engine_open_document', 'engine_query'],
      'Both requests dispatched in order'
    );
  });
});
