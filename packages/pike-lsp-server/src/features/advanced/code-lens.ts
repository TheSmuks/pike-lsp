/**
 * Code Lens Handler
 *
 * Provides reference counts in code.
 * KB-1262: Parse-under-edit resilience
 */

import { Connection, CodeLens, Position } from 'vscode-languageserver/node.js';
import { TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import { buildCodeLensCommand } from '../../utils/code-lens.js';
import { buildRunnableCodeLensCommand } from '../../utils/code-lens.js';
import { Logger } from '@pike-lsp/core';
import { isTestFile, discoverTestFunctions, getTestPattern } from '../testing/test-discovery.js';
import { RequestScheduler, RequestSupersededError } from '../../services/request-scheduler.js';
import { toSchedulerMetricsLogPayload } from '../utils/scheduler-metrics.js';

/**
 * Register code lens handlers.
 */
export function registerCodeLensHandlers(
  connection: Connection,
  services: Services,
  _documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
  const log = new Logger('Advanced');

  // KB-1262: Request scheduler for resilient code lens requests
  const lensScheduler = new RequestScheduler({ logger: log });
  const LENS_SCHEDULER_LOG_EVERY = 50;
  let lensRequestsObserved = 0;

  function maybeLogLensSchedulerMetrics(uri: string, outcome: string): void {
    lensRequestsObserved += 1;
    if (lensRequestsObserved % LENS_SCHEDULER_LOG_EVERY !== 0) {
      return;
    }

    const schedulerMetrics = lensScheduler.snapshotMetrics();
    log.debug('Code lens scheduler metrics', {
      uri,
      outcome,
      samples: lensRequestsObserved,
      ...toSchedulerMetricsLogPayload(schedulerMetrics),
    });
  }

  // Code lens cache: URI -> { version, lenses }
  // Prevents regenerating lenses when switching tabs if document hasn't changed
  const codeLensCache = new Map<string, { version: number; lenses: CodeLens[] }>();

  // Resolved code lens cache: URI -> { version, refCounts: Map<symbolName, refCount> }
  // Prevents re-resolving lenses on window focus changes
  const resolvedLensCache = new Map<string, { version: number; refCounts: Map<string, number> }>();

  /**
   * Code Lens handler - provide inline annotations
   * KB-1262: Parse-under-edit resilience with cancellation support
   */
  connection.onCodeLens(async (params, cancellationToken): Promise<CodeLens[]> => {
    const uri = params.textDocument.uri;
    log.debug('Code lens request', { uri });

    // KB-1262: Check cancellation early
    if (cancellationToken?.isCancellationRequested) {
      maybeLogLensSchedulerMetrics(uri, 'cancelled-early');
      return [];
    }

    try {
      const result = await lensScheduler.schedule<CodeLens[]>({
        requestClass: 'interactive',
        key: `code-lens:${uri}`,
        run: async checkpoint => {
          checkpoint();

          if (cancellationToken?.isCancellationRequested) {
            throw new RequestSupersededError('Code lens request cancelled');
          }

          const cache = documentCache.get(uri);

          if (!cache) {
            maybeLogLensSchedulerMetrics(uri, 'no-cache');
            return [];
          }

          // Check if we have cached lenses for this document version
          const cached = codeLensCache.get(uri);
          if (cached && cached.version === cache.version) {
            log.debug('Code lens cache hit', { uri, version: cache.version });
            maybeLogLensSchedulerMetrics(uri, 'cache-hit');
            return cached.lenses;
          }

          const lenses: CodeLens[] = [];
          const runnableConfig = services.globalSettings.runnable ?? {};
          const runnableEnabled = runnableConfig.showCodeLens !== false;
          const testPattern = getTestPattern(runnableConfig.testPattern);
          const isFileTestFile = isTestFile(uri);

          // KB-1262: Wrap discoverTestFunctions in try-catch for parse-under-edit safety
          let testFunctions: { name: string }[] = [];
          try {
            testFunctions = isFileTestFile ? discoverTestFunctions(cache.symbols, testPattern) : [];
          } catch (err) {
            log.debug('Test function discovery failed (likely parse-under-edit)', {
              uri,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          const testFunctionNames = new Set(testFunctions.map(t => t.name));

          if (runnableEnabled && isFileTestFile && testFunctions.length > 0) {
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

          // KB-1262: Check cancellation before heavy symbol iteration
          if (cancellationToken?.isCancellationRequested) {
            throw new RequestSupersededError('Code lens request cancelled before symbol iteration');
          }

          for (const symbol of cache.symbols) {
            // KB-1262: Wrap per-symbol lens generation to isolate failures
            try {
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
              // KB-1262: Gracefully handle per-symbol failures (likely parse-under-edit)
              log.debug('Code lens generation failed for symbol (likely parse-under-edit)', {
                uri,
                symbolName: symbol.name ?? 'unknown',
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          // Cache the lenses for this document version
          codeLensCache.set(uri, { version: cache.version, lenses });

          connection.console.log(
            `[CODE_LENS] Generated ${lenses.length} lenses (cached for v${cache.version})`
          );
          return lenses;
        },
      });

      maybeLogLensSchedulerMetrics(uri, 'success');
      return result;
    } catch (err) {
      // KB-1262: RequestSupersededError means a newer request replaced this one
      if (err instanceof RequestSupersededError) {
        maybeLogLensSchedulerMetrics(uri, 'superseded');
        return [];
      }

      // KB-1262: Distinguish parse-under-edit (debug) from unexpected (error)
      const msg = err instanceof Error ? err.message : String(err);
      const isParseError = /parse|syntax|under.edit/i.test(msg);
      if (isParseError) {
        log.debug('Code lens failed (likely parse-under-edit)', { uri, error: msg });
      } else {
        log.error(`Code lens failed for ${uri}: ${msg}`);
      }
      maybeLogLensSchedulerMetrics(uri, 'error');
      return [];
    }
  });

  /**
   * Code Lens resolve handler - compute reference counts
   * KB-1262: Parse-under-edit resilience with cancellation support
   */
  connection.onCodeLensResolve(async (lens, cancellationToken): Promise<CodeLens> => {
    // KB-1262: Check cancellation early
    if (cancellationToken?.isCancellationRequested) {
      return lens;
    }

    try {
      const result = await lensScheduler.schedule<CodeLens>({
        requestClass: 'interactive',
        key: `code-lens-resolve:${(lens.data as { uri?: string } | undefined)?.uri ?? ''}:${(lens.data as { symbolName?: string } | undefined)?.symbolName ?? ''}`,
        run: async checkpoint => {
          checkpoint();

          if (cancellationToken?.isCancellationRequested) {
            throw new RequestSupersededError('Code lens resolve request cancelled');
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
            maybeLogLensSchedulerMetrics(data.uri, 'resolved-runnable');
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
              maybeLogLensSchedulerMetrics(data.uri, 'resolved-cache-hit');
              return lens;
            }
          }

          // KB-1262: Check cancellation before heavy ref-count computation
          if (cancellationToken?.isCancellationRequested) {
            throw new RequestSupersededError('Code lens resolve cancelled before ref-count');
          }

          // Compute ref count
          let refCount = 0;

          if (currentCache && currentCache.symbolPositions) {
            const positions = currentCache.symbolPositions.get(data.symbolName);
            refCount = positions?.length ?? 0;
          }

          // KB-1262: Wrap per-URI ref counting to isolate failures
          const entries = Array.from(documentCache.entries());
          for (const [entryUri, cache] of entries) {
            if (entryUri !== data.uri && cache.symbolPositions) {
              try {
                const positions = cache.symbolPositions.get(data.symbolName);
                if (positions) {
                  refCount += positions.length;
                }
              } catch (err) {
                // KB-1262: Gracefully handle per-URI ref count failures
                log.debug('Ref count lookup failed for URI (likely parse-under-edit)', {
                  uri: entryUri,
                  symbolName: data.symbolName,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
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
          maybeLogLensSchedulerMetrics(data.uri, 'resolved');
          return lens;
        },
      });

      return result;
    } catch (err) {
      // KB-1262: RequestSupersededError means a newer request replaced this one
      if (err instanceof RequestSupersededError) {
        const data =
          lens.data && typeof lens.data === 'object' ? (lens.data as { uri?: string }) : undefined;
        maybeLogLensSchedulerMetrics(data?.uri ?? 'unknown', 'superseded');
        return lens;
      }

      // KB-1262: Distinguish parse-under-edit (debug) from unexpected (error)
      const data =
        lens.data && typeof lens.data === 'object'
          ? (lens.data as { symbolName?: string; uri?: string })
          : undefined;
      const msg = err instanceof Error ? err.message : String(err);
      const isParseError = /parse|syntax|under.edit/i.test(msg);
      if (isParseError) {
        log.debug('Code lens resolve failed (likely parse-under-edit)', {
          symbolName: data?.symbolName ?? 'unknown',
          uri: data?.uri ?? 'unknown',
          error: msg,
        });
      } else {
        log.error(
          `Code lens resolve failed for symbol "${data?.symbolName ?? 'unknown'}" in ${data?.uri ?? 'unknown'}: ${msg}`
        );
      }
      maybeLogLensSchedulerMetrics(data?.uri ?? 'unknown', 'resolve-error');
      return lens;
    }
  });
}
