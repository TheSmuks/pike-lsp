import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { queryNavigationLocations } from '../../features/navigation/query-engine.js';

describe('queryNavigationLocations snapshot selection', () => {
  it('uses fixed snapshot when document snapshot id is available', async () => {
    let capturedSnapshot: unknown;
    let capturedQueryParams: Record<string, unknown> | null = null;

    const services = {
      bridge: {
        isRunning: () => true,
        engineQuery: async (payload: {
          snapshot: unknown;
          queryParams: Record<string, unknown>;
        }) => {
          capturedSnapshot = payload.snapshot;
          capturedQueryParams = payload.queryParams;
          return {
            snapshotIdUsed: 'snp-1',
            result: {
              locations: [
                {
                  uri: 'file:///tmp/test.pike',
                  range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 3 },
                  },
                },
              ],
            },
          };
        },
      },
      documentSnapshots: new Map<string, string>([['file:///tmp/test.pike', 'snp-fixed-1']]),
    };

    const document = TextDocument.create('file:///tmp/test.pike', 'pike', 3, 'foo();');

    const result = await queryNavigationLocations(
      services as any,
      'references',
      'file:///tmp/test.pike',
      document,
      { line: 0, character: 1 }
    );

    expect(result?.length).toBe(1);
    expect(capturedSnapshot).toEqual({ mode: 'fixed', snapshotId: 'snp-fixed-1' });
    expect(capturedQueryParams?.['text']).toBeUndefined();
    expect(capturedQueryParams?.['version']).toBeUndefined();
  });
});
