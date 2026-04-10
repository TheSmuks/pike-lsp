/**
 * Completion Query Engine Integration
 *
 * Handles the query engine completion path — scheduling, cancellation,
 * and enriching query engine results with cached symbols.
 */

import {
  CompletionItem,
  CompletionItemKind,
  CompletionList,
  TextDocument,
} from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from '../../services/index.js';
import { buildCompletionItem } from './completion-helpers.js';
import { RequestScheduler, RequestSupersededError } from '../../services/request-scheduler.js';

const inFlightCompletionRequests = new Map<string, string>();
const completionRequestSequence = new Map<string, number>();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toCompletionItemArray(value: unknown): CompletionItem[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const items: CompletionItem[] = [];
  for (const entry of value) {
    const item = asRecord(entry);
    if (!item) continue;
    if (typeof item['label'] !== 'string') continue;

    const label = item['label'] as string;
    const kindStr = item['kind'] as string | undefined;
    const detail = item['detail'] as string | undefined;

    const kindMap: Record<string, CompletionItemKind> = {
      function: CompletionItemKind.Function,
      class: CompletionItemKind.Class,
      variable: CompletionItemKind.Variable,
      constant: CompletionItemKind.Constant,
      method: CompletionItemKind.Method,
      property: CompletionItemKind.Property,
      enum: CompletionItemKind.Enum,
      interface: CompletionItemKind.Interface,
      module: CompletionItemKind.Module,
    };

    const kind = kindMap[kindStr || ''] || CompletionItemKind.Text;

    const completionItem: CompletionItem = { label, kind };
    if (detail) {
      completionItem.detail = detail;
    }
    items.push(completionItem);
  }
  return items;
}

export function getWordAtPosition(text: string, offset: number): string {
  let start = offset;
  while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
    start--;
  }
  let end = offset;
  while (end < text.length && /\w/.test(text[end] ?? '')) {
    end++;
  }
  return text.slice(start, end);
}

