/**
 * Symbols Feature Handlers
 *
 * Provides document symbols (outline view) and workspace symbols (search).
 * Extracted from server.ts for modular feature organization.
 */

import type { Connection } from 'vscode-languageserver/node.js';
import {
  DocumentSymbol,
  SymbolKind,
  SymbolInformation,
  WorkspaceSymbolParams,
} from 'vscode-languageserver/node.js';
import type { TextDocuments } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from '../services/index.js';
import { Logger } from '@pike-lsp/core';
import { LSP } from '../constants/index.js';
import { detectRoxenModule, enhanceRoxenSymbols } from './roxen/index.js';
import { detectRXMLStrings, mergeSymbolTrees } from './rxml/mixed-content.js';

type WorkspaceSymbolMatchTier = 'exact' | 'prefix' | 'camel' | 'substring' | 'none';

interface RankedWorkspaceSymbol {
  symbol: SymbolInformation;
  score: number;
}

/**
 * Convert Pike symbol kind to LSP SymbolKind.
 *
 * Exported for direct unit testing.
 */
export function convertSymbolKind(kind: string): SymbolKind {
  switch (kind) {
    case 'class':
      return SymbolKind.Class;
    case 'method':
      return SymbolKind.Method;
    case 'variable':
      return SymbolKind.Variable;
    case 'constant':
      return SymbolKind.Constant;
    case 'typedef':
      return SymbolKind.TypeParameter;
    case 'enum':
      return SymbolKind.Enum;
    case 'enum_constant':
      return SymbolKind.EnumMember;
    case 'inherit':
      return SymbolKind.Class;
    case 'import':
      return SymbolKind.Module;
    case 'module':
      return SymbolKind.Module;
    default:
      return SymbolKind.Variable;
  }
}

/**
 * Get detail string for symbol (type info).
 *
 * Exported for direct unit testing.
 */
export function getSymbolDetail(symbol: PikeSymbol): string | undefined {
  // Type info is in various fields depending on symbol kind
  const sym = symbol as unknown as Record<string, unknown>;
  let detail: string | undefined;

  if (sym['returnType']) {
    const returnType = sym['returnType'] as { name?: string };
    const argTypes = sym['argTypes'] as Array<{ name?: string }> | undefined;
    const args = argTypes?.map(t => t?.name ?? 'mixed').join(', ') ?? '';
    detail = `${returnType.name ?? 'mixed'}(${args})`;
  } else if (sym['type']) {
    const type = sym['type'] as { name?: string };
    detail = type.name;
  }

  // Add inheritance info
  if (sym['inherited']) {
    const from = sym['inheritedFrom'] as string | undefined;
    const inheritInfo = from ? `(from ${from})` : '(inherited)';
    detail = detail ? `${detail} ${inheritInfo}` : inheritInfo;
  }

  // Add conditional compilation info
  // Pike returns: conditional: 1 (flag), condition: string, branch: number
  if (sym['conditional']) {
    const branch = sym['branch'] as number | undefined;
    const condition = sym['condition'] as string | undefined;
    const conditionPrefix = branch === 0 ? '#if' : '#elif';
    const conditionalInfo = `[${conditionPrefix} ${condition || ''}]`;
    detail = detail ? `${detail}  ${conditionalInfo}` : conditionalInfo;
  }

  return detail;
}

/**
 * Register symbols handlers with the LSP connection.
 *
 * @param connection - LSP connection
 * @param services - Server services bundle
 * @param documents - Text document manager
 */
