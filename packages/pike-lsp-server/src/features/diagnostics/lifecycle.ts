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
import type { AnalysisMode, ChangeClassification } from './change-detection.js';
import { readFile } from 'node:fs/promises';

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
  validationScheduledRevisions?: Map<string, number>;
  validationRevisions?: Map<string, number>;
  publishedDiagnosticRevisions?: Map<string, number>;
  issueValidationRevision?: Map<string, number>;
  validateDocument: (
    document: TextDocument,
    classification?: ChangeClassification,
    checkpoint?: () => void,
    analysisMode?: AnalysisMode
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
    validationScheduledRevisions: _validationScheduledRevisions,
    validationRevisions: _validationRevisions,
    publishedDiagnosticRevisions: _publishedDiagnosticRevisions,
    issueValidationRevision: _issueValidationRevision,
    validateDocument,
    validateDocumentDebounced,
    log,
  } = args;

  const workspaceRehydrateEpochs = new Map<string, number>();

  const bumpWorkspaceRehydrateEpoch = (uri: string): number => {
    const nextEpoch = (workspaceRehydrateEpochs.get(uri) ?? 0) + 1;
    workspaceRehydrateEpochs.set(uri, nextEpoch);
    return nextEpoch;
  };

  const indexWorkspaceDocument = (document: TextDocument): void => {
    try {
      const indexResult = workspaceIndex.indexDocument?.(
        document.uri,
        document.getText(),
        document.version
      );

      Promise.resolve(indexResult).catch(err => {
        log.debug('Workspace index sync failed', {
          uri: document.uri,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    } catch (err) {
      log.debug('Workspace index sync failed', {
        uri: document.uri,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const rehydrateWorkspaceDocumentFromDisk = async (uri: string, epoch: number): Promise<void> => {
    const filePath = decodeURIComponent(uri.replace(/^file:\/\//, ''));
    try {
      const content = await readFile(filePath, 'utf-8');
      if (workspaceRehydrateEpochs.get(uri) !== epoch) {
        return;
      }

      if (documents.get(uri)) {
        return;
      }

      await workspaceIndex.indexDocument(uri, content, 0);

      if (workspaceRehydrateEpochs.get(uri) !== epoch) {
        const openDocument = documents.get(uri);
        if (openDocument) {
          await workspaceIndex.indexDocument(uri, openDocument.getText(), openDocument.version);
        }
      }
    } catch (err) {
      if (workspaceRehydrateEpochs.get(uri) !== epoch) {
        return;
      }

      if (!documents.get(uri)) {
        workspaceIndex.removeDocument(uri);
      }

      const isEnoent =
        err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
      const isClosed = !documents.get(uri);
      log.error(
        isEnoent && isClosed
          ? 'Workspace index rehydrate skipped — file gone and document closed'
          : 'Workspace index rehydrate failed',
        {
          ...(isEnoent && isClosed
            ? { uri }
            : { uri, error: err instanceof Error ? err.message : String(err) }),
        }
      );
    } finally {
      if (workspaceRehydrateEpochs.get(uri) === epoch) {
        workspaceRehydrateEpochs.delete(uri);
      }
    }
  };

  const invalidateIncludeCacheForUri = (uri: string): void => {
    const filePath = decodeURIComponent(uri.replace(/^file:\/\//, ''));
    services.includeResolver?.invalidate(filePath);
  };

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

    const allDocuments = documents.all();
    if (allDocuments.length === 0) {
      return;
    }

    const globalSettings = getGlobalSettings();
    const batchPromise = diagnosticsScheduler.schedule({
      requestClass: 'background',
      key: 'diagnostics:config-change-batch',
      coalesceMs: globalSettings.diagnosticDelay,
      run: async checkpoint => {
        for (const document of allDocuments) {
          checkpoint();
          try {
            await validateDocument(document, undefined, checkpoint);
          } catch (err) {
            if (err instanceof RequestSupersededError) {
              return;
            }
            log.error('Config-change validation failed', {
              uri: document.uri,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      },
    });
    batchPromise.catch(err => {
      if (err instanceof RequestSupersededError) {
        return;
      }
      log.error('Config-change batch validation failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  documents.onDidOpen(event => {
    log.debug('Document opened', { uri: event.document.uri });
    bumpWorkspaceRehydrateEpoch(event.document.uri);
    invalidateIncludeCacheForUri(event.document.uri);
    indexWorkspaceDocument(event.document);

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
    bumpWorkspaceRehydrateEpoch(change.document.uri);
    invalidateIncludeCacheForUri(change.document.uri);
    indexWorkspaceDocument(change.document);
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
    bumpWorkspaceRehydrateEpoch(event.document.uri);
    invalidateIncludeCacheForUri(event.document.uri);
    indexWorkspaceDocument(event.document);

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

  documents.onDidClose(async event => {
    invalidateIncludeCacheForUri(event.document.uri);
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
    const rehydrateEpoch = bumpWorkspaceRehydrateEpoch(event.document.uri);
    await rehydrateWorkspaceDocumentFromDisk(event.document.uri, rehydrateEpoch);

    const timer = validationTimers.get(event.document.uri);
    if (timer) {
      clearTimeout(timer);
      validationTimers.delete(event.document.uri);
    }
    validationVersions.delete(event.document.uri);

    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  });
}
