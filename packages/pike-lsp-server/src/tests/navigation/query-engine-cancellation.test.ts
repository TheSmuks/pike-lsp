import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { queryNavigationLocations } from '../../features/navigation/query-engine.js';

class FakeCancellationToken {
  private callbacks: Array<() => void> = [];
  isCancellationRequested = false;

  onCancellationRequested(callback: () => void): { dispose: () => void } {
    this.callbacks.push(callback);
    return {
      dispose: () => {
        this.callbacks = this.callbacks.filter(entry => entry !== callback);
      },
    };
  }

  cancel(): void {
    this.isCancellationRequested = true;
    for (const callback of this.callbacks) {
      callback();
    }
  }
}

describe('query-engine cancellation wiring', () => {
  it('forwards cancellation to engineCancelRequest for in-flight navigation query', async () => {
    const document = TextDocument.create('file:///test.pike', 'pike', 1, 'int value = 1;');
    const cancellationToken = new FakeCancellationToken();

    let resolveQuery: ((value: unknown) => void) | null = null;
    const cancelledRequestIds: string[] = [];

    const services = {
      bridge: {
        isRunning: () => true,
        engineQuery: async (_params: unknown) =>
          await new Promise(resolve => {
            resolveQuery = resolve;
          }),
        engineCancelRequest: async ({ requestId }: { requestId: string }) => {
          cancelledRequestIds.push(requestId);
          return { cancelled: true };
        },
      },
    };

    const queryPromise = queryNavigationLocations(
      services as any,
      'definition',
      document.uri,
      document,
      { line: 0, character: 4 },
      {},
      cancellationToken as any
    );

    cancellationToken.cancel();

    expect(cancelledRequestIds.length).toBe(1);
    expect(cancelledRequestIds[0]?.startsWith(`definition:${document.uri}:${document.version}:`)).toBe(
      true
    );

    const firstResolveQuery = resolveQuery;
    if (typeof firstResolveQuery === 'function') {
      firstResolveQuery({
        result: {
          location: {
            uri: document.uri,
            range: {
              start: { line: 0, character: 4 },
              end: { line: 0, character: 9 },
            },
          },
        },
      });
    }

    const result = await queryPromise;
    expect(result).toBeUndefined();
  });

  it('logs warning when cancellation bridge call fails', async () => {
    const document = TextDocument.create('file:///test.pike', 'pike', 1, 'int value = 1;');
    const cancellationToken = new FakeCancellationToken();
    const cancellationError = new Error('cancel bridge failed');
    const warnings: Array<{ message: string; payload: Record<string, unknown> }> = [];

    let resolveQuery: ((value: unknown) => void) | null = null;

    const services = {
      logger: {
        warn: (message: string, payload?: Record<string, unknown>) => {
          warnings.push({ message, payload: payload ?? {} });
        },
      },
      bridge: {
        isRunning: () => true,
        engineQuery: async (_params: unknown) =>
          await new Promise(resolve => {
            resolveQuery = resolve;
          }),
        engineCancelRequest: async () => {
          throw cancellationError;
        },
      },
    };

    const queryPromise = queryNavigationLocations(
      services as any,
      'references',
      document.uri,
      document,
      { line: 0, character: 4 },
      {},
      cancellationToken as any
    );

    cancellationToken.cancel();

    const secondResolveQuery = resolveQuery;
    if (typeof secondResolveQuery === 'function') {
      secondResolveQuery({ result: { result: { status: 'stub' } } });
    }
    const result = await queryPromise;
    expect(result).toBeUndefined();

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(warnings.length).toBe(1);
    expect(warnings[0]?.message).toBe('Navigation cancellation request failed');
    expect(warnings[0]?.payload['feature']).toBe('references');
    expect(warnings[0]?.payload['uri']).toBe(document.uri);
    expect(String(warnings[0]?.payload['requestId']).startsWith(`references:${document.uri}:1:`)).toBe(
      true
    );
    expect(warnings[0]?.payload['error']).toBe(cancellationError);
  });
});
