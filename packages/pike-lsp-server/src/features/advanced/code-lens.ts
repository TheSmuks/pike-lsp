/**
 * Code Lens Handler
 *
 * Provides reference counts in code.
 *
 * KB-1262: Parse-under-edit resilience with scheduler-based execution,
 * cancellation support, and per-symbol error isolation.
 */

import { Connection, CodeLens, Position } from 'vscode-languageserver/node.js';
import { TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import { buildCodeLensCommand } from '../../utils/code-lens.js';
import { buildRunnableCodeLensCommand } from '../../utils/code-lens.js';
import { Logger } from '@pike-lsp/core';
import { isTestFile, discoverTestFunctions, getTestPattern } from '../testing/test-discovery.js';
import { RequestScheduler } from '../../services/request-scheduler.js';
import { toSchedulerMetricsLogPayload } from '../utils/scheduler-metrics.js';

/**
 * Register code lens handlers.
 * KB-1262: Parse-under-edit resilience with snapshot-based queries and error isolation.
 */
export function registerCodeLensHandlers(
  connection: Connection,
  services: Services,
  _documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
  const log = new Logger('Advanced');

  // Code lens cache: URI -> { version, lenses }
  // Prevents regenerating lenses when switching tabs if document hasn't changed
  const codeLensCache = new Map<string, { version: number; lenses: CodeLens[] }>();

  // Resolved code lens cache: URI -> { version, refCounts: Map<symbolName, refCount> }
  // Prevents re-resolving lenses on window focus changes
  const resolvedLensCache = new Map<string, { version: number; refCounts: Map<string, number> }>();

  // KB-1262: Request scheduler for resilient code lens requests
  const codeLensScheduler = new RequestScheduler({ logger: log });
  const CODE_LENS_SCHEDULER_LOG_EVERY = 50;
  let codeLensRequestsObserved = 0;

  function maybeLogCodeLensSchedulerMetrics(uri: string, outcome: string): void {
    codeLensRequestsObserved += 1;
    if (codeLensRequestsObserved % CODE_LENS_SCHEDULER_LOG_EVERY !== 0) {
      return;
    }

    const schedulerMetrics = codeLensScheduler.snapshotMetrics();
    log.debug('Code lens scheduler metrics', {
      uri,
      outcome,
      samples: codeLensRequestsObserved,
      ...toSchedulerMetricsLogPayload(schedulerMetrics),
    });
  }

  /**
   * Code Lens handler - provide inline annotations
   * KB-1262: Parse-under-edit resilience with cancellation support and per-symbol error isolation.
   */
  connection.onCodeLens((params, cancellationToken): CodeLens[] => {
    log.debug('Code lens request', { uri: params.textDocument.uri });

    // KB-1262: Check cancellation early
    if (cancellationToken?.isCancellationRequested) {
      return [];
    }

    try {
      const uri = params.textDocument.uri;
      const cache = documentCache.get(uri);

      if (!cache) {
        return [];
      }

      // Check if we have cached lenses for this document version
      const cached = codeLensCache.get(uri);
      if (cached && cached.version === cache.version) {
        log.debug('Code lens cache hit', { uri, version: cache.version });
        maybeLogCodeLensSchedulerMetrics(uri, 'cache-hit');
        return cached.lenses;
      }

      // KB-1262: Check cancellation before heavy processing
      if (cancellationToken?.isCancellationRequested) {
        return [];
      }

      const lenses: CodeLens[] = [];
      const runnableConfig = services.globalSettings.runnable ?? {};
      const runnableEnabled = runnableConfig.showCodeLens !== false;
      const testPattern = getTestPattern(runnableConfig.testPattern);

      let testFunctions: Array<{ name: string }> = [];
      try {
        const isFileTestFile = isTestFile(uri);
        testFunctions = isFileTestFile ? discoverTestFunctions(cache.symbols, testPattern) : [];
      } catch (err) {
        // KB-1262: Test discovery may fail on malformed intermediate parse states
        log.debug('Test discovery failed (handled gracefully)', {
          uri,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const testFunctionNames = new Set(testFunctions.map(t => t.name));

      if (runnableEnabled && testFunctions.length > 0) {
        lenses.push({
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          data: {
            uri,
            symbolName: '',
            kind: 'file',
            position: { line: 0, character: 0 },
            lensType: 'run-file-tests',
          },
        });
      }

      for (const symbol of cache.symbols) {
        // KB-1262: Per-symbol error isolation - one bad symbol must not break all lenses
        try {
          // KB-1262: Check cancellation between symbol iterations
          if (cancellationToken?.isCancellationRequested) return lenses;

          // Show reference counts for classes, methods, variables, and constants
          if (
            symbol.kind === 'method' ||
            symbol.kind === 'class' ||
            symbol.kind === 'variable' ||
            symbol.kind === 'constant'
          ) {
            const line = Math.max(0, (symbol.position?.line ?? 1) - 1);
            const char = Math.max(0, (symbol.position?.column ?? 1) - 1);
            const symbolName = symbol.name ?? '';

            const position: Position = { line, character: char };

            lenses.push({
              range: {
                start: { line, character: char },
                end: { line, character: char + symbolName.length },
              },
              data: {
                uri,
                symbolName,
                kind: symbol.kind,
                position,
              },
            });

            if (runnableEnabled && symbol.kind === 'method') {
              if (symbolName === 'main') {
                lenses.push({
                  range: {
                    start: { line, character: char },
                    end: { line, character: char + symbolName.length },
                  },
                  data: {
                    uri,
                    symbolName,
                    kind: symbol.kind,
                    position,
                    lensType: 'run-file',
                  },
                });
              } else if (testFunctionNames.has(symbolName)) {
                lenses.push({
                  range: {
                    start: { line, character: char },
                    end: { line, character: char + symbolName.length },
                  },
                  data: {
                    uri,
                    symbolName,
                    kind: symbol.kind,
                    position,
                    lensType: 'run-test',
                  },
                });
              }
            }
          }
        } catch (err) {
          // KB-1262: Skip individual symbol on error, continue with remaining
          log.debug('Code lens symbol processing failed (handled gracefully)', {
            uri,
            symbolName: symbol.name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Cache the lenses for this document version
      codeLensCache.set(uri, { version: cache.version, lenses });

      connection.console.log(
        `[CODE_LENS] Generated ${lenses.length} lenses (cached for v${cache.version})`
      );
      maybeLogCodeLensSchedulerMetrics(uri, 'success');
      return lenses;
    } catch (err) {
      // KB-1262: Gracefully handle parse-under-edit errors
      const errMsg = err instanceof Error ? err.message : String(err);
      const isParseError = /parse|syntax|token/i.test(errMsg);
      if (isParseError) {
        log.debug(`Code lens failed (likely parse-under-edit) for ${params.textDocument.uri}`, { error: errMsg });
      } else {
        log.error(`Code lens failed for ${params.textDocument.uri}: ${errMsg}`);
      }
      maybeLogCodeLensSchedulerMetrics(params.textDocument.uri, 'error');
      return [];
    }
  });

  /**
   * Code Lens resolve handler - compute reference counts
   * KB-1262: Parse-under-edit resilience with per-URI error isolation.
   */
  connection.onCodeLensResolve((lens, cancellationToken): CodeLens => {
    try {
      // KB-1262: Check cancellation early
      if (cancellationToken?.isCancellationRequested) {
        return lens;
      }

      const data = lens.data as {
        uri: string;
        symbolName: string;
        kind: string;
        position: Position;
        lensType?: 'run-file' | 'run-test' | 'run-file-tests';
      };

      if (!data) {
        return lens;
      }

      if (data.lensType === 'run-file' || data.lensType === 'run-test') {
        lens.command = buildRunnableCodeLensCommand(data.lensType, data.uri, data.symbolName);
        return lens;
      }

      const currentCache = documentCache.get(data.uri);
      const currentVersion = currentCache?.version ?? 0;

      // Check resolved cache - prevents re-resolution on window focus changes
      const cached = resolvedLensCache.get(data.uri);
      if (cached && cached.version === currentVersion) {
        const cachedRefCount = cached.refCounts.get(data.symbolName);
        if (cachedRefCount !== undefined) {
          lens.command = buildCodeLensCommand(
            cachedRefCount,
            data.uri,
            data.position,
            data.symbolName
          );
          return lens;
        }
      }

      // KB-1262: Check cancellation before ref-count computation
      if (cancellationToken?.isCancellationRequested) {
        return lens;
      }

      // Compute ref count
      let refCount = 0;

      // KB-1262: Per-URI error isolation - wrap individual cache lookups
      try {
        if (currentCache && currentCache.symbolPositions) {
          const positions = currentCache.symbolPositions.get(data.symbolName);
          refCount = positions?.length ?? 0;
        }
      } catch (err) {
        log.debug('Code lens ref-count for current doc failed (handled gracefully)', {
          uri: data.uri,
          symbolName: data.symbolName,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const entries = Array.from(documentCache.entries());
      for (const [uri, cache] of entries) {
        // KB-1262: Per-URI error isolation in cross-document ref-count computation
        try {
          if (cancellationToken?.isCancellationRequested) return lens;
          if (uri !== data.uri && cache.symbolPositions) {
            const positions = cache.symbolPositions.get(data.symbolName);
            if (positions) {
              refCount += positions.length;
            }
          }
        } catch (err) {
          log.debug('Ref count computation failed for URI (handled gracefully)', {
            uri,
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        }
      }

      // Update cache
      if (!cached || cached.version !== currentVersion) {
        resolvedLensCache.set(data.uri, { version: currentVersion, refCounts: new Map() });
      }
      resolvedLensCache.get(data.uri)!.refCounts.set(data.symbolName, refCount);

      lens.command = buildCodeLensCommand(refCount, data.uri, data.position, data.symbolName);

      connection.console.log(
        `[CODE_LENS] Resolved lens for "${data.symbolName}": ${refCount} refs`
      );
      return lens;
    } catch (err) {
      const data =
        lens.data && typeof lens.data === 'object'
          ? (lens.data as { symbolName?: string; uri?: string })
          : undefined;
      // KB-1262: Gracefully handle resolve failures during parse-under-edit
      const errMsg = err instanceof Error ? err.message : String(err);
      const isParseError = /parse|syntax|token/i.test(errMsg);
      if (isParseError) {
        log.debug('Code lens resolve failed (likely parse-under-edit)', {
          symbolName: data?.symbolName ?? 'unknown',
          uri: data?.uri ?? 'unknown',
          error: errMsg,
        });
      } else {
        log.error(`Code lens resolve failed for "${data?.symbolName ?? 'unknown'}" in ${data?.uri ?? 'unknown'}: ${errMsg}`);
      }
      maybeLogCodeLensSchedulerMetrics(data?.uri ?? 'unknown', 'error');
      return lens;
    }
  });
}
