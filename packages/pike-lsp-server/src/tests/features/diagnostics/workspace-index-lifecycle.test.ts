import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerDiagnosticsLifecycleHandlers } from '../../../features/diagnostics/lifecycle.js';

type OpenHandler = (event: { document: TextDocument }) => void;
type SaveHandler = (event: { document: TextDocument }) => void;
type ChangeHandler = (event: { document: TextDocument }) => void;
type CloseHandler = (event: { document: TextDocument }) => void;

function createMockDocuments() {
  let openHandler: OpenHandler | undefined;
  let saveHandler: SaveHandler | undefined;
  let changeHandler: ChangeHandler | undefined;
  let closeHandler: CloseHandler | undefined;
  const docs = new Map<string, TextDocument>();

  return {
    get(uri: string): TextDocument | undefined {
      return docs.get(uri);
    },
    all(): TextDocument[] {
      return [...docs.values()];
    },
    onDidOpen(handler: OpenHandler): void {
      openHandler = handler;
    },
    onDidSave(handler: SaveHandler): void {
      saveHandler = handler;
    },
    onDidChangeContent(handler: ChangeHandler): void {
      changeHandler = handler;
    },
    onDidClose(handler: CloseHandler): void {
      closeHandler = handler;
    },
    emitOpen(document: TextDocument): void {
      docs.set(document.uri, document);
      openHandler?.({ document });
    },
    emitChange(document: TextDocument): void {
      docs.set(document.uri, document);
      changeHandler?.({ document });
    },
    emitSave(document: TextDocument): void {
      docs.set(document.uri, document);
      saveHandler?.({ document });
    },
    emitClose(document: TextDocument): void {
      docs.delete(document.uri);
      closeHandler?.({ document });
    },
  };
}

describe('Diagnostics lifecycle workspace index sync', () => {
  it('updates workspace index on open/change/save and rehydrates from disk on close', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'pike-lsp-ws-index-'));
    const filePath = path.join(tempDir, 'lifecycle-sync.pike');
    writeFileSync(filePath, 'class DiskClass {}\n', 'utf-8');

    const uri = `file://${filePath}`;
    const openDoc = TextDocument.create(uri, 'pike', 1, 'class LiveClass {}\n');
    const changedDoc = TextDocument.create(uri, 'pike', 2, 'class EditedClass {}\n');

    const documents = createMockDocuments();
    const indexCalls: Array<{ uri: string; content: string; version: number }> = [];
    const removedUris: string[] = [];
    const invalidatedIncludePaths: string[] = [];

    registerDiagnosticsLifecycleHandlers({
      connection: {
        onDidChangeConfiguration() {},
        onDidChangeTextDocument() {},
        sendDiagnostics() {},
      } as any,
      documents: documents as any,
      services: {
        bridge: null,
        includeResolver: {
          invalidate(filePath: string) {
            invalidatedIncludePaths.push(filePath);
          },
        },
      } as any,
      documentCache: {
        setPending() {},
        delete() {},
      } as any,
      typeDatabase: {
        removeProgram() {},
      } as any,
      workspaceIndex: {
        async indexDocument(callUri: string, content: string, version: number) {
          indexCalls.push({ uri: callUri, content, version });
        },
        removeDocument(callUri: string) {
          removedUris.push(callUri);
        },
      } as any,
      diagnosticsScheduler: {
        schedule() {
          return Promise.resolve();
        },
      } as any,
      defaultSettings: {
        pikePath: 'pike',
        maxNumberOfProblems: 100,
        diagnosticDelay: 0,
      },
      getGlobalSettings: () => ({
        pikePath: 'pike',
        maxNumberOfProblems: 100,
        diagnosticDelay: 0,
      }),
      setGlobalSettings() {},
      pendingChangeStates: new Map(),
      documentSnapshots: new Map(),
      inFlightDiagnosticRequests: new Map(),
      validationTimers: new Map(),
      validationVersions: new Map(),
      validateDocument: async () => {},
      validateDocumentDebounced: () => {},
      log: {
        debug() {},
        error() {},
      } as any,
    });

    documents.emitOpen(openDoc);
    documents.emitChange(changedDoc);
    documents.emitSave(changedDoc);
    documents.emitClose(changedDoc);

    await new Promise(resolve => setTimeout(resolve, 25));

    expect(indexCalls[0]).toEqual({ uri, content: openDoc.getText(), version: openDoc.version });
    expect(indexCalls[1]).toEqual({ uri, content: changedDoc.getText(), version: changedDoc.version });
    expect(indexCalls[2]).toEqual({ uri, content: changedDoc.getText(), version: changedDoc.version });

    const closeRehydrateCall = indexCalls[indexCalls.length - 1];
    expect(closeRehydrateCall.uri).toBe(uri);
    expect(closeRehydrateCall.content).toBe('class DiskClass {}\n');
    expect(closeRehydrateCall.version).toBe(0);
    expect(removedUris).toEqual([]);
    expect(invalidatedIncludePaths).toEqual([filePath, filePath, filePath, filePath]);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('removes workspace index entry on close when disk rehydrate fails', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'pike-lsp-ws-index-missing-'));
    const filePath = path.join(tempDir, 'missing-after-close.pike');
    writeFileSync(filePath, 'class Temporary {}\n', 'utf-8');

    const uri = `file://${filePath}`;
    const doc = TextDocument.create(uri, 'pike', 1, 'class Temporary {}\n');
    const documents = createMockDocuments();
    const removedUris: string[] = [];
    const invalidatedIncludePaths: string[] = [];

    registerDiagnosticsLifecycleHandlers({
      connection: {
        onDidChangeConfiguration() {},
        onDidChangeTextDocument() {},
        sendDiagnostics() {},
      } as any,
      documents: documents as any,
      services: {
        bridge: null,
        includeResolver: {
          invalidate(filePath: string) {
            invalidatedIncludePaths.push(filePath);
          },
        },
      } as any,
      documentCache: {
        setPending() {},
        delete() {},
      } as any,
      typeDatabase: {
        removeProgram() {},
      } as any,
      workspaceIndex: {
        async indexDocument() {},
        removeDocument(callUri: string) {
          removedUris.push(callUri);
        },
      } as any,
      diagnosticsScheduler: {
        schedule() {
          return Promise.resolve();
        },
      } as any,
      defaultSettings: {
        pikePath: 'pike',
        maxNumberOfProblems: 100,
        diagnosticDelay: 0,
      },
      getGlobalSettings: () => ({
        pikePath: 'pike',
        maxNumberOfProblems: 100,
        diagnosticDelay: 0,
      }),
      setGlobalSettings() {},
      pendingChangeStates: new Map(),
      documentSnapshots: new Map(),
      inFlightDiagnosticRequests: new Map(),
      validationTimers: new Map(),
      validationVersions: new Map(),
      validateDocument: async () => {},
      validateDocumentDebounced: () => {},
      log: {
        debug() {},
        error() {},
      } as any,
    });

    documents.emitOpen(doc);
    unlinkSync(filePath);
    documents.emitClose(doc);

    await new Promise(resolve => setTimeout(resolve, 25));

    expect(removedUris).toEqual([uri]);
    expect(invalidatedIncludePaths).toEqual([filePath, filePath]);
    rmSync(tempDir, { recursive: true, force: true });
  });
});
