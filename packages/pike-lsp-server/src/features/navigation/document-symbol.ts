/**
 * Document Symbol Provider
 *
 * Implements textDocument/documentSymbol to return hierarchical DocumentSymbol[]
 * for Pike files. Uses the documentCache to retrieve parsed PikeSymbol[] and maps
 * them to LSP DocumentSymbol[] with proper parent/child hierarchy.
 *
 * #1263: Resilient query-engine pattern with error isolation and CancellationToken support.
 * Migrated from features/symbols.ts for modular organization under navigation/.
 */

import type { Connection } from 'vscode-languageserver/node.js';
import { TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  DocumentSymbol,
  SymbolKind,
  type CancellationToken,
} from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';
import { detectRoxenModule, enhanceRoxenSymbols } from '../roxen/index.js';
import { detectRXMLStrings, mergeSymbolTrees } from '../rxml/mixed-content.js';

/**
 * Map Pike symbol kind to LSP SymbolKind.
 *
 * #1263: Mapping per issue spec:
 *   class→Class, method→Method, function→Function, variable→Variable,
 *   constant→Constant, inherit→Namespace, typedef→TypeParameter.
 * Remaining kinds follow LSP convention.
 */
export function mapSymbolKind(kind: string): SymbolKind {
  switch (kind) {
    case 'class':
      return SymbolKind.Class;
    case 'method':
      return SymbolKind.Method;
    case 'function':
      return SymbolKind.Function;
    case 'variable':
      return SymbolKind.Variable;
    case 'constant':
      return SymbolKind.Constant;
    case 'inherit':
      return SymbolKind.Namespace;
    case 'typedef':
      return SymbolKind.TypeParameter;
    case 'enum':
      return SymbolKind.Enum;
    case 'enum_constant':
      return SymbolKind.EnumMember;
    case 'import':
      return SymbolKind.Module;
    case 'module':
      return SymbolKind.Module;
    default:
      return SymbolKind.Variable;
  }
}

/**
 * Build a detail string from a PikeSymbol.
 *
 * Extracts return type, argument types, inheritance, and conditional info.
 */
export function buildDetail(symbol: PikeSymbol): string | undefined {
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

  if (sym['inherited']) {
    const from = sym['inheritedFrom'] as string | undefined;
    const inheritInfo = from ? `(from ${from})` : '(inherited)';
    detail = detail ? `${detail} ${inheritInfo}` : inheritInfo;
  }

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
 * Convert a single PikeSymbol to an LSP DocumentSymbol.
 *
 * - selectionRange: the symbol name (from PikeSymbol.selectionRange when available,
 *   else computed from position + name length).
 * - range: the entire symbol body (from PikeSymbol.range when available,
 *   else falls back to a single-line range at the symbol position).
 *
 * Recursively converts children for hierarchical outline.
 */
export function convertToDocumentSymbol(pikeSymbol: PikeSymbol): DocumentSymbol {
  const name = pikeSymbol.name || 'unknown';
  const kind = mapSymbolKind(pikeSymbol.kind);

  // Line conversion: Pike uses 1-indexed lines, LSP uses 0-indexed
  const line = Math.max(0, (pikeSymbol.position?.line ?? 1) - 1);
  const column = Math.max(0, (pikeSymbol.position?.column ?? 1) - 1);

  // Use precise ranges from PikeSymbol when available
  const range =
    pikeSymbol.range ??
    {
      start: { line, character: 0 },
      end: { line, character: 1000 },
    };

  const selectionRange =
    pikeSymbol.selectionRange ??
    {
      start: { line, character: column },
      end: { line, character: column + name.length },
    };

  const result: DocumentSymbol = {
    name,
    kind,
    range,
    selectionRange,
  };

  const detail = buildDetail(pikeSymbol);
  if (detail) {
    result.detail = detail;
  }

  // Recursively convert children for hierarchy
  if (pikeSymbol.children && pikeSymbol.children.length > 0) {
    result.children = pikeSymbol.children.map(convertToDocumentSymbol);
  }

  return result;
}

/**
 * Register the document symbol handler with the LSP connection.
 *
 * Follows the resilient query-engine pattern:
 * - try/catch with error isolation per-document
 * - CancellationToken support
 * - Graceful fallbacks on cache miss or parse errors
 * - Roxen/RXML symbol enhancement when applicable
 */
export function registerDocumentSymbolHandler(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
  const log = new Logger('document-symbol');

  connection.onDocumentSymbol(
    async (params, cancellationToken: CancellationToken): Promise<DocumentSymbol[] | null> => {
      const uri = params.textDocument.uri;

      log.debug('Document symbol request', { uri });

      // Check cancellation early
      if (cancellationToken?.isCancellationRequested) {
        return null;
      }

      try {
        // Retrieve cached symbols for the document
        let cached = documentCache.get(uri);

        if (!cached) {
          await documentCache.waitFor(uri);
          cached = documentCache.get(uri);
        }

        // Re-check cancellation after async wait
        if (cancellationToken?.isCancellationRequested) {
          return null;
        }

        if (!cached || !cached.symbols) {
          log.debug('No cached symbols for document', { uri });
          return null;
        }

        // Filter out invalid symbols
        const validSymbols = cached.symbols.filter(
          (s): s is PikeSymbol => s != null && s.name != null
        );

        // Convert to hierarchical LSP DocumentSymbol[]
        let documentSymbols = validSymbols.map(convertToDocumentSymbol);

        // --- Roxen/RXML enhancement ---
        // Enhance symbols with Roxen module data or RXML string detection
        // when applicable. Failures are isolated — base symbols are always returned.
        try {
          const document = documents.get(uri);
          if (document && services.bridge?.bridge) {
            const text = document.getText();

            // Roxen module detection
            const roxenInfo = await detectRoxenModule(text, uri, services.bridge.bridge);
            if (roxenInfo && roxenInfo.is_roxen_module === 1) {
              const enhanced = enhanceRoxenSymbols(documentSymbols, roxenInfo);
              log.debug('Enhanced symbols with Roxen data', {
                uri,
                base: documentSymbols.length,
                enhanced: enhanced.length,
              });
              return enhanced;
            }

            // RXML string detection in Pike multiline strings
            const rxmlStrings = await detectRXMLStrings(text, uri, services.bridge.bridge);
            if (rxmlStrings.length > 0) {
              const merged = mergeSymbolTrees(documentSymbols, rxmlStrings);
              log.debug('Merged Pike + RXML symbols', {
                uri,
                pike: documentSymbols.length,
                rxml: rxmlStrings.length,
                merged: merged.length,
              });
              return merged;
            }
          }
        } catch (err) {
          // Roxen/RXML enhancement failure is non-fatal
          log.debug('Roxen/RXML enhancement failed, returning base symbols', {
            uri,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        log.debug('Returning document symbols', {
          uri,
          count: documentSymbols.length,
        });

        return documentSymbols;
      } catch (error) {
        log.error('Document symbol failed', {
          uri,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }
  );
}
