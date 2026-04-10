/**
 * Debounced Validation
 *
 * Handles debounced document validation triggered by content changes.
 * Implements version tracking to prevent stale validations, incremental
 * change classification to skip unnecessary re-parses, and diagnostic
 * filtering for skipped validations.
 *
 * Extracted from index.ts for maintainability (Issue #1289).
 */

import type { Connection, Range } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';
import { RequestSupersededError } from '../../services/request-scheduler.js';
import type { RequestScheduler } from '../../services/request-scheduler.js';
import { toProtocolDiagnostics } from '../../services/protocol-mappers.js';
import { classifyChange } from './change-detection.js';
import { applySkippedValidationCacheUpdate } from './cache-helpers.js';

interface PendingChangeState {
  hasMultipleChanges: boolean;
  range: Range | undefined;
}

export interface DebouncedValidationDeps {
  connection: Connection;
  documents: {
    get(uri: string): TextDocument | undefined;
  };
  services: Services;
  validationTimers: Map<string, ReturnType<typeof setTimeout>>;
  validationVersions: Map<string, number>;
  pendingChangeStates: Map<string, PendingChangeState>;
  diagnosticsScheduler: RequestScheduler;
  validateDocument: (
    document: TextDocument,
    classification?: import('./change-detection.js').ChangeClassification,
    shouldContinue?: () => void,
    analysisMode?: 'typing' | 'full'
  ) => Promise<void>;
  log: Logger;
}

/**
 * Create a debounced validation function.
 * Returns the function and the version tracking map.
 */
export function createDebouncedValidation(deps: DebouncedValidationDeps): {
  validateDocumentDebounced: (document: TextDocument) => void;
} {
  const {
    connection,
    documents,
    services,
    validationTimers,
    validationVersions,
    pendingChangeStates,
    diagnosticsScheduler,
    validateDocument,
    log,
  } = deps;

  function validateDocumentDebounced(document: TextDocument): void {
    const uri = document.uri;
    const version = document.version;

    // Clear existing timer
    const existingTimer = validationTimers.get(uri);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // INC-563: Store expected version for this scheduled validation
    // This prevents stale validations from overwriting fresher results after undo
    const expectedVersion = version;
    validationVersions.set(uri, expectedVersion);

    // Set new timer
    const timer = setTimeout(() => {
      validationTimers.delete(uri);

      const liveDocument = documents.get(uri);
      if (!liveDocument) {
        validationVersions.delete(uri);
        pendingChangeStates.delete(uri);
        return;
      }

      // INC-563: Check if this validation is stale (a newer version was scheduled)
      const currentVersion = liveDocument.version;
      if (currentVersion !== expectedVersion) {
        validationVersions.delete(uri);
        // Clear pending change range since we're skipping
        pendingChangeStates.delete(uri);
        return;
      }

      // INC-002: Classify change to determine if parsing is needed
      const changeState = pendingChangeStates.get(uri);
      const cachedEntry = services.documentCache.get(uri);
      const classification = changeState?.hasMultipleChanges
        ? { canSkip: false, reason: 'multiple_change_batch' }
        : classifyChange(liveDocument, changeState?.range, cachedEntry);

      if (classification.canSkip) {
        validationVersions.delete(uri);
        // Skip parsing entirely - just update cache metadata
        if (cachedEntry) {
          applySkippedValidationCacheUpdate(cachedEntry, currentVersion, classification);
        }

        // Clear the pending change range
        pendingChangeStates.delete(uri);

        // When skipping, filter out error diagnostics that overlap with the change range.
        // This prevents stale error diagnostics from persisting after the user fixes code.
        // We only clear errors on lines that actually changed - other errors are kept.
        let diagnosticsToSend = cachedEntry?.diagnostics ?? [];
        if (changeState?.range && cachedEntry?.diagnostics?.length) {
          const changeStartLine = changeState.range.start.line;
          const changeEndLine = changeState.range.end.line;

          // Filter out errors (severity 1) that overlap the change range
          diagnosticsToSend = cachedEntry.diagnostics.filter(d => {
            if (d.severity !== 1) return true; // Keep warnings/hints
            const errorLine = d.range.start.line;
            // Clear errors that overlap or are adjacent to the change
            return errorLine < changeStartLine - 1 || errorLine > changeEndLine + 1;
          });
        }

        // #1066: Persist filtered diagnostics to cache so subsequent skip-path
        // validations don't re-send stale errors that were already filtered.
        if (cachedEntry) {
          const hadErrorDiagnostics = cachedEntry.diagnostics.some(d => d.severity === 1);
          cachedEntry.diagnostics = diagnosticsToSend;
          cachedEntry.analysisState = {
            ...(cachedEntry.analysisState ?? { isStale: false, parseFailed: false }),
            hasErrorDiagnostics:
              hadErrorDiagnostics || diagnosticsToSend.some(d => d.severity === 1),
          };
        }

        connection.sendDiagnostics({
          uri,
          version: currentVersion,
          diagnostics: toProtocolDiagnostics(diagnosticsToSend),
        });
        return;
      }

      // Proceed with full validation
      const promise = diagnosticsScheduler.schedule({
        requestClass: 'typing',
        key: `diagnostics:${uri}`,
        run: async checkpoint => {
          checkpoint();
          await validateDocument(liveDocument, classification, checkpoint, 'typing');
        },
      });
      services.documentCache.setPending(uri, promise);
      promise.finally(() => {
        validationVersions.delete(uri);
      });
      promise.catch(err => {
        if (err instanceof RequestSupersededError) {
          return;
        }
        log.error('Debounced validation failed', {
          uri,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, services.globalSettings.diagnosticDelay);

    validationTimers.set(uri, timer);
  }

  return { validateDocumentDebounced };
}
