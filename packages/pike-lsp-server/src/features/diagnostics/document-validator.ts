/**
 * Document Validator
 *
 * Shell for document validation: handles bridge communication, obtains analysis
 * results, and delegates processing to diagnostics-processor.ts.
 *
 * Extracted from index.ts for maintainability (Issue #1289).
 */

import type { Connection, TextDocuments } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import type { CoreDiagnostic } from '../../core/types.js';
import type { AnalysisOperation } from '@pike-lsp/pike-bridge';
import { Logger } from '@pike-lsp/core';
import { computeContentHash, computeLineHashes } from '../../services/document-cache.js';
import { RequestSupersededError } from '../../services/request-scheduler.js';
import type { RequestScheduler } from '../../services/request-scheduler.js';
import { toProtocolDiagnostics } from '../../services/protocol-mappers.js';
import { buildStaleFallbackEntry } from './cache-helpers.js';
import { processAnalysisResults } from './diagnostics-processor.js';
import { type ValidationCycleTracker } from './validation-metrics.js';

export interface DocumentValidatorDeps {
  connection: Connection;
  documents: TextDocuments<TextDocument>;
  services: Services;
  inFlightDiagnosticRequests: Map<string, string>;
  documentSnapshots: Map<string, string>;
  diagnosticsScheduler: RequestScheduler;
  validationCompletions: { value: number };
  cycleTracker: ValidationCycleTracker;
  log: Logger;
}

/**
 * Create a document validator function.
 *
 * INC-002: Accepts classification to reuse computed hashes.
 * LOG-14-01: Logs validation start with version tracking.
 */
