import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerDiagnosticsLifecycleHandlers } from '../../../features/diagnostics/lifecycle.js';

type CloseHandler = (event: { document: TextDocument }) => void;

function createMockDocuments() {
  let closeHandler: CloseHandler | undefined;
  const docs = new Map<string, TextDocument>();

  return {
    get(uri: string): TextDocument | undefined {
      return docs.get(uri);
    },
    onDidOpen() {},
    onDidSave() {},
    onDidChangeContent() {},
    onDidClose(handler: CloseHandler): void {
      closeHandler = handler;
    },
    emitClose(document: TextDocument): void {
      docs.delete(document.uri);
      closeHandler?.({ document });
    },
  };
}

describe('onDidClose snapshot cleanup', () => {
  it('removes documentSnapshot synchronously on close', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'pike-lsp-close-snap-'));
    const filePath = path.join(tempDir, 'close-snap.pike');
    writeFileSync(filePath, 'class Foo {}\n', 'utf-8');

    const uri = `file://${filePath}`;
    const doc = TextDocument.create(uri, 'pike', 1, 'class Foo {}\n');

    const documents = createMockDocuments();
    const documentSnapshots = new Map<string, string>();
    documentSnapshots.set(uri, 'snapshot-123');

    let engineCloseResolved = false;

    registerDiagnosticsLifecycleHandlers({
      connection: {
        onDidChangeConfiguration() {},
        onDidChangeTextDocument() {},
        sendDiagnostics() {},
      } as any,
      documents: documents as any,
      services: {
        bridge: {
          async engineCloseDocument() {
            // Simulate slow bridge response
            await new Promise(resolve => setTimeout(resolve, 100));
            engineCloseResolved = true;
            return { revision: 1, snapshotId: 'snapshot-123' };
          },
        } as any,
        includeResolver: { invalidate() {} },
      } as any,
      documentCache: { setPending() {}, delete() {} } as any,
      typeDatabase: { removeProgram() {} } as any,
      workspaceIndex: {
        async indexDocument() {},
        removeDocument() {},
      } as any,
      diagnosticsScheduler: { schedule: () => Promise.resolve() } as any,
      defaultSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 0 },
      getGlobalSettings: () => ({ pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 0 }),
      setGlobalSettings() {},
      pendingChangeStates: new Map(),
      documentSnapshots,
      inFlightDiagnosticRequests: new Map(),
      validationTimers: new Map(),
      validationVersions: new Map(),
      validateDocument: async () => {},
      validateDocumentDebounced: () => {},
      log: { debug() {}, error() {} } as any,
    });

    // Snapshot exists before close
    expect(documentSnapshots.has(uri)).toBe(true);

    documents.emitClose(doc);

    // Snapshot is gone synchronously, before engineCloseDocument resolves
    expect(documentSnapshots.has(uri)).toBe(false);
    expect(engineCloseResolved).toBe(false);

    // Wait for engineCloseDocument to settle — no second delete should occur
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(engineCloseResolved).toBe(true);
    expect(documentSnapshots.has(uri)).toBe(false);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('cleans up snapshot even when engineCloseDocument rejects', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'pike-lsp-close-rej-'));
    const filePath = path.join(tempDir, 'close-reject.pike');
    writeFileSync(filePath, 'class Bar {}\n', 'utf-8');

    const uri = `file://${filePath}`;
    const doc = TextDocument.create(uri, 'pike', 1, 'class Bar {}\n');

    const documents = createMockDocuments();
    const documentSnapshots = new Map<string, string>();
    documentSnapshots.set(uri, 'snapshot-456');

    const debugLogs: string[] = [];

    registerDiagnosticsLifecycleHandlers({
      connection: {
        onDidChangeConfiguration() {},
        onDidChangeTextDocument() {},
        sendDiagnostics() {},
      } as any,
      documents: documents as any,
      services: {
        bridge: {
          async engineCloseDocument() {
            throw new Error('bridge crashed');
          },
        } as any,
        includeResolver: { invalidate() {} },
      } as any,
      documentCache: { setPending() {}, delete() {} } as any,
      typeDatabase: { removeProgram() {} } as any,
      workspaceIndex: {
        async indexDocument() {},
        removeDocument() {},
      } as any,
      diagnosticsScheduler: { schedule: () => Promise.resolve() } as any,
      defaultSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 0 },
      getGlobalSettings: () => ({ pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 0 }),
      setGlobalSettings() {},
      pendingChangeStates: new Map(),
      documentSnapshots,
      inFlightDiagnosticRequests: new Map(),
      validationTimers: new Map(),
      validationVersions: new Map(),
      validateDocument: async () => {},
      validateDocumentDebounced: () => {},
      log: {
        debug(_label: string, ctx: Record<string, string>) {
          debugLogs.push(ctx.uri ?? '');
        },
        error() {},
      } as any,
    });

    documents.emitClose(doc);

    // Snapshot removed synchronously despite bridge rejection
    expect(documentSnapshots.has(uri)).toBe(false);

    // Wait for rejection to be caught and logged
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(debugLogs).toContain(uri);

    rmSync(tempDir, { recursive: true, force: true });
  });
});
