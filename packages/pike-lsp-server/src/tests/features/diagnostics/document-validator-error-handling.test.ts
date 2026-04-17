import { describe, expect, it } from 'bun:test';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import {
  createDocumentValidator,
  type DocumentValidatorDeps,
} from '../../../features/diagnostics/document-validator.js';
import type { Connection } from 'vscode-languageserver/node.js';
import type { BridgeManager } from '../../../services/bridge-manager.js';
import type { Logger } from '@pike-lsp/core';

function createMockDocument(uri: string, content: string): TextDocument {
  return {
    uri,
    version: 1,
    getText: () => content,
  } as TextDocument;
}

function createMockConnection(): { connection: Connection; errors: string[]; warns: string[] } {
  const errors: string[] = [];
  const warns: string[] = [];

  return {
    errors,
    warns,
    connection: {
      console: {
        error: (msg: string) => errors.push(msg),
        warn: (msg: string) => warns.push(msg),
        log: () => {},
        info: () => {},
      },
      onNotification: () => {},
      sendNotification: () => {},
      onRequest: () => {},
      sendRequest: () => {},
    } as unknown as Connection,
  };
}

function createMockLogger(): Logger {
  return {
    debug: () => {},
    warn: () => {},
    error: () => {},
    info: () => {},
  } as unknown as Logger;
}

function createMockBridgeManager(startError: Error): BridgeManager {
  return {
    bridge: {
      isRunning: () => false,
      start: async () => {
        throw startError;
      },
      getDiagnostics: () => ({
        options: {
          pikePath: '/usr/bin/pike',
          analyzerPath: '/path/to/analyzer.pike',
        },
      }),
    },
    isRunning: () => false,
    start: async () => {
      throw startError;
    },
  } as unknown as BridgeManager;
}

function createDeps(bridge: BridgeManager): {
  deps: DocumentValidatorDeps;
  connection: { errors: string[]; warns: string[] };
} {
  const { connection, errors, warns } = createMockConnection();
  return {
    connection: { errors, warns },
    deps: {
      connection,
      documents: new Map() as unknown as DocumentValidatorDeps['documents'],
      services: { bridge } as DocumentValidatorDeps['services'],
      inFlightDiagnosticRequests: new Map(),
      documentSnapshots: new Map(),
      diagnosticsScheduler: {
        schedule: async (fn: () => Promise<void>) => fn(),
      } as unknown as DocumentValidatorDeps['diagnosticsScheduler'],
      validationCompletions: { value: 0 },
      cycleTracker: {
        startCycle: () => {},
        endCycle: () => {},
        record: () => {},
      } as unknown as DocumentValidatorDeps['cycleTracker'],
      log: createMockLogger(),
    },
  };
}

describe('Document Validator - Bridge Startup Error Handling', () => {
  it('classifies and reports pike-not-found error', async () => {
    const err = new Error('spawn ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    err.path = '/usr/bin/pike';

    const bridge = createMockBridgeManager(err);
    const { deps, connection } = createDeps(bridge);
    const { validateDocument } = createDocumentValidator(deps);
    const doc = createMockDocument('file:///test.pike', 'int x;');

    await validateDocument(doc);

    expect(connection.errors.length).toBeGreaterThan(0);
    const errorMsg = connection.errors[0];
    expect(errorMsg).toContain('Pike executable not found');
    expect(errorMsg).toContain('Install Pike');
    expect(errorMsg).toContain('/usr/bin/pike');
    expect(errorMsg).toContain('ENOENT');
  });

  it('classifies and reports pike-not-executable error', async () => {
    const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
    err.code = 'EACCES';
    err.path = '/usr/bin/pike';

    const bridge = createMockBridgeManager(err);
    const { deps, connection } = createDeps(bridge);
    const { validateDocument } = createDocumentValidator(deps);
    const doc = createMockDocument('file:///test.pike', 'int x;');

    await validateDocument(doc);

    expect(connection.errors.length).toBeGreaterThan(0);
    const errorMsg = connection.errors[0];
    expect(errorMsg).toContain('permission denied');
    expect(errorMsg).toContain('execute permission');
  });

  it('classifies and reports script-not-found error', async () => {
    const err = new Error('ENOENT: no such file') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    err.path = '/path/to/analyzer.pike';

    const bridge = createMockBridgeManager(err);
    const { deps, connection } = createDeps(bridge);
    const { validateDocument } = createDocumentValidator(deps);
    const doc = createMockDocument('file:///test.pike', 'int x;');

    await validateDocument(doc);

    expect(connection.errors.length).toBeGreaterThan(0);
    const errorMsg = connection.errors[0];
    expect(errorMsg).toContain('analyzer script not found');
    expect(errorMsg).toContain('/path/to/analyzer.pike');
  });

  it('handles unknown errors gracefully', async () => {
    const err = new Error('Some unexpected error');

    const bridge = createMockBridgeManager(err);
    const { deps, connection } = createDeps(bridge);
    const { validateDocument } = createDocumentValidator(deps);
    const doc = createMockDocument('file:///test.pike', 'int x;');

    await validateDocument(doc);

    expect(connection.errors.length).toBeGreaterThan(0);
    const errorMsg = connection.errors[0];
    expect(errorMsg).toContain('Pike bridge failed to start');
    expect(errorMsg).toContain('Some unexpected error');
  });
});
