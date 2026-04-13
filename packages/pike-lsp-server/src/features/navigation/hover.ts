/**
 * Hover Handler
 *
 * Provides type information and documentation on hover.
 * KB-1248: Parse-under-edit resilience with snapshot-based queries and cancellation support.
 */

import {
  Connection,
  Hover,
  MarkupKind,
  Position,
  CancellationToken,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { PikeSymbol, PikeType } from '@pike-lsp/pike-bridge';
import { buildHoverContent } from '../utils/hover-builder.js';
import { getWordRangeAtPosition } from '../utils/pike-identifier.js';
import { Logger } from '@pike-lsp/core';
import { getKeywordInfo, getMacroInfo } from './keywords.js';
import { LRUCache } from '../../utils/lru-cache.js';
import { RequestScheduler, RequestSupersededError } from '../../services/request-scheduler.js';
import { toSchedulerMetricsLogPayload } from '../utils/scheduler-metrics.js';

const useQueryEngineHover = process.env['PIKE_LSP_QE2_HOVER'] !== '0';
const inFlightHoverRequests = new Map<string, string>();
const hoverRequestSequence = new Map<string, number>();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Generate cache key from hover request parameters.
 * Keyed by (uri, position, word, contentHash) for cache invalidation on edits.
 */
function makeHoverCacheKey(
  uri: string,
  position: Position,
  word: string,
  contentHash?: string
): string {
  return `${uri}:${position.line}:${position.character}:${word}:${contentHash ?? ''}`;
}

function collectSymbolsByName(symbols: PikeSymbol[], name: string): PikeSymbol[] {
  const matches: PikeSymbol[] = [];

  for (const symbol of symbols) {
    if (symbol.name === name) {
      matches.push(symbol);
    }

    if (symbol.children && symbol.children.length > 0) {
      matches.push(...collectSymbolsByName(symbol.children, name));
    }
  }

  return matches;
}

/**
 * Register hover handler.
 */
export function registerHoverHandler(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache, stdlibIndex } = services;
  const log = new Logger('Navigation');

  // LRU cache for hover results (max 500 entries)
  const hoverCache = new LRUCache<string, Hover>(500);
  let cacheHits = 0;
  let cacheMisses = 0;

  // KB-1248: Request scheduler for resilient hover requests
  const hoverScheduler = new RequestScheduler({ logger: log });
  const HOVER_SCHEDULER_LOG_EVERY = 50;
  let hoverRequestsObserved = 0;

  function maybeLogHoverSchedulerMetrics(uri: string, outcome: string): void {
    hoverRequestsObserved += 1;
    if (hoverRequestsObserved % HOVER_SCHEDULER_LOG_EVERY !== 0) {
      return;
    }

    const schedulerMetrics = hoverScheduler.snapshotMetrics();
    log.debug('Hover scheduler metrics', {
      uri,
      outcome,
      samples: hoverRequestsObserved,
      ...toSchedulerMetricsLogPayload(schedulerMetrics),
    });
  }

  /**
   * KB-1248: Fallback hover using direct bridge call with error resilience.
   * Wraps bridge calls in try-catch to survive parse-under-edit scenarios.
   */
  async function getTypeAtPositionResilient(
    bridge: NonNullable<Services['bridge']>,
    text: string,
    uri: string,
    line: number,
    word: string,
    cancellationToken?: CancellationToken
  ): Promise<{ found: number; type?: string; scopeDepth?: number; declLine?: number } | null> {
    try {
      if (cancellationToken?.isCancellationRequested) {
        return null;
      }

      const result = await bridge.bridge?.getTypeAtPosition(text, uri, line, word);

      if (cancellationToken?.isCancellationRequested) {
        return null;
      }

      return result ?? null;
    } catch (err) {
      // KB-1248: Gracefully handle parse-under-edit errors
      log.debug('Type lookup failed (likely parse-under-edit)', {
        uri,
        line,
        word,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Parse a Hover object from query engine response.
   */
  function parseHoverResponse(raw: Record<string, unknown>): Hover | null {
    const contents = raw['contents'];
    if (!contents) {
      return null;
    }

    // Structured contents: { kind, value }
    if (typeof contents === 'object' && contents !== null) {
      const c = contents as Record<string, unknown>;
      if (typeof c['kind'] === 'string' && typeof c['value'] === 'string') {
        return {
          contents: {
            kind: c['kind'] as (typeof MarkupKind)[keyof typeof MarkupKind],
            value: c['value'],
          },
          range: raw['range'] ?? undefined,
        } as Hover;
      }
    }

    // Plain text contents
    if (typeof contents === 'string') {
      return {
        contents: { kind: MarkupKind.PlainText, value: contents },
        range: raw['range'] ?? undefined,
      } as Hover;
    }

    return null;
  }

  /**
   * Hover handler - show type info and documentation
   * KB-1248: Parse-under-edit resilience with snapshot-based queries
   */
  connection.onHover(async (params, cancellationToken): Promise<Hover | null> => {
    log.debug('Hover request', { uri: params.textDocument.uri });

    const uri = params.textDocument.uri;
    const cached = documentCache.get(uri);
    const document = documents.get(uri);

    if (!cached || !document) {
      return null;
    }

    // Get word and range at position
    const wordResult = getWordRangeAtPosition(document, params.position);
    if (!wordResult) {
      return null;
    }

    const { word, range } = wordResult;

    // Check LRU cache for existing result
    // Use contentHash if available for cache invalidation on edits
    const contentHash = (cached as { contentHash?: string }).contentHash;
    const cacheKey = makeHoverCacheKey(uri, params.position, word, contentHash);
    const cachedHover = hoverCache.get(cacheKey);
    if (cachedHover) {
      cacheHits++;
      log.debug('Hover cache hit', {
        uri,
        word,
        hits: cacheHits,
        misses: cacheMisses,
        cacheSize: hoverCache.size,
      });
      return cachedHover;
    }
    cacheMisses++;

    let hoverResult: Hover | null = null;

    // 0. Check if it's a Pike keyword first (single lookup)
    const keywordInfo = getKeywordInfo(word);
    if (keywordInfo) {
      const categoryLabel =
        keywordInfo.category.charAt(0).toUpperCase() + keywordInfo.category.slice(1);
      // Use code blocks for consistency with symbol hover format
      const hoverContent = `**\`${keywordInfo.name}\`**\n\n\`\`\`pike\nkeyword\n\`\`\`\n\n*${categoryLabel}*\n\n${keywordInfo.description}`;
      hoverResult = {
        contents: {
          kind: MarkupKind.Markdown,
          value: hoverContent,
        },
        range,
      };
    }

    // 0b. Check if it's a Pike predefined macro
    if (!hoverResult) {
      const macroInfo = getMacroInfo(word);
      if (macroInfo) {
        const hoverContent = `**\`${macroInfo.name}\`**\n\n\`\`\`pike\n${macroInfo.expandedValue}\n\`\`\`\n\n*Pike predefined macro*\n\n${macroInfo.description}`;
        hoverResult = {
          contents: {
            kind: MarkupKind.Markdown,
            value: hoverContent,
          },
          range,
        };
      }
    }

    // 1. Try query engine hover path with snapshot isolation
    if (!hoverResult && useQueryEngineHover) {
      const bridge = services.bridge;
      if (bridge?.isRunning?.()) {
        const nextSequence = (hoverRequestSequence.get(uri) ?? 0) + 1;
        hoverRequestSequence.set(uri, nextSequence);
        const requestId = `hover:${uri}:${document.version ?? 0}:${Date.now()}:${nextSequence}`;
        const filename = decodeURIComponent(uri.replace(/^file:\/\//, ''));

        let cancelledByToken = false;
        const cancellationDisposable = cancellationToken?.onCancellationRequested(() => {
          cancelledByToken = true;
          void bridge.engineCancelRequest({ requestId }).catch(error => {
            log.warn('Hover cancellation request failed', {
              uri,
              requestId,
              error,
            });
          });
        });

        const clearInFlight = (): void => {
          if (inFlightHoverRequests.get(uri) === requestId) {
            inFlightHoverRequests.delete(uri);
          }
        };

        try {
          const qeHoverResult = await hoverScheduler.schedule<Hover | null>({
            requestClass: 'interactive',
            key: `hover:${uri}`,
            run: async checkpoint => {
              checkpoint();
              if (cancelledByToken || cancellationToken?.isCancellationRequested) {
                throw new RequestSupersededError('Hover request cancelled by LSP token');
              }

              // Cancel previous in-flight request for same URI
              const previousRequestId = inFlightHoverRequests.get(uri);
              if (previousRequestId && previousRequestId !== requestId) {
                try {
                  await bridge.engineCancelRequest({ requestId: previousRequestId });
                } catch (err) {
                  log.debug('Hover query cancellation for superseded request failed', {
                    uri,
                    requestId: previousRequestId,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              }
              inFlightHoverRequests.set(uri, requestId);

              const snapshotId = services.documentSnapshots?.get(uri);
              const qeResponse = await bridge.engineQuery({
                feature: 'hover',
                requestId,
                snapshot: snapshotId ? { mode: 'fixed', snapshotId } : { mode: 'latest' },
                queryParams: {
                  uri,
                  filename,
                  position: params.position,
                  word,
                },
              });
              checkpoint();

              if (cancelledByToken || cancellationToken?.isCancellationRequested) {
                throw new RequestSupersededError('Hover request cancelled by LSP token');
              }

              // Parse direct hover result
              const directHover = asRecord(qeResponse.result['hover']);
              if (directHover) {
                return parseHoverResponse(directHover);
              }

              // Parse nested result
              const nested = asRecord(qeResponse.result['result']);
              if (nested && nested['status'] !== 'stub') {
                const nestedHover = asRecord(nested['hover']);
                if (nestedHover) {
                  return parseHoverResponse(nestedHover);
                }
              }

              return null;
            },
          });

          clearInFlight();
          cancellationDisposable?.dispose();
          if (qeHoverResult) {
            hoverResult = qeHoverResult;
            maybeLogHoverSchedulerMetrics(uri, 'qe_success');
          }
        } catch (err) {
          clearInFlight();
          cancellationDisposable?.dispose();
          if (err instanceof RequestSupersededError) {
            maybeLogHoverSchedulerMetrics(uri, 'superseded');
            return null;
          }
          maybeLogHoverSchedulerMetrics(uri, 'qe_fallback');
          log.debug('Hover query engine fallback', {
            uri,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // 2. Fallback: try to find symbol in local document (O(1) lookup using symbolNames index)
    // Only do symbol lookup if we don't have a keyword/macro/query-engine result
    let symbol: PikeSymbol | null = null;
    let parentScope: string | undefined;

    if (!hoverResult) {
      symbol = cached.symbolNames?.get(word) ?? null;

      // 2a. For variables, check for scope-aware type with parse-under-edit resilience
      if (symbol && symbol.kind === 'variable' && services.bridge?.bridge) {
        try {
          const text = document.getText();
          const line = params.position.line + 1;

          // KB-1248: Use resilient type lookup that handles parse-under-edit
          const typeResult = await getTypeAtPositionResilient(
            services.bridge,
            text,
            uri,
            line,
            word,
            cancellationToken
          );

          if (typeResult?.found === 1 && typeResult.type) {
            log.info(
              `[SCOPE] ${word} at line ${line}: ${typeResult.type} (depth ${typeResult.scopeDepth})`
            );
            symbol = {
              ...symbol,
              type: pikeTypeFromString(typeResult.type),
            };
          }
        } catch (err) {
          // KB-1248: Already handled in getTypeAtPositionResilient, log for debugging
          log.debug('Scope-aware type lookup failed (handled gracefully)', { word, error: err });
        }
      }
    }

    // 3. If not found, try to find in stdlib
    let isStdlib = false;
    if (!hoverResult && !symbol && stdlibIndex) {
      // Check if it's a known module
      try {
        const moduleInfo = await stdlibIndex.getModule(word);
        if (moduleInfo) {
          // Create a synthetic symbol for the module
          symbol = {
            name: word,
            kind: 'module',
            // We don't have location info for stdlib modules in the editor
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            children: [],
            modifiers: [],
          } as PikeSymbol;
          isStdlib = true;
        }
      } catch (err) {
        // KB-1248: Gracefully handle stdlib lookup failures
        log.debug('Stdlib module lookup failed (handled gracefully)', { word, error: err });
      }
    }

    if (!hoverResult && !symbol) {
      // Cache null results too to avoid repeated lookups of non-existent symbols
      hoverCache.set(cacheKey, null as unknown as Hover);
      return null;
    }

    if (symbol && symbol.kind === 'method') {
      const overloadCandidates = collectSymbolsByName(cached.symbols, symbol.name).filter(
        s => s.kind === 'method'
      );

      if (overloadCandidates.length > 0) {
        const mainSymbol = overloadCandidates.find(
          s => !(s.modifiers?.includes('variant') ?? false)
        );
        const variantSymbols = overloadCandidates.filter(
          s => s.modifiers?.includes('variant') ?? false
        );

        if (mainSymbol) {
          symbol = {
            ...mainSymbol,
            variants: variantSymbols,
          } as PikeSymbol;
        } else if (variantSymbols.length > 0) {
          symbol = {
            ...symbol,
            variants: variantSymbols.filter(s => s !== symbol),
          } as PikeSymbol;
        }
      }
    }

    // Build hover content if not already set (keyword/macro/query-engine case)
    if (!hoverResult && symbol) {
      const content = buildHoverContent(symbol, parentScope);
      if (!content) {
        hoverCache.set(cacheKey, null as unknown as Hover);
        return null;
      }

      hoverResult = {
        contents: {
          kind: MarkupKind.Markdown,
          value: content,
        },
      };

      // Include range for document symbols, omit for stdlib/synthetic symbols
      if (!isStdlib) {
        hoverResult.range = range;
      }
    }

    // Cache the result before returning
    if (hoverResult) {
      hoverCache.set(cacheKey, hoverResult);
    }

    maybeLogHoverSchedulerMetrics(uri, hoverResult ? 'success' : 'null');
    return hoverResult;
  });
}

function pikeTypeFromString(typeName: string): PikeType {
  switch (typeName) {
    case 'int':
    case 'float':
    case 'string':
    case 'array':
    case 'mapping':
    case 'multiset':
    case 'function':
    case 'object':
    case 'program':
    case 'mixed':
    case 'void':
    case 'zero':
    case 'type':
    case 'unknown':
    case '__attribute__':
      return { kind: typeName };
    default:
      return { kind: 'unknown' };
  }
}
