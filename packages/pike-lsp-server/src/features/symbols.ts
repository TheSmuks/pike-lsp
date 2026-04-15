/**
 * Symbols Feature Handlers
 *
 * Provides workspace symbol search (Ctrl+T).
 * Document symbols (outline view) have been moved to navigation/document-symbol.ts.
 *
 * This module retains shared helpers (convertSymbolKind, getSymbolDetail)
 * used by both document and workspace symbol handlers.
 */

import type { Connection } from 'vscode-languageserver/node.js';
import {
  SymbolKind,
  SymbolInformation,
  WorkspaceSymbolParams,
} from 'vscode-languageserver/node.js';
import type { TextDocuments } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol, PikeMethod } from '@pike-lsp/pike-bridge';
import type { Services } from '../services/index.js';
import { Logger } from '@pike-lsp/core';
import { LSP } from '../constants/index.js';

import { formatPikeType } from './utils/pike-type-formatter.js';

/**
 * Convert Pike symbol kind to LSP SymbolKind.
 *
 * Exported for direct unit testing and for use by document-symbol.ts.
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
    case 'macro':
      return SymbolKind.Constant;
    case 'program':
      return SymbolKind.Class;
    default:
      return SymbolKind.Variable;
  }
}

/**
 * Get detail string for symbol (type info).
 *
 * Exported for direct unit testing and for use by document-symbol.ts.
 */
export function getSymbolDetail(symbol: PikeSymbol): string | undefined {
  let detail: string | undefined;

  if (symbol.kind === 'method') {
    const m = symbol as PikeMethod;
    const args = m.argTypes.map(t => formatPikeType(t)).join(', ');
    detail = `${formatPikeType(m.returnType)}(${args})`;
  } else if (symbol.type) {
    detail = formatPikeType(symbol.type);
  }

  // Add inheritance info
  if (symbol.inherited) {
    const inheritInfo = symbol.inheritedFrom ? `(from ${symbol.inheritedFrom})` : '(inherited)';
    detail = detail ? `${detail} ${inheritInfo}` : inheritInfo;
  }

  // Add conditional compilation info
  // Pike returns: conditional: 1 (flag), condition: string, branch: number
  if (symbol.conditional) {
    const conditionPrefix = symbol.branch === 0 ? '#if' : '#elif';
    const conditionalInfo = `[${conditionPrefix} ${symbol.condition || ''}]`;
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
 * Register workspace symbol handler with the LSP connection.
 *
 * Document symbol registration has been moved to navigation/document-symbol.ts.
 * This function now only registers the workspace symbol (Ctrl+T) handler.
 *
 * @param connection - LSP connection
 * @param services - Server services bundle
 * @param documents - Text document manager
 */
export function registerSymbolsHandlers(
  connection: Connection,
  services: Services,
  _documents: TextDocuments<TextDocument>
): void {
  const { documentCache, workspaceIndex } = services;
  const log = new Logger('symbols');

  /**
   * Workspace symbol handler - search symbols across workspace (Ctrl+T)
   *
   * #1209: Implements scoring model for ranking results:
   * exact (1000) > prefix (500) > camelCase (200) > substring (100)
   *
   * PERF-006: Uses MAX_WORKSPACE_SYMBOLS to limit results.
   */
  connection.onWorkspaceSymbol((params: WorkspaceSymbolParams): SymbolInformation[] => {
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

      return results;
    } catch (err) {
      log.error(
        `Workspace symbol failed for query "${query}": ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  });
}
