/**
 * Completion Symbol Resolution
 *
 * Gathers completions from local symbols, includes, imports,
 * waterfall dependencies, and built-in types for general (non-member-access) completion.
 */

import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from '../../services/index.js';
import { buildCompletionItem } from './completion-helpers.js';
import { getWordAtPosition, getCompletionContext } from './completion-qe.js';

interface CachedDocument {
  symbols: PikeSymbol[];
  dependencies?: {
    includes?: Array<{
      symbols: PikeSymbol[];
      originalPath: string;
      resolvedPath: string;
    }>;
    imports?: Array<{
      modulePath: string;
      isStdlib: boolean;
      symbols?: PikeSymbol[];
    }>;
  };
}

/**
 * Collect general completions: local, waterfall, includes, imports, builtins.
 */
export async function collectGeneralCompletions(
  text: string,
  offset: number,
  uri: string,
  cached: CachedDocument,
  services: Services,
  connection: {
    logger: Services['logger'];
    documentCache: Services['documentCache'];
    moduleContext: Services['moduleContext'];
  }
): Promise<CompletionItem[]> {
  const { logger, moduleContext } = connection;
  const completions: CompletionItem[] = [];
  const prefix = await getWordAtPosition(
    text,
    offset,
    services.bridge?.tokenize ? (t: string) => services.bridge!.tokenize(t) : async () => []
  );
  const prefixLower = prefix.toLowerCase();
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const lineText = text.slice(lineStart, offset);
  const completionContext = getCompletionContext(lineText);

  const localSymbolNames = new Set<string>();
  for (const s of cached.symbols) {
    if (s.name) localSymbolNames.add(s.name);
  }

  // Local symbols
  for (const symbol of cached.symbols) {
    if (!symbol.name) continue;
    if (!prefix || symbol.name.toLowerCase().startsWith(prefixLower)) {
      const item = buildCompletionItem(
        symbol.name,
        symbol,
        'Local symbol',
        cached.symbols,
        completionContext
      );
      item.data = { uri, name: symbol.name };
      completions.push(item);
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
        text,
        services.bridge.bridge,
        3
      );
      for (const symbol of waterfallResult.symbols) {
        if (!symbol.name) continue;
        if (localSymbolNames.has(symbol.name)) continue;
        if (!prefix || symbol.name.toLowerCase().startsWith(prefixLower)) {
          const provenance = symbol.provenance_file
            ? `From ${symbol.provenance_file}`
            : 'Imported symbol';
          completions.push(
            buildCompletionItem(symbol.name, symbol, provenance, undefined, completionContext)
          );
        }
      }
    } catch (err) {
      logger.debug('Failed to get waterfall symbols', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Include symbols
  if (services.includeResolver && cached.dependencies?.includes) {
    for (const include of cached.dependencies.includes) {
      for (const symbol of include.symbols) {
        if (!symbol.name) continue;
        if (localSymbolNames.has(symbol.name)) continue;
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
              if (localSymbolNames.has(name)) continue;
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
          if (!symbol.name) continue;
          if (localSymbolNames.has(symbol.name)) continue;
          if (!prefix || symbol.name.toLowerCase().startsWith(prefixLower)) {
            const item = buildCompletionItem(
              symbol.name,
              symbol,
              `From ${imp.modulePath}`,
              undefined,
              completionContext
            );
            item.data = { modulePath: imp.modulePath, name: symbol.name, isStdlib: false };
            completions.push(item);
          }
        }
      }
    }
  }

  return completions;
}

/** Pike built-in types, keywords, and common modules */
const PIKE_BUILTINS: ReadonlyArray<{ name: string; kind: CompletionItemKind }> = [
  { name: 'int', kind: CompletionItemKind.Keyword },
  { name: 'string', kind: CompletionItemKind.Keyword },
  { name: 'float', kind: CompletionItemKind.Keyword },
  { name: 'zero', kind: CompletionItemKind.Keyword },
  { name: 'type', kind: CompletionItemKind.Keyword },
  { name: 'unknown', kind: CompletionItemKind.Keyword },
  { name: 'array', kind: CompletionItemKind.Keyword },
  { name: 'mapping', kind: CompletionItemKind.Keyword },
  { name: 'multiset', kind: CompletionItemKind.Keyword },
  { name: 'object', kind: CompletionItemKind.Keyword },
  { name: 'function', kind: CompletionItemKind.Keyword },
  { name: 'program', kind: CompletionItemKind.Keyword },
  { name: 'mixed', kind: CompletionItemKind.Keyword },
  { name: 'void', kind: CompletionItemKind.Keyword },
  { name: 'class', kind: CompletionItemKind.Keyword },
  { name: 'inherit', kind: CompletionItemKind.Keyword },
  { name: 'import', kind: CompletionItemKind.Keyword },
  { name: 'constant', kind: CompletionItemKind.Keyword },
  { name: 'if', kind: CompletionItemKind.Keyword },
  { name: 'else', kind: CompletionItemKind.Keyword },
  { name: 'for', kind: CompletionItemKind.Keyword },
  { name: 'foreach', kind: CompletionItemKind.Keyword },
  { name: 'while', kind: CompletionItemKind.Keyword },
  { name: 'do', kind: CompletionItemKind.Keyword },
  { name: 'switch', kind: CompletionItemKind.Keyword },
  { name: 'case', kind: CompletionItemKind.Keyword },
  { name: 'default', kind: CompletionItemKind.Keyword },
  { name: 'break', kind: CompletionItemKind.Keyword },
  { name: 'continue', kind: CompletionItemKind.Keyword },
  { name: 'return', kind: CompletionItemKind.Keyword },
  { name: 'public', kind: CompletionItemKind.Keyword },
  { name: 'private', kind: CompletionItemKind.Keyword },
  { name: 'protected', kind: CompletionItemKind.Keyword },
  { name: 'static', kind: CompletionItemKind.Keyword },
  { name: 'final', kind: CompletionItemKind.Keyword },
  { name: 'local', kind: CompletionItemKind.Keyword },
  { name: '__attribute__', kind: CompletionItemKind.Keyword },
  { name: 'int(0..255)', kind: CompletionItemKind.Snippet },
  { name: 'sizeof', kind: CompletionItemKind.Function },
  { name: 'typeof', kind: CompletionItemKind.Function },
  { name: 'Stdio', kind: CompletionItemKind.Module },
  { name: 'Array', kind: CompletionItemKind.Module },
  { name: 'String', kind: CompletionItemKind.Module },
  { name: 'Mapping', kind: CompletionItemKind.Module },
  { name: 'Math', kind: CompletionItemKind.Module },
];

export function addBuiltinCompletions(completions: CompletionItem[], prefix: string): void {
  for (const builtin of PIKE_BUILTINS) {
    if (!prefix || builtin.name.toLowerCase().startsWith(prefix.toLowerCase())) {
      completions.push({ label: builtin.name, kind: builtin.kind });
    }
  }
}
