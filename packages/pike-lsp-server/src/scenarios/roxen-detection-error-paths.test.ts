/**
 * Roxen Detection Error Paths: exercises detectRoxenModule through PikeBridge interface
 *
 * Tests error handling, concurrent access, and edge cases for the public
 * detectRoxenModule / invalidateCache / isRoxenModule API surface.
 */

import { describe, it, afterEach } from 'bun:test';
import assert from 'node:assert/strict';
import { detectRoxenModule, invalidateCache, isRoxenModule } from '../features/roxen/detector.js';
import type { PikeBridge, PikeSymbol } from '@pike-lsp/pike-bridge';
import type { RoxenModuleInfo } from '../features/roxen/types.js';

// --- Helpers ---

const roxenInfo: RoxenModuleInfo = {
  is_roxen_module: 1,
  module_type: ['MODULE_TAG'],
  module_name: 'ScenarioModule',
  inherits: ['module'],
  variables: [],
  tags: [],
  lifecycle: {
    callbacks: [],
    has_create: 0,
    has_start: 0,
    has_stop: 0,
    has_status: 0,
    missing_required: [],
  },
};

const nonRoxenInfo: RoxenModuleInfo = {
  is_roxen_module: 0,
  module_type: [],
  module_name: '',
  inherits: [],
  variables: [],
  tags: [],
  lifecycle: {
    callbacks: [],
    has_create: 0,
    has_start: 0,
    has_stop: 0,
    has_status: 0,
    missing_required: [],
  },
};

function mockBridge(
  result: RoxenModuleInfo | (() => Promise<RoxenModuleInfo>)
): Pick<PikeBridge, 'roxenDetect'> {
  return {
    roxenDetect: typeof result === 'function' ? result : async () => result,
  };
}

// Use typed constants to avoid noUncheckedIndexedAccess issues with array indexing
const uriA = 'file:///scenario/a.pike';
const uriB = 'file:///scenario/b.pike';
const uriC = 'file:///scenario/c.pike';

afterEach(() => {
  invalidateCache(uriA);
  invalidateCache(uriB);
  invalidateCache(uriC);
});

// --- Scenario Tests ---

