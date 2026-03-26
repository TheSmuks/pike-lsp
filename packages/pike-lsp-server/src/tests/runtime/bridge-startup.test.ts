import { ErrorCodes, ResponseError } from 'vscode-languageserver/node.js';
import { ensureBridgeStartupOrThrow } from '../../runtime/bridge-startup.js';

const { describe, expect, it } = require('bun:test');

describe('bridge startup during initialize', () => {
  it('starts bridge without reporting errors when startup succeeds', async () => {
    const logs: string[] = [];
    const consoleErrors: string[] = [];
    const userMessages: string[] = [];

    await ensureBridgeStartupOrThrow({
      bridgeManager: {
        start: async () => undefined,
      },
      log: message => {
        logs.push(message);
      },
      reportConsoleError: message => {
        consoleErrors.push(message);
      },
      showErrorMessage: message => {
        userMessages.push(message);
      },
    });

    expect(logs).toHaveLength(0);
    expect(consoleErrors).toHaveLength(0);
    expect(userMessages).toHaveLength(0);
  });

  it('throws ResponseError and emits user-facing message when startup fails', async () => {
    const logs: string[] = [];
    const consoleErrors: string[] = [];
    const userMessages: string[] = [];

    let caughtError: unknown;
    try {
      await ensureBridgeStartupOrThrow({
        bridgeManager: {
          start: async () => {
            throw new Error('spawn ENOENT');
          },
        },
        log: message => {
          logs.push(message);
        },
        reportConsoleError: message => {
          consoleErrors.push(message);
        },
        showErrorMessage: message => {
          userMessages.push(message);
        },
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(ResponseError);
    const responseError = caughtError as ResponseError<unknown>;
    expect(responseError.code).toBe(ErrorCodes.InternalError);
    expect(responseError.message).toContain('failed to start the Pike bridge during initialization');
    expect(responseError.message).toContain('spawn ENOENT');

    expect(userMessages).toEqual([
      'Pike LSP failed to start the Pike bridge during initialization. Check the configured Pike path and analyzer script.',
    ]);
    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toContain('spawn ENOENT');
    expect(logs.some(message => message.includes('Bridge startup error during initialize'))).toBeTrue();
  });
});
