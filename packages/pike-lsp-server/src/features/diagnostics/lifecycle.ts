import type {
  Connection,
  DidChangeConfigurationParams,
  Range,
  TextDocuments,
} from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import type { PikeSettings } from '../../core/types.js';
import type { RequestScheduler } from '../../services/request-scheduler.js';
import { RequestSupersededError } from '../../services/request-scheduler.js';
import type { DocumentCache } from '../../services/document-cache.js';
import type { TypeDatabase } from '../../type-database.js';
import type { WorkspaceIndex } from '../../workspace-index.js';
import type { Logger } from '@pike-lsp/core';

interface RegisterDiagnosticsLifecycleHandlersArgs {
  connection: Connection;
  documents: TextDocuments<TextDocument>;
  services: Services;
  documentCache: DocumentCache;
  typeDatabase: TypeDatabase;
  workspaceIndex: WorkspaceIndex;
  diagnosticsScheduler: RequestScheduler;
  defaultSettings: PikeSettings;
  getGlobalSettings: () => PikeSettings;
  setGlobalSettings: (settings: PikeSettings) => void;
  pendingChangeStates: Map<string, { range: Range | undefined; hasMultipleChanges: boolean }>;
  documentSnapshots: Map<string, string>;
  inFlightDiagnosticRequests: Map<string, string>;
  validationTimers: Map<string, ReturnType<typeof setTimeout>>;
  validationVersions: Map<string, number>;
  validateDocument: (
    document: TextDocument,
    forcedRange?: Range,
    checkpoint?: () => void
  ) => Promise<void>;
  validateDocumentDebounced: (document: TextDocument) => void;
  log: Logger;
}

export function registerDiagnosticsLifecycleHandlers(
  args: RegisterDiagnosticsLifecycleHandlersArgs
): void {
  const {
    connection,
    documents,
    services,
    documentCache,
    typeDatabase,
    workspaceIndex,
    diagnosticsScheduler,
    defaultSettings,
    getGlobalSettings,
    setGlobalSettings,
    pendingChangeStates,
    documentSnapshots,
    inFlightDiagnosticRequests,
    validationTimers,
    validationVersions,
    validateDocument,
    validateDocumentDebounced,
    log,
  } = args;

  connection.onDidChangeConfiguration((change: DidChangeConfigurationParams) => {
    const settings = change.settings as { pike?: Partial<PikeSettings> } | undefined;
    setGlobalSettings({
      ...defaultSettings,
      ...(settings?.pike ?? {}),
    });

    services.bridge
      ?.engineUpdateConfig({
        settings: {
          pike: settings?.pike ?? {},
        },
      })
      .catch(err => {
        log.debug('Engine config update failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

    documents.all().forEach(document => {
      const globalSettings = getGlobalSettings();
      const promise = diagnosticsScheduler.schedule({
        requestClass: 'background',
        key: `diagnostics:${document.uri}`,
        coalesceMs: globalSettings.diagnosticDelay,
        run: async checkpoint => {
          checkpoint();
          await validateDocument(document, undefined, checkpoint);
        },
      });
      documentCache.setPending(document.uri, promise);
      promise.catch(err => {
        if (err instanceof RequestSupersededError) {
          return;
        }
        log.error('Config-change validation failed', {
          uri: document.uri,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });
  });

  documents.onDidOpen(event => {
    log.debug('Document opened', { uri: event.document.uri });
    services.bridge
      ?.engineOpenDocument({
        uri: event.document.uri,
        languageId: event.document.languageId,
        version: event.document.version,
        text: event.document.getText(),
      })
      .then(ack => {
        documentSnapshots.set(event.document.uri, ack.snapshotId);
      })
      .catch(err => {
        log.debug('Engine open document failed', {
          uri: event.document.uri,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    const promise = validateDocument(event.document);
    documentCache.setPending(event.document.uri, promise);
    promise.catch(err => {
      if (err instanceof RequestSupersededError) {
        return;
      }
      log.error('Document open validation failed', {
        uri: event.document.uri,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  documents.onDidChangeContent(change => {
    validateDocumentDebounced(change.document);
  });

  connection.onDidChangeTextDocument(params => {
    const contentChanges = params.contentChanges;
    let changeRange: Range | undefined;

    if (contentChanges.length > 0) {
      const firstChange = contentChanges[0];
      if (firstChange && 'range' in firstChange && firstChange.range) {
        changeRange = firstChange.range;
      }
    }

    const existingChangeState = pendingChangeStates.get(params.textDocument.uri);
    const hasMultipleChanges = Boolean(existingChangeState) || contentChanges.length > 1;

    pendingChangeStates.set(params.textDocument.uri, {
      range: changeRange,
      hasMultipleChanges,
    });

    const changes = contentChanges.map(change => {
      const record: Record<string, unknown> = {
        text: change.text,
      };
      if ('range' in change && change.range) {
        record['range'] = change.range;
      }
      return record;
    });

    services.bridge
      ?.engineChangeDocument({
        uri: params.textDocument.uri,
        version: params.textDocument.version,
        changes,
      })
      .then(ack => {
        documentSnapshots.set(params.textDocument.uri, ack.snapshotId);
      })
      .catch(err => {
        log.debug('Engine change document failed', {
          uri: params.textDocument.uri,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  });

  documents.onDidSave(event => {
    const promise = validateDocument(event.document);
    documentCache.setPending(event.document.uri, promise);
    promise.catch(err => {
      if (err instanceof RequestSupersededError) {
        return;
      }
      log.error('Document save validation failed', {
        uri: event.document.uri,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  documents.onDidClose(event => {
    services.bridge
      ?.engineCloseDocument({
        uri: event.document.uri,
      })
      .then(() => {
        documentSnapshots.delete(event.document.uri);
      })
      .catch(err => {
        log.debug('Engine close document failed', {
          uri: event.document.uri,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    documentCache.delete(event.document.uri);
    pendingChangeStates.delete(event.document.uri);
    documentSnapshots.delete(event.document.uri);
    inFlightDiagnosticRequests.delete(event.document.uri);

    typeDatabase.removeProgram(event.document.uri);
    workspaceIndex.removeDocument(event.document.uri);

    const timer = validationTimers.get(event.document.uri);
    if (timer) {
      clearTimeout(timer);
      validationTimers.delete(event.document.uri);
    }
    validationVersions.delete(event.document.uri);

    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  });
}