describe('detectRoxenModule error-path scenarios', () => {
  it('returns null and does not cache when bridge throws a generic error', async () => {
    const bridge = mockBridge(async () => {
      throw new Error('network timeout');
    });
    const result = await detectRoxenModule('inherit "module";', uriA, bridge);
    assert.strictEqual(result, null);

    // Second call should hit the bridge again (error is not cached)
    let callCount = 0;
    const countingBridge: Pick<PikeBridge, 'roxenDetect'> = {
      roxenDetect: async () => {
        callCount++;
        throw new Error('fail');
      },
    };
    await detectRoxenModule('code', uriA, countingBridge);
    await detectRoxenModule('code', uriA, countingBridge);
    assert.strictEqual(callCount, 2, 'Bridge should be called again after error (no cache entry)');
  });

  it('returns null when bridge throws a TypeError', async () => {
    const bridge = mockBridge(async () => {
      throw new TypeError('Cannot read property of undefined');
    });
    const result = await detectRoxenModule('inherit "module";', uriA, bridge);
    assert.strictEqual(result, null);
  });

  it('returns null when bridge rejects with a non-Error value', async () => {
    const bridge = mockBridge(async () => {
      throw 'string error';
    });
    const result = await detectRoxenModule('code', uriA, bridge);
    assert.strictEqual(result, null);
  });

  it('returns null when bridge returns is_roxen_module=0', async () => {
    const bridge = mockBridge(nonRoxenInfo);
    const result = await detectRoxenModule('inherit "module";', uriA, bridge);
    assert.strictEqual(result, null);
  });

  it('returns info when bridge returns is_roxen_module=1', async () => {
    const bridge = mockBridge(roxenInfo);
    const result = await detectRoxenModule('inherit "module";', uriA, bridge);
    assert.ok(result);
    assert.strictEqual(result.is_roxen_module, 1);
    assert.strictEqual(result.module_name, 'ScenarioModule');
  });

  it('caches successful result — bridge called once for same URI', async () => {
    let callCount = 0;
    const bridge: Pick<PikeBridge, 'roxenDetect'> = {
      roxenDetect: async () => {
        callCount++;
        return roxenInfo;
      },
    };
    const r1 = await detectRoxenModule('code1', uriA, bridge);
    const r2 = await detectRoxenModule('code2', uriA, bridge);
    assert.strictEqual(callCount, 1, 'Bridge should only be called once for cached URI');
    assert.strictEqual(r1, r2, 'Both results should be the same cached object');
  });

  it('caches null result — bridge called once even when is_roxen_module=0', async () => {
    let callCount = 0;
    const bridge: Pick<PikeBridge, 'roxenDetect'> = {
      roxenDetect: async () => {
        callCount++;
        return nonRoxenInfo;
      },
    };
    await detectRoxenModule('code', uriA, bridge);
    await detectRoxenModule('code', uriA, bridge);
    assert.strictEqual(callCount, 1, 'Null result should also be cached');
  });

  it('invalidateCache forces re-detection', async () => {
    let callCount = 0;
    const bridge: Pick<PikeBridge, 'roxenDetect'> = {
      roxenDetect: async () => {
        callCount++;
        return roxenInfo;
      },
    };
    await detectRoxenModule('code', uriA, bridge);
    assert.strictEqual(callCount, 1);
    invalidateCache(uriA);
    await detectRoxenModule('code', uriA, bridge);
    assert.strictEqual(callCount, 2, 'Bridge should be called again after invalidation');
  });

  it('concurrent detections for different URIs all resolve independently', async () => {
    let callCount = 0;
    const bridge: Pick<PikeBridge, 'roxenDetect'> = {
      roxenDetect: async (_code, filename?: string) => {
        callCount++;
        // Simulate slight delay to exercise concurrency
        await new Promise(r => setTimeout(r, 1));
        return { ...roxenInfo, module_name: filename ?? 'unknown' };
      },
    };

    const results = await Promise.all([
      detectRoxenModule('code1', uriA, bridge),
      detectRoxenModule('code2', uriB, bridge),
      detectRoxenModule('code3', uriC, bridge),
    ]);

    assert.strictEqual(callCount, 3, 'All three URIs should trigger separate bridge calls');
    assert.ok(results[0]);
    assert.ok(results[1]);
    assert.ok(results[2]);
    assert.strictEqual(results[0]!.module_name, uriA);
    assert.strictEqual(results[1]!.module_name, uriB);
    assert.strictEqual(results[2]!.module_name, uriC);
  });

  it('concurrent detections for same URI — cache is not a mutex, both may call bridge', async () => {
    let callCount = 0;
    const bridge: Pick<PikeBridge, 'roxenDetect'> = {
      roxenDetect: async () => {
        callCount++;
        await new Promise(r => setTimeout(r, 5));
        return roxenInfo;
      },
    };

    // Fire two concurrent calls for the same URI.
    // Since cache.get/set are synchronous but the bridge call is async,
    // both calls pass the cache check before either completes.
    // This is expected — the cache does not act as a mutex.
    const [r1, r2] = await Promise.all([
      detectRoxenModule('code', uriA, bridge),
      detectRoxenModule('code', uriA, bridge),
    ]);

    assert.ok(r1);
    assert.ok(r2);
    assert.strictEqual(
      callCount,
      2,
      'Both concurrent calls bypass cache check before either resolves'
    );
  });

  it('bridge receives the code and uri arguments correctly', async () => {
    let receivedCode: string | undefined;
    let receivedFilename: string | undefined;

    const bridge: Pick<PikeBridge, 'roxenDetect'> = {
      roxenDetect: async (code: string, filename?: string) => {
        receivedCode = code;
        receivedFilename = filename;
        return roxenInfo;
      },
    };

    await detectRoxenModule('my code content', uriA, bridge);
    assert.strictEqual(receivedCode, 'my code content');
    assert.strictEqual(receivedFilename, uriA);
  });
});

describe('isRoxenModule edge cases', () => {
  it('returns false for whitespace-only string', () => {
    assert.strictEqual(isRoxenModule('   \t\n  '), false);
  });

  it('returns true for MODULE_SIZE — MARKER_RE matches MODULE_ prefix', () => {
    assert.strictEqual(isRoxenModule('int MODULE_SIZE = 10;'), true, 'MODULE_ prefix is a marker');
  });

  it('returns true for symbol-based register_ detection even without text markers', () => {
    const symbols: PikeSymbol[] = [{ name: 'register_foo', kind: 'method', modifiers: [] }];
    assert.strictEqual(isRoxenModule('int x = 1;', symbols), true);
  });

  it('returns true for deeply nested register_ symbol', () => {
    const symbols: PikeSymbol[] = [
      {
        name: 'Outer',
        kind: 'class',
        modifiers: [],
        children: [
          {
            name: 'Inner',
            kind: 'class',
            modifiers: [],
            children: [{ name: 'register_deep', kind: 'method', modifiers: [] }],
          },
        ],
      },
    ];
    assert.strictEqual(isRoxenModule('int x;', symbols), true);
  });

  it('returns true for deeply nested inherit "module" symbol', () => {
    const symbols: PikeSymbol[] = [
      {
        name: 'Outer',
        kind: 'class',
        modifiers: [],
        children: [
          {
            name: 'Inner',
            kind: 'class',
            modifiers: [],
            children: [{ kind: 'inherit', classname: 'module', name: 'module', modifiers: [] }],
          },
        ],
      },
    ];
    assert.strictEqual(isRoxenModule('int x;', symbols), true);
  });

  it('symbol inherit takes priority over no text markers', () => {
    const symbols: PikeSymbol[] = [
      { kind: 'inherit', classname: 'module', name: 'module', modifiers: [] },
    ];
    assert.strictEqual(isRoxenModule('int main() { return 0; }', symbols), true);
  });
});