export function createDocumentValidator(deps: DocumentValidatorDeps): {
  validateDocument: (
    document: TextDocument,
    classification?: import('./change-detection.js').ChangeClassification,
    shouldContinue?: () => void,
    analysisMode?: 'typing' | 'full'
  ) => Promise<void>;
} {
  const {
    connection,
    documents,
    services,
    inFlightDiagnosticRequests,
    documentSnapshots,
    diagnosticsScheduler,
    validationCompletions,
    cycleTracker,
    log,
  } = deps;

  async function validateDocument(
    document: TextDocument,
    classification?: import('./change-detection.js').ChangeClassification,
    shouldContinue: () => void = () => {},
    analysisMode: 'typing' | 'full' = 'full'
  ): Promise<void> {
    const uri = document.uri;
    const version = document.version;
    const cycleStart = performance.now();
    log.debug('VALIDATE_START', { uri, version });

    const bridge = services.bridge;
    if (!bridge) {
      log.warn('Bridge not available');
      return;
    }

    if (!bridge.isRunning()) {
      connection.console.warn('[VALIDATE] Bridge not running, attempting to start...');
      try {
        await bridge.start();
        log.debug('Bridge started successfully for validation', { uri });
      } catch (err) {
        connection.console.error(`[VALIDATE] Failed to start bridge: ${err}`);
        return;
      }
    }

    const text = document.getText();
    const include: AnalysisOperation[] =
      analysisMode === 'typing'
        ? ['parse', 'diagnostics']
        : ['parse', 'introspect', 'diagnostics', 'tokenize'];

    log.debug('Validating document', { uri, version, length: text.length });

    // INC-002: Compute hashes for incremental change detection
    const contentHash = classification?.newHash ?? computeContentHash(text);
    const lineHashes = classification?.newLineHashes ?? computeLineHashes(text);

    // Extract filename from URI and decode URL encoding
    const filename = decodeURIComponent(uri.replace(/^file:\/\//, ''));

    const toDegradedAnalyzeResponse = (
      message: string
    ): import('@pike-lsp/pike-bridge').AnalyzeResponse => ({
      result: {
        parse: { symbols: [], diagnostics: [] },
        introspect: {
          success: 0,
          symbols: [],
          functions: [],
          variables: [],
          classes: [],
          inherits: [],
          diagnostics: [],
        },
        diagnostics: { diagnostics: [] },
      },
      failures: {
        parse: { message, kind: 'ParseError' },
        diagnostics: { message, kind: 'ParseError' },
      },
    });

    const ensureLatest = (stage: string): boolean => {
      shouldContinue();
      const live = documents.get(uri);
      if (!live || live.version !== version) {
        log.debug('Skipping diagnostics stage for stale version', {
          uri,
          stage,
          validatedVersion: version,
          latestVersion: live?.version,
        });
        return false;
      }
      return true;
    };

    try {
      if (!ensureLatest('pre_analyze')) {
        return;
      }

      // --- Bridge communication: obtain analysis results ---
      log.debug('Calling unified analyze', { filename, version });
      const requestId = `${uri}:${version}:${Date.now()}`;
      const clearInFlightRequest = (): void => {
        inFlightDiagnosticRequests.delete(uri);
      };
      let analyzeResult: import('@pike-lsp/pike-bridge').AnalyzeResponse | null = null;

      try {
        const previousRequestId = inFlightDiagnosticRequests.get(uri);
        if (previousRequestId && previousRequestId !== requestId) {
          try {
            await bridge.engineCancelRequest({ requestId: previousRequestId });
          } catch (err) {
            log.debug('Engine query cancellation for superseded request failed', {
              uri,
              requestId: previousRequestId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const liveBeforeTrack = documents.get(uri);
        if (!liveBeforeTrack || liveBeforeTrack.version !== version) {
          log.debug('Skipping diagnostics request tracking for closed/stale document', {
            uri,
            requestId,
            validatedVersion: version,
            latestVersion: liveBeforeTrack?.version,
          });
          return;
        }

        inFlightDiagnosticRequests.set(uri, requestId);

        // Always use 'latest' snapshot for diagnostics — the fixed-snapshot
        // optimization is for features like hover/definition where stable results
        // matter. For diagnostics, correctness requires querying against the actual
        // current document content. A stale snapshot from a failed or pending
        // engineChangeDocument produces diagnostics for the wrong content.
        const qeResponse = await bridge.engineQuery({
          feature: 'diagnostics',
          requestId,
          snapshot: { mode: 'latest' },
          queryParams: { uri, filename, version, text },
        });
        const responseRevision =
          typeof qeResponse.result['revision'] === 'number'
            ? qeResponse.result['revision']
            : undefined;

        log.debug('Engine query diagnostics response', {
          uri,
          requestId,
          snapshotIdUsed: qeResponse.snapshotIdUsed,
          revision: responseRevision,
        });
        documentSnapshots.set(uri, qeResponse.snapshotIdUsed);

        const candidate = qeResponse.result['analyzeResult'];
        if (candidate && typeof candidate === 'object') {
          analyzeResult = candidate as import('@pike-lsp/pike-bridge').AnalyzeResponse;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/cancel/i.test(message)) {
          log.debug('Engine query diagnostics cancelled', { uri, requestId });
          clearInFlightRequest();
          return;
        }
        log.debug('Engine query diagnostics fallback', { uri, requestId, error: message });
      }

      if (!analyzeResult) {
        log.debug('Engine query diagnostics using analyze fallback', { uri, requestId });
        try {
          analyzeResult = await bridge.analyze(text, include, filename, version);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.warn('Analyze fallback failed, degrading diagnostics', {
            uri,
            requestId,
            error: message,
          });
          analyzeResult = toDegradedAnalyzeResponse(message);
        }
      }

      clearInFlightRequest();

      if (!ensureLatest('post_analyze')) {
        return;
      }

      // Log completion status
      log.debug('Analyze completed', {
        uri,
        hasParse: !!analyzeResult.result?.parse,
        hasIntrospect: !!analyzeResult.result?.introspect,
        hasDiagnostics: !!analyzeResult.result?.diagnostics,
      });

      if (analyzeResult._perf) {
        log.debug('Analyze cache status', { uri, cacheHit: analyzeResult._perf.cache_hit });
      }

      const cacheHit = analyzeResult._perf?.cache_hit ?? false;
      if (analyzeResult.failures && Object.keys(analyzeResult.failures).length > 0) {
        log.debug('Analyze partial failures', {
          uri,
          failures: Object.keys(analyzeResult.failures),
        });
      }

      // --- Extract results with fallback values for partial failures ---
      const degradedFailureMessage =
        analyzeResult.failures?.diagnostics?.message ?? analyzeResult.failures?.parse?.message;

      const parseResultRaw = analyzeResult.result?.parse;
      const introspectResultRaw = analyzeResult.result?.introspect;
      const diagnosticsResultRaw = analyzeResult.result?.diagnostics;

      const parseData = analyzeResult.failures?.parse
        ? { symbols: [], diagnostics: [] }
        : {
            symbols: Array.isArray(parseResultRaw?.symbols) ? parseResultRaw.symbols : [],
            diagnostics: Array.isArray(parseResultRaw?.diagnostics)
              ? parseResultRaw.diagnostics
              : [],
          };
      // Use the introspect result directly from bridge when available,
      // or fall back to empty data on failure.
      const introspectData: import('@pike-lsp/pike-bridge').IntrospectionResult = analyzeResult
        .failures?.introspect
        ? {
            success: 0,
            symbols: [],
            functions: [],
            variables: [],
            classes: [],
            inherits: [],
            diagnostics: [],
          }
        : (introspectResultRaw ?? {
            success: 0,
            symbols: [],
            functions: [],
            variables: [],
            classes: [],
            inherits: [],
            diagnostics: [],
          });
      const diagnosticsData = analyzeResult.failures?.diagnostics
        ? { diagnostics: [] }
        : {
            diagnostics: Array.isArray(diagnosticsResultRaw?.diagnostics)
              ? diagnosticsResultRaw.diagnostics
              : [],
          };
      const tokenizeData = analyzeResult.result?.tokenize?.tokens;

      // --- Delegate to diagnostics processor ---
      await processAnalysisResults(
        { parseData, introspectData, diagnosticsData, tokenizeData, degradedFailureMessage },
        {
          document,
          services,
          connection,
          documents,
          diagnosticsScheduler,
          validationCompletions,
          contentHash,
          lineHashes,
          analysisMode,
          bridge,
          log,
          ensureLatest,
        }
      );

      // Record successful validation cycle metrics
      cycleTracker.record({
        totalMs: performance.now() - cycleStart,
        cacheHit,
        blocked: false,
      });
    } catch (err) {
      if (err instanceof RequestSupersededError) {
        // Record blocked (superseded) validation cycle
        cycleTracker.record({
          totalMs: performance.now() - cycleStart,
          cacheHit: false,
          blocked: true,
        });
        return;
      }
      inFlightDiagnosticRequests.delete(uri);
      const liveDocument = documents.get(uri);
      if (liveDocument && liveDocument.version === version) {
        const fallbackDiagnostic: CoreDiagnostic = {
          severity: 1,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          message: `Parse degraded under active edits: ${
            err instanceof Error ? err.message : String(err)
          }`,
          source: 'pike',
        };
        const staleEntry = buildStaleFallbackEntry(
          services.documentCache.get(uri),
          version,
          [fallbackDiagnostic],
          contentHash,
          lineHashes
        );
        services.documentCache.set(uri, staleEntry);
        connection.sendDiagnostics({
          uri,
          version,
          diagnostics: toProtocolDiagnostics([fallbackDiagnostic]),
        });
      }
      connection.console.error(`[VALIDATE] \u2717 Validation failed for ${uri}: ${err}`);
    }
  }

  return { validateDocument };
}
