/**
 * Hover Handler
 *
 * Provides type information and documentation on hover.
 */

import { Connection, Hover, MarkupKind } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { PikeSymbol, PikeType } from '@pike-lsp/pike-bridge';
import { buildHoverContent } from '../utils/hover-builder.js';
import { getWordRangeAtPosition } from '../utils/pike-identifier.js';
import { Logger } from '@pike-lsp/core';
import { getKeywordInfo, getMacroInfo } from './keywords.js';

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

  /**
   * Hover handler - show type info and documentation
   */
  connection.onHover(async (params): Promise<Hover | null> => {
    log.debug('Hover request', { uri: params.textDocument.uri });
    try {
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

      // 0. Check if it's a Pike keyword first (single lookup)
      const keywordInfo = getKeywordInfo(word);
      if (keywordInfo) {
        const categoryLabel =
          keywordInfo.category.charAt(0).toUpperCase() + keywordInfo.category.slice(1);
        // Use code blocks for consistency with symbol hover format
        const hoverContent = `**\`${keywordInfo.name}\`**\n\n\`\`\`pike\nkeyword\n\`\`\`\n\n*${categoryLabel}*\n\n${keywordInfo.description}`;
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: hoverContent,
          },
          range,
        };
      }

      // 0b. Check if it's a Pike predefined macro
      const macroInfo = getMacroInfo(word);
      if (macroInfo) {
        const hoverContent = `**\`${macroInfo.name}\`**\n\n\`\`\`pike\n${macroInfo.expandedValue}\n\`\`\`\n\n*Pike predefined macro*\n\n${macroInfo.description}`;
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: hoverContent,
          },
          range,
        };
      }

      // 1. Try to find symbol in local document (O(1) lookup using symbolNames index)
      let symbol = cached.symbolNames?.get(word) ?? null;
      let parentScope: string | undefined;

      // 1a. For variables, check for scope-aware type
      if (symbol && symbol.kind === 'variable' && services.bridge?.bridge) {
        try {
          const text = document.getText();
          const line = params.position.line + 1;
          const typeResult = await services.bridge.bridge.getTypeAtPosition(text, uri, line, word);

          if (typeResult.found === 1 && typeResult.type) {
            log.info(
              `[SCOPE] ${word} at line ${line}: ${typeResult.type} (depth ${typeResult.scopeDepth})`
            );
            symbol = {
              ...symbol,
              type: pikeTypeFromString(typeResult.type),
            };
          }
        } catch (err) {
          log.error(`Scope-aware type lookup FAILED for ${word}`, { error: err });
        }
      }

      // 2. If not found, try to find in stdlib
      let isStdlib = false;
      if (!symbol && stdlibIndex) {
        // Check if it's a known module
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
          } as unknown as PikeSymbol;
          isStdlib = true;
        }
      }

      if (!symbol) {
        return null;
      }

      if (symbol.kind === 'method') {
        // PERF-1229: Use pre-built symbolsByName index for O(1) overload lookup instead of O(n) recursive walk
        const overloadCandidates =
          cached.symbolsByName?.get(symbol.name)?.filter(s => s.kind === 'method') ??
          // Fallback to recursive walk if index not available (shouldn't happen after validation)
          collectSymbolsByName(cached.symbols, symbol.name).filter(s => s.kind === 'method');

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

      // Build hover content
      const content = buildHoverContent(symbol, parentScope);
      if (!content) {
        return null;
      }

      const hoverResult: Hover = {
        contents: {
          kind: MarkupKind.Markdown,
          value: content,
        },
      };

      // Include range for document symbols, omit for stdlib/synthetic symbols
      if (!isStdlib) {
        hoverResult.range = range;
      }

      return hoverResult;
    } catch (err) {
      log.error(
        `Hover failed for ${params.textDocument.uri} at line ${params.position.line + 1}, col ${params.position.character}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
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
