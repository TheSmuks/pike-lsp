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
 * #1209: Calculate relevance score for workspace symbol matching.
 * Higher score = better match.
 * Scoring: exact (1000) > prefix (500) > camelCase (200) > substring (100)
 */
function calculateSymbolScore(symbolName: string, query: string): number {
  if (!query) return 0;

  const name = symbolName;
  const queryLower = query.toLowerCase();
  const nameLower = name.toLowerCase();

  // Exact match (case-sensitive)
  if (name === query) return 1000;

  // Exact match (case-insensitive)
  if (nameLower === queryLower) return 900;

  // Prefix match (case-sensitive)
  if (name.startsWith(query)) return 500;

  // Prefix match (case-insensitive)
  if (nameLower.startsWith(queryLower)) return 400;

  // CamelCase matching (e.g., "gV" matches "getValue")
  const camelCaseMatch = query.split('').every((char, idx) => {
    const searchFrom = idx === 0 ? 0 : name.indexOf(query[idx - 1]!, idx - 1) + 1;
    return name.slice(searchFrom).includes(char);
  });
  if (camelCaseMatch) return 200;

  // Substring match (case-insensitive) - lowest priority
  if (nameLower.includes(queryLower)) return 100;

  // No match
  return 0;
}

/**
 * #1209: Workspace symbol with score for ranking
 */
interface ScoredSymbol extends SymbolInformation {
  score: number;
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
    console.time('onDocumentSymbol');
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
      console.timeEnd('onDocumentSymbol');
      return converted;
    } catch (err) {
      log.error(
        `Document symbol failed for ${uri}: ${err instanceof Error ? err.message : String(err)}`
      );
      console.timeEnd('onDocumentSymbol');
      return null;
    }
  });

  /**
   * Workspace symbol handler - search symbols across workspace (Ctrl+T)
   *
   * #1209: Implements scoring model for ranking results:
   * exact (1000) > prefix (500) > camelCase (200) > substring (100)
   *
   * PERF-006: Uses MAX_WORKSPACE_SYMBOLS to limit results.
   */
  connection.onWorkspaceSymbol((params: WorkspaceSymbolParams): SymbolInformation[] => {
    console.time('onWorkspaceSymbol');
    const query = params.query ?? '';
    const limit = LSP.MAX_WORKSPACE_SYMBOLS;

    log.debug('Workspace symbol request', { query, limit });

    try {
      const scoredSymbols: ScoredSymbol[] = [];
      const cachedUris = new Set<string>();

      for (const [uri, cached] of Array.from(documentCache.entries())) {
        cachedUris.add(uri);

        for (const symbol of cached.symbols) {
          // Skip symbols with null names
          if (!symbol.name) continue;

          // #1209: Calculate relevance score
          const score = calculateSymbolScore(symbol.name, query);
          if (score > 0) {
            const line = Math.max(0, (symbol.position?.line ?? 1) - 1);
            scoredSymbols.push({
              name: symbol.name,
              kind: convertSymbolKind(symbol.kind),
              location: {
                uri,
                range: {
                  start: { line, character: 0 },
                  end: { line, character: symbol.name.length },
                },
              },
              score,
            });
          }
        }
      }

      const indexedResults = workspaceIndex.searchSymbols(query, limit);
      for (const indexed of indexedResults) {
        if (cachedUris.has(indexed.location.uri)) {
          continue;
        }

        // #1209: Score indexed results too
        const score = calculateSymbolScore(indexed.name, query);
        scoredSymbols.push({ ...indexed, score: score > 0 ? score : 1 });
      }

      // #1209: Sort by score (descending) and take top N
      scoredSymbols.sort((a, b) => b.score - a.score);
      const results = scoredSymbols.slice(0, limit);

      log.debug('Workspace symbol search complete', {
        query,
        totalCount: scoredSymbols.length,
        returnedCount: results.length,
        topScore: results[0]?.score ?? 0,
      });

      console.timeEnd('onWorkspaceSymbol');
      return results;
    } catch (err) {
      log.error(
        `Workspace symbol failed for query "${query}": ${err instanceof Error ? err.message : String(err)}`
      );
      console.timeEnd('onWorkspaceSymbol');
      return [];
    }
  });
}