export function registerSymbolsHandlers(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache, workspaceIndex } = services;
  const log = new Logger('symbols');

  const buildAcronym = (name: string): string => {
    const initials: string[] = [];
    const letters = Array.from(name);
    for (let i = 0; i < letters.length; i++) {
      const ch = letters[i]!;
      const prev = i > 0 ? letters[i - 1]! : '';
      const isUpper = ch >= 'A' && ch <= 'Z';
      const startsWord =
        i === 0 ||
        prev === '_' ||
        prev === '-' ||
        prev === '.' ||
        (isUpper && prev >= 'a' && prev <= 'z');

      if (startsWord && /[A-Za-z0-9]/.test(ch)) {
        initials.push(ch.toLowerCase());
      }
    }

    if (initials.length === 0 && name.length > 0) {
      initials.push(name[0]!.toLowerCase());
    }

    return initials.join('');
  };

  const matchTier = (name: string, queryLower: string): WorkspaceSymbolMatchTier => {
    if (!queryLower) {
      return 'none';
    }
    const nameLower = name.toLowerCase();
    if (nameLower === queryLower) {
      return 'exact';
    }
    if (nameLower.startsWith(queryLower)) {
      return 'prefix';
    }
    if (buildAcronym(name).startsWith(queryLower)) {
      return 'camel';
    }
    if (nameLower.includes(queryLower)) {
      return 'substring';
    }
    return 'none';
  };

  const scoreSymbol = (symbol: SymbolInformation, queryLower: string): number => {
    const tier = matchTier(symbol.name, queryLower);
    if (tier === 'none') {
      return Number.NEGATIVE_INFINITY;
    }

    const tierScore =
      tier === 'exact'
        ? 400_000
        : tier === 'prefix'
          ? 300_000
          : tier === 'camel'
            ? 200_000
            : 100_000;
    const nameLower = symbol.name.toLowerCase();
    const startIndex = nameLower.indexOf(queryLower);
    const startPenalty = startIndex < 0 ? 0 : Math.min(startIndex, 500);
    const lengthPenalty = Math.min(symbol.name.length, 1000);
    const linePenalty = Math.min(symbol.location.range.start.line, 100_000) / 100_000;
    return tierScore - startPenalty * 100 - lengthPenalty - linePenalty;
  };

  const compareRanked = (a: RankedWorkspaceSymbol, b: RankedWorkspaceSymbol): number => {
    if (Math.abs(a.score - b.score) > 0.0001) {
      return b.score - a.score;
    }
    if (a.symbol.name.length !== b.symbol.name.length) {
      return a.symbol.name.length - b.symbol.name.length;
    }
    const nameCmp = a.symbol.name.localeCompare(b.symbol.name);
    if (nameCmp !== 0) {
      return nameCmp;
    }
    const uriCmp = a.symbol.location.uri.localeCompare(b.symbol.location.uri);
    if (uriCmp !== 0) {
      return uriCmp;
    }
    return a.symbol.location.range.start.line - b.symbol.location.range.start.line;
  };

  const insertTopN = (
    top: RankedWorkspaceSymbol[],
    candidate: RankedWorkspaceSymbol,
    n: number
  ) => {
    if (n <= 0) {
      return;
    }

    if (top.length >= n) {
      const worst = top[top.length - 1]!;
      if (compareRanked(candidate, worst) >= 0) {
        return;
      }
    }

    let insertAt = top.length;
    for (let i = 0; i < top.length; i++) {
      if (compareRanked(candidate, top[i]!) < 0) {
        insertAt = i;
        break;
      }
    }

    top.splice(insertAt, 0, candidate);
    if (top.length > n) {
      top.pop();
    }
  };

  /**
   * Convert Pike symbol to LSP DocumentSymbol
   */
  function convertSymbol(pikeSymbol: PikeSymbol): DocumentSymbol {
    const line = Math.max(0, (pikeSymbol.position?.line ?? 1) - 1);
    const name = pikeSymbol.name || 'unknown';

    const detail = getSymbolDetail(pikeSymbol);

    const result: DocumentSymbol = {
      name,
      kind: convertSymbolKind(pikeSymbol.kind),
      range: {
        start: { line, character: 0 },
        end: { line, character: 1000 }, // Full line range
      },
      selectionRange: {
        start: { line, character: 0 },
        end: { line, character: name.length },
      },
    };

    if (detail) {
      result.detail = detail;
    }

    // Recursively convert children (nested class members)
    if (pikeSymbol.children && pikeSymbol.children.length > 0) {
      result.children = pikeSymbol.children.map(convertSymbol);
    }

    return result;
  }

  /**
   * Document symbols handler - provides outline view
   */
  connection.onDocumentSymbol(async (params): Promise<DocumentSymbol[] | null> => {
    const uri = params.textDocument.uri;

    log.debug('Document symbol request', { uri });

    try {
      let cached = documentCache.get(uri);

      if (!cached) {
        await documentCache.waitFor(uri);
        cached = documentCache.get(uri);
      }

      if (!cached || !cached.symbols) {
        connection.console.log(`[SYMBOLS] No cached symbols for ${uri}`);
        return null;
      }

      // Filter out invalid symbols and convert
      const filtered = cached.symbols.filter((s): s is PikeSymbol => s != null && s.name != null);
      connection.console.log(
        `[SYMBOLS] Returning ${filtered.length} symbols (from ${cached.symbols.length} cached)`
      );

      // Log first few symbols for debugging
      for (let i = 0; i < Math.min(5, filtered.length); i++) {
        const sym = filtered[i]!;
        connection.console.log(`[SYMBOLS]   ${i}: name="${sym.name}", kind=${sym.kind}`);
      }

      // --- Roxen symbols integration ---
      const symbolsToConvert = filtered;
      try {
        const document = documents.get(uri);
        if (document && services.bridge?.bridge) {
          const text = document.getText();
          const roxenInfo = await detectRoxenModule(text, uri, services.bridge.bridge);
          if (roxenInfo && roxenInfo.is_roxen_module === 1) {
            const baseConverted = filtered.map(convertSymbol);
            const enhanced = enhanceRoxenSymbols(baseConverted, roxenInfo);
            connection.console.log(
              `[SYMBOLS] Enhanced ${filtered.length} symbols with Roxen data -> ${enhanced.length} total`
            );
            return enhanced;
          }

          // --- Mixed RXML content integration ---
          // Detect RXML strings in Pike multiline strings
          const rxmlStrings = await detectRXMLStrings(text, uri, services.bridge.bridge);
          if (rxmlStrings.length > 0) {
            connection.console.log(
              `[SYMBOLS] Found ${rxmlStrings.length} RXML strings in Pike code`
            );
            const baseConverted = filtered.map(convertSymbol);
            const merged = mergeSymbolTrees(baseConverted, rxmlStrings);
            connection.console.log(
              `[SYMBOLS] Merged ${filtered.length} Pike symbols + ${rxmlStrings.length} RXML strings -> ${merged.length} total`
            );
            return merged;
          }
          // --- End mixed content integration ---
        }
      } catch (err) {
        connection.console.log(`[SYMBOLS] Roxen enhancement failed: ${err}`);
      }
      // --- End Roxen integration ---

      const converted = symbolsToConvert.map(convertSymbol);
      return converted;
    } catch (err) {
      log.error(
        `Document symbol failed for ${uri}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  });

  /**
   * Workspace symbol handler - search symbols across workspace (Ctrl+T)
   *
   * PERF-006: Uses MAX_WORKSPACE_SYMBOLS to limit results.
   * NOTE: Current LSP version is 3.17 (vscode-languageserver 9.0.1).
   * WorkspaceSymbolParams.limit was added in LSP 3.18.
   * We implement server-side limiting to avoid overwhelming the client.
   * Upgrade tracking: track under a future LSP 3.18 milestone
   */
  connection.onWorkspaceSymbol((params: WorkspaceSymbolParams): SymbolInformation[] => {
    const query = params.query;
    const limit = LSP.MAX_WORKSPACE_SYMBOLS;

    log.debug('Workspace symbol request', { query, limit });

    try {
      const allSymbols: RankedWorkspaceSymbol[] = [];
      const queryLower = query?.toLowerCase() ?? '';
      const dedupeKey = new Set<string>();
      const cachedUris = new Set<string>();

      const maybeInsert = (symbol: SymbolInformation): void => {
        const key = `${symbol.name}:${symbol.location.uri}:${symbol.location.range.start.line}`;
        if (dedupeKey.has(key)) {
          return;
        }
        dedupeKey.add(key);

        if (queryLower.length > 0 && matchTier(symbol.name, queryLower) === 'none') {
          return;
        }

        const score = queryLower.length > 0 ? scoreSymbol(symbol, queryLower) : 0;
        insertTopN(allSymbols, { symbol, score }, limit);
      };

      for (const [uri, cached] of Array.from(documentCache.entries())) {
        cachedUris.add(uri);
        for (const symbol of cached.symbols) {
          if (!symbol.name) continue;
          const line = Math.max(0, (symbol.position?.line ?? 1) - 1);
          maybeInsert({
            name: symbol.name,
            kind: convertSymbolKind(symbol.kind),
            location: {
              uri,
              range: {
                start: { line, character: 0 },
                end: { line, character: symbol.name.length },
              },
            },
          });
        }
      }

      const indexedResults = workspaceIndex.searchSymbols(query, Math.max(limit * 4, limit + 20));
      for (const indexed of indexedResults) {
        if (cachedUris.has(indexed.location.uri)) {
          continue;
        }
        maybeInsert(indexed);
      }

      const finalSymbols = allSymbols.map(item => item.symbol);

      log.debug('Workspace symbol search complete', {
        query,
        indexedCount: indexedResults.length,
        totalCount: finalSymbols.length,
      });
      return finalSymbols;
    } catch (err) {
      log.error(
        `Workspace symbol failed for query "${query}": ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  });
}