export function getCompletionContext(lineText: string): 'type' | 'expression' {
  const trimmed = lineText.replace(/\w*$/, '').trimEnd();

  if (trimmed.length === 0) {
    return 'type';
  }

  if (/\breturn\s*$/.test(trimmed)) {
    return 'expression';
  }

  const expressionPatterns = [
    /=\s*$/,
    /\[\s*$/,
    /\(\s*$/,
    /,\s*$/,
    /[+\-*/%]\s*$/,
    /[<>]=?\s*$/,
    /[!=]=\s*$/,
    /&&\s*$/,
    /\|\|\s*$/,
    /!\s*$/,
    /\?\s*$/,
    /:\s*$/,
    /=>\s*$/,
  ];

  const typePatterns = [
    /^\s*$/,
    /;\s*$/,
    /\{\s*$/,
    /\b(public|private|protected|static|local|final|constant|optional)\s+$/i,
    /\bclass\s+\w+\s*$/,
    /\binherit\s+$/,
    /\|$/,
    /&$/,
  ];

  for (const pattern of expressionPatterns) {
    if (pattern.test(trimmed)) {
      if (/,\s*$/.test(trimmed)) {
        const beforeComma = trimmed.replace(/,\s*$/, '');
        const lastOpenParen = beforeComma.lastIndexOf('(');
        const lastCloseParen = beforeComma.lastIndexOf(')');

        if (lastOpenParen > lastCloseParen) {
          const beforeParen = beforeComma.slice(0, lastOpenParen).trimEnd();
          if (/\b\w+\s+\w+\s*$/.test(beforeParen)) {
            return 'type';
          }
          return 'expression';
        }

        if (/\)\s*\{/.test(trimmed)) {
          return 'expression';
        }
        return 'expression';
      }

      if (/\(\s*$/.test(trimmed)) {
        if (/\b\w+\s+\w+\s*\(\s*$/.test(trimmed)) {
          return 'type';
        }
        return 'expression';
      }

      if (/:\s*$/.test(trimmed) && /\binherit\s+\w+\s*:\s*$/.test(trimmed)) {
        return 'type';
      }

      return 'expression';
    }
  }

  for (const pattern of typePatterns) {
    if (pattern.test(trimmed)) {
      return 'type';
    }
  }

  return 'type';
}

export function getImportInsertionLine(lines: string[]): number {
  let insertionLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? '').trim();
    if (
      trimmed.startsWith('#include ') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('inherit ')
    ) {
      insertionLine = i + 1;
      continue;
    }
    if (trimmed === '') {
      continue;
    }
    break;
  }
  return insertionLine;
}

export function hasImportStatement(
  lines: string[],
  modulePath: string,
  importKind: 'import' | 'inherit'
): boolean {
  const expected = importKind === 'inherit' ? `inherit ${modulePath};` : `import ${modulePath};`;
  return lines.some(line => line.trim() === expected);
}

/**
 * Try query engine completion path.
 * Returns CompletionList if query engine handled it, undefined to proceed to legacy.
 */
export async function handleQueryEngineCompletion(
  params: import('vscode-languageserver').CompletionParams,
  document: TextDocument,
  uri: string,
  cached: { symbols: PikeSymbol[]; dependencies?: CachedDependencies } | undefined,
  cancellationToken: import('vscode-languageserver').CancellationToken,
  services: Services,
  completionScheduler: RequestScheduler,
  toCompletionList: (items: CompletionItem[]) => CompletionList,
  dedupeCompletionItems: (items: CompletionItem[]) => CompletionItem[],
  addAutoImportCompletions: (
    completions: CompletionItem[],
    params: {
      uri: string;
      prefix: string;
      text: string;
      lineText: string;
      localSymbols: PikeSymbol[];
    }
  ) => Promise<void>,
  addMacrosToCompletions: (
    completions: CompletionItem[],
    existingNames: Set<string>,
    prefix: string
  ) => void,
  maybeLogCompletionSchedulerMetrics: (uri: string, outcome: string) => void
): Promise<CompletionList | undefined> {
  const bridge = services.bridge;
  if (!bridge?.isRunning?.()) {
    return undefined;
  }

  const nextSequence = (completionRequestSequence.get(uri) ?? 0) + 1;
  completionRequestSequence.set(uri, nextSequence);
  const requestId = `completion:${uri}:${document.version}:${Date.now()}:${nextSequence}`;
  const filename = decodeURIComponent(uri.replace(/^file:\/\//, ''));
  let cancelledByToken = false;
  const cancellationDisposable = cancellationToken?.onCancellationRequested(() => {
    cancelledByToken = true;
    void bridge.engineCancelRequest({ requestId }).catch(error => {
      services.logger.warn('Completion cancellation request failed', {
        uri,
        requestId,
        error,
      });
    });
  });
  const clearInFlight = (): void => {
    if (inFlightCompletionRequests.get(uri) === requestId) {
      inFlightCompletionRequests.delete(uri);
    }
  };

  try {
    const scheduledItems = await completionScheduler.schedule<CompletionItem[] | null>({
      requestClass: 'typing',
      key: `completion:${uri}`,
      run: async checkpoint => {
        checkpoint();
        if (cancelledByToken || cancellationToken?.isCancellationRequested) {
          throw new RequestSupersededError('Completion request cancelled by LSP token');
        }
        const previousRequestId = inFlightCompletionRequests.get(uri);
        if (previousRequestId && previousRequestId !== requestId) {
          try {
            await bridge.engineCancelRequest({ requestId: previousRequestId });
          } catch (err) {
            services.logger.debug('Completion query cancellation for superseded request failed', {
              uri,
              requestId: previousRequestId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        inFlightCompletionRequests.set(uri, requestId);
        const snapshotId = services.documentSnapshots?.get(uri);

        const qeResponse = await bridge.engineQuery({
          feature: 'completion',
          requestId,
          snapshot: snapshotId ? { mode: 'fixed', snapshotId } : { mode: 'latest' },
          queryParams: {
            uri,
            filename,
            position: params.position,
            context: params.context ?? null,
          },
        });
        checkpoint();

        if (cancelledByToken || cancellationToken?.isCancellationRequested) {
          throw new RequestSupersededError('Completion request cancelled by LSP token');
        }

        const directItems = toCompletionItemArray(qeResponse.result['items']);
        if (directItems && directItems.length > 0) {
          return directItems;
        }

        const nested = asRecord(qeResponse.result['result']);
        if (nested && nested['status'] !== 'stub') {
          const nestedItems = toCompletionItemArray(nested['items']);
          if (nestedItems && nestedItems.length > 0) {
            return nestedItems;
          }
        }

        return null;
      },
    });

    clearInFlight();
    cancellationDisposable?.dispose();
    if (scheduledItems && scheduledItems.length > 0) {
      const completions = [...scheduledItems];
      const text = document.getText();
      const offset = document.offsetAt(params.position);
      const prefix = getWordAtPosition(text, offset);
      const prefixLower = prefix.toLowerCase();
      const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
      const lineText = text.slice(lineStart, offset);
      const completionContext = getCompletionContext(lineText);

      if (cached) {
        await enrichWithCachedCompletions(
          completions,
          cached,
          prefix,
          prefixLower,
          uri,
          completionContext,
          services
        );
      }

      await addAutoImportCompletions(completions, {
        uri,
        prefix,
        text,
        lineText,
        localSymbols: cached?.symbols ?? [],
      });

      maybeLogCompletionSchedulerMetrics(uri, 'qe_deduped');
      const macroNames = new Set(completions.map(c => c.label));
      addMacrosToCompletions(completions, macroNames, prefix);
      return toCompletionList(dedupeCompletionItems(completions));
    }
    maybeLogCompletionSchedulerMetrics(uri, 'qe_empty');
  } catch (err) {
    clearInFlight();
    cancellationDisposable?.dispose();
    if (err instanceof RequestSupersededError) {
      maybeLogCompletionSchedulerMetrics(uri, 'superseded');
      return toCompletionList([]);
    }
    maybeLogCompletionSchedulerMetrics(uri, 'qe_fallback');
    services.logger.debug('Completion query fallback', {
      uri,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return undefined;
}

export interface CachedDependencies {
  includes?: Array<{ symbols: PikeSymbol[]; originalPath: string; resolvedPath: string }>;
  imports?: Array<{ modulePath: string; isStdlib: boolean; symbols?: PikeSymbol[] }>;
}

/**
 * Enrich query engine results with symbols from cached includes, imports, and waterfall.
 */
async function enrichWithCachedCompletions(
  completions: CompletionItem[],
  cached: { symbols: PikeSymbol[]; dependencies?: CachedDependencies },
  prefix: string,
  prefixLower: string,
  uri: string,
  completionContext: 'type' | 'expression',
  services: Services
): Promise<void> {
  const { logger, moduleContext } = services;
  const existingNames = new Set<string>();
  for (const item of completions) {
    existingNames.add(item.label);
  }
  for (const symbol of cached.symbols) {
    if (symbol.name) {
      existingNames.add(symbol.name);
    }
  }

  // Include symbols
  if (services.includeResolver && cached.dependencies?.includes) {
    for (const include of cached.dependencies.includes) {
      for (const symbol of include.symbols) {
        if (!symbol.name || existingNames.has(symbol.name)) continue;
        if (!prefix || symbol.name.toLowerCase().startsWith(prefixLower)) {
          const item = buildCompletionItem(
            symbol.name,
            symbol,
            `From ${include.originalPath}`,
            undefined,
            completionContext
          );
          item.data = { uri: include.resolvedPath, name: symbol.name };
          completions.push(item);
          existingNames.add(symbol.name);
        }
      }
    }
  }

  // Import symbols
  if (cached.dependencies?.imports) {
    for (const imp of cached.dependencies.imports) {
      if (imp.isStdlib && services.stdlibIndex) {
        try {
          const moduleInfo = await services.stdlibIndex.getModule(imp.modulePath);
          if (moduleInfo?.symbols) {
            for (const [name, symbol] of moduleInfo.symbols) {
              if (existingNames.has(name)) continue;
              if (!prefix || name.toLowerCase().startsWith(prefixLower)) {
                const item = buildCompletionItem(
                  name,
                  symbol,
                  `From ${imp.modulePath}`,
                  undefined,
                  completionContext
                );
                item.data = { modulePath: imp.modulePath, name, isStdlib: true };
                completions.push(item);
                existingNames.add(name);
              }
            }
          }
        } catch (err) {
          logger.debug('Failed to get stdlib import symbols', {
            modulePath: imp.modulePath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (!imp.isStdlib && imp.symbols) {
        for (const symbol of imp.symbols) {
          if (!symbol.name || existingNames.has(symbol.name)) continue;
          if (!prefix || symbol.name.toLowerCase().startsWith(prefixLower)) {
            const item = buildCompletionItem(
              symbol.name,
              symbol,
              `From ${imp.modulePath}`,
              undefined,
              completionContext
            );
            item.data = {
              modulePath: imp.modulePath,
              name: symbol.name,
              isStdlib: false,
            };
            completions.push(item);
            existingNames.add(symbol.name);
          }
        }
      }
    }
  }

  // Waterfall symbols
  const shouldFetchWaterfall =
    prefixLower.length > 0 &&
    !!(cached.dependencies?.includes?.length || cached.dependencies?.imports?.length);

  if (shouldFetchWaterfall && moduleContext && services.bridge?.bridge) {
    try {
      const waterfallResult = await moduleContext.getWaterfallSymbolsForDocument(
        uri,
        '',
        services.bridge.bridge,
        3
      );

      for (const symbol of waterfallResult.symbols) {
        if (!symbol.name || existingNames.has(symbol.name)) continue;
        if (!prefix || symbol.name.toLowerCase().startsWith(prefixLower)) {
          const provenance = symbol.provenance_file
            ? `From ${symbol.provenance_file}`
            : 'Imported symbol';
          completions.push(
            buildCompletionItem(symbol.name, symbol, provenance, undefined, completionContext)
          );
          existingNames.add(symbol.name);
        }
      }
    } catch (err) {
      logger.debug('Failed to get waterfall symbols', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
