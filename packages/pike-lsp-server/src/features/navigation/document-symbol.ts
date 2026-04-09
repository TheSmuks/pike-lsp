/**
 * Document Symbol Handler
 *
 * Provides hierarchical symbol structure for outline view, breadcrumb
 * navigation, and Go to Symbol in File. Uses PikeSymbol.range and
 * selectionRange from the bridge when available, falling back to
 * heuristic computation.
 */

import type { Connection } from 'vscode-languageserver/node.js';
import { DocumentSymbol } from 'vscode-languageserver/node.js';
import type { TextDocuments } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';
import { convertSymbolKind, getSymbolDetail } from '../symbols.js';
import { detectRoxenModule, enhanceRoxenSymbols } from '../roxen/index.js';
import { detectRXMLStrings, mergeSymbolTrees } from '../rxml/mixed-content.js';

/**
 * Compute the end line (0-based) for a symbol's full range.
 *
 * Strategy:
 * 1. If the bridge provides range.end.line, use it directly.
 * 2. If the symbol has children, recurse into the last child.
 * 3. Otherwise, the body ends on the same line it starts.
 */
function computeEndLine(symbol: PikeSymbol): number {
  if (symbol.range?.end?.line !== undefined) {
    // range is expected in 0-based coordinates from the bridge
    return symbol.range.end.line;
  }

  if (symbol.children && symbol.children.length > 0) {
    const lastChild = symbol.children[symbol.children.length - 1]!;
    return computeEndLine(lastChild);
  }

  // Pike uses 1-based lines; convert to 0-based
  return Math.max(0, (symbol.position?.line ?? 1) - 1);
}

/**
 * Build a 0-based LSP Range from Pike coordinates, clamping negatives.
 */
function lspRange(
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number
): { start: { line: number; character: number }; end: { line: number; character: number } } {
  return {
    start: { line: Math.max(0, startLine), character: Math.max(0, startChar) },
    end: { line: Math.max(0, endLine), character: Math.max(0, endChar) },
  };
}

/**
 * Convert a PikeSymbol to an LSP DocumentSymbol with proper hierarchy.
 *
 * - Selection range points to the symbol name.
 * - Full range covers the entire symbol body (including children).
 * - Children are recursively converted.
 */
export function convertPikeSymbol(pikeSymbol: PikeSymbol): DocumentSymbol {
  const startLine = Math.max(0, (pikeSymbol.position?.line ?? 1) - 1);
  const name = pikeSymbol.name || 'unknown';

  const detail = getSymbolDetail(pikeSymbol);
  const endLine = computeEndLine(pikeSymbol);

  // Selection range: the symbol name.
  // Prefer the bridge-provided selectionRange; fall back to heuristic.
  const selectionRange = pikeSymbol.selectionRange
    ? lspRange(
        pikeSymbol.selectionRange.start.line,
        pikeSymbol.selectionRange.start.character,
        pikeSymbol.selectionRange.end.line,
        pikeSymbol.selectionRange.end.character
      )
    : lspRange(startLine, 0, startLine, name.length);

  // Full range: entire symbol body.
  // Prefer the bridge-provided range; fall back to computed end.
  const range = pikeSymbol.range
    ? lspRange(
        pikeSymbol.range.start.line,
        pikeSymbol.range.start.character,
        pikeSymbol.range.end.line,
        pikeSymbol.range.end.character
      )
    : lspRange(startLine, 0, endLine, 1000);

  const result: DocumentSymbol = {
    name,
    kind: convertSymbolKind(pikeSymbol.kind),
    range,
    selectionRange,
  };

  if (detail) {
    result.detail = detail;
  }

  if (pikeSymbol.children && pikeSymbol.children.length > 0) {
    result.children = pikeSymbol.children.map(convertPikeSymbol);
  }

  return result;
}

/**
 * Register document symbol handler with the LSP connection.
 */
export function registerDocumentSymbolHandler(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
  const log = new Logger('document-symbol');

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
        log.debug('No cached symbols', { uri });
        return null;
      }

      // Filter out invalid symbols (null entries, null names)
      const filtered = cached.symbols.filter((s): s is PikeSymbol => s != null && s.name != null);

      log.debug('Converting symbols', {
        uri,
        count: filtered.length,
        total: cached.symbols.length,
      });

      // --- Roxen module enhancement ---
      try {
        const document = documents.get(uri);
        if (document && services.bridge?.bridge) {
          const text = document.getText();

          const roxenInfo = await detectRoxenModule(text, uri, services.bridge.bridge);
          if (roxenInfo && roxenInfo.is_roxen_module === 1) {
            const baseConverted = filtered.map(convertPikeSymbol);
            const enhanced = enhanceRoxenSymbols(baseConverted, roxenInfo);
            log.debug('Enhanced symbols with Roxen data', {
              uri,
              baseCount: filtered.length,
              enhancedCount: enhanced.length,
            });
            return enhanced;
          }

          // --- Mixed RXML content ---
          const rxmlStrings = await detectRXMLStrings(text, uri, services.bridge.bridge);
          if (rxmlStrings.length > 0) {
            const baseConverted = filtered.map(convertPikeSymbol);
            const merged = mergeSymbolTrees(baseConverted, rxmlStrings);
            log.debug('Merged Pike + RXML symbols', {
              uri,
              pikeCount: filtered.length,
              rxmlCount: rxmlStrings.length,
              mergedCount: merged.length,
            });
            return merged;
          }
        }
      } catch (err) {
        log.warn('Roxen/RXML enhancement failed, returning base symbols', {
          uri,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      return filtered.map(convertPikeSymbol);
    } catch (err) {
      log.error('Document symbol failed', {
        uri,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  });
}
