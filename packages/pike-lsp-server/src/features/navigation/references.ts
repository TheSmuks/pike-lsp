/**
 * References and Implementation Handlers
 *
 * Provides find all references and document highlight.
 */

import {
  Connection,
  Location,
  DocumentHighlight,
  DocumentHighlightKind,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';
import { queryNavigationLocations } from './query-engine.js';
import { basename } from 'node:path';

/**
 * Register references handlers.
 */
export function registerReferencesHandlers(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
  const log = new Logger('Navigation');

  /**
   * References handler - find all references to a symbol (Find References / Show Usages)
   */
  connection.onReferences(async (params, cancellationToken): Promise<Location[]> => {
    log.debug('References request', { uri: params.textDocument.uri, position: params.position });
    try {
      const uri = params.textDocument.uri;
      const document = documents.get(uri);

      if (!document) {
        log.debug('References: no cached document');
        return [];
      }

      const queryLocations = await queryNavigationLocations(
        services,
        'references',
        uri,
        document,
        params.position,
        {
          includeDeclaration: params.context.includeDeclaration ?? true,
        },
        cancellationToken
      );
      const cached = documentCache.get(uri);
      if (!cached) {
        log.debug('References: no cached document');
        return queryLocations ?? [];
      }

      // Extract includeDeclaration parameter (LSP 3.17 spec)
      // Default is true - include declaration in results
      const includeDeclaration = params.context.includeDeclaration ?? true;

      const text = document.getText();
      const offset = document.offsetAt(params.position);

      // Find word boundaries
      let start = offset;
      let end = offset;
      while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
        start--;
      }
      while (end < text.length && /\w/.test(text[end] ?? '')) {
        end++;
      }

      let word = text.slice(start, end);
      if (!word) {
        log.debug('References: no word at position');
        return [];
      }

      log.debug('References: searching for word', { word, offset, start, end, includeDeclaration });

      // Check if this word matches a known symbol
      let matchingSymbol = cached.symbols.find(s => s.name === word);

      // If word doesn't match a symbol, check if we're on a symbol's definition line
      // This handles CodeLens clicks where position is at return type, not function name
      if (!matchingSymbol) {
        const line = params.position.line;
        const symbolOnLine = cached.symbols.find(s => {
          if (!s.position) return false;
          // Pike uses 1-based lines, LSP uses 0-based
          const symbolLine = s.position.line - 1;
          return symbolLine === line && (s.kind === 'method' || s.kind === 'class');
        });

        if (symbolOnLine && symbolOnLine.name) {
          log.debug('References: found symbol on same line', {
            originalWord: word,
            symbolName: symbolOnLine.name,
            line,
          });
          word = symbolOnLine.name;
          matchingSymbol = symbolOnLine;
        }
      }

      if (!matchingSymbol) {
        // Not a known symbol, return empty
        log.debug('References: word not a known symbol', {
          word,
          symbolCount: cached.symbols.length,
        });
        return [];
      }

      let references: Location[] = [];

      // Use symbolPositions index if available (pre-computed positions)
      if (cached.symbolPositions) {
        const positions = cached.symbolPositions.get(word);
        log.debug('References: symbolPositions lookup', {
          word,
          found: !!positions,
          count: positions?.length ?? 0,
        });
        if (positions) {
          for (const pos of positions) {
            references.push({
              uri,
              range: {
                start: pos,
                end: { line: pos.line, character: pos.character + word.length },
              },
            });
          }
        }
      }

      if (references.length === 0) {
        const lines = text.split('\n');
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];
          if (!line) continue;
          let searchStart = 0;
          let matchIndex = line.indexOf(word, searchStart);

          while (matchIndex !== -1) {
            const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
            const afterChar =
              matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

            if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
              references.push({
                uri,
                range: {
                  start: { line: lineNum, character: matchIndex },
                  end: { line: lineNum, character: matchIndex + word.length },
                },
              });
            }
            searchStart = matchIndex + 1;
            matchIndex = line.indexOf(word, searchStart);
          }
        }
      }

      // Search in other open documents
      for (const [otherUri, otherCached] of Array.from(documentCache.entries())) {
        if (otherUri === uri) continue;

          // Use symbolPositions if available
          if (otherCached.symbolPositions) {
            const positions = otherCached.symbolPositions.get(word);
            if (positions) {
              for (const pos of positions) {
                references.push({
                  uri: otherUri,
                  range: {
                    start: pos,
                    end: { line: pos.line, character: pos.character + word.length },
                  },
                });
              }
            }
          } else {
            const otherDoc = documents.get(otherUri);
            if (otherDoc) {
              const otherText = otherDoc.getText();
              const otherLines = otherText.split('\n');
              for (let lineNum = 0; lineNum < otherLines.length; lineNum++) {
                const line = otherLines[lineNum];
                if (!line) continue;
                let searchStart = 0;
                let matchIndex = line.indexOf(word, searchStart);

                while (matchIndex !== -1) {
                  const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                  const afterChar =
                    matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

                  if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                    references.push({
                      uri: otherUri,
                      range: {
                        start: { line: lineNum, character: matchIndex },
                        end: { line: lineNum, character: matchIndex + word.length },
                      },
                    });
                  }
                  searchStart = matchIndex + 1;
                  matchIndex = line.indexOf(word, searchStart);
                }
              }
            }
          }
      }

      if (queryLocations && queryLocations.length > 0) {
        references.push(...queryLocations);
      }

      const seen = new Set<string>();
      references = references.filter(ref => {
        const key = `${ref.uri}:${ref.range.start.line}:${ref.range.start.character}:${ref.range.end.line}:${ref.range.end.character}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

      if (!includeDeclaration && matchingSymbol.position) {
        const declLine = matchingSymbol.position.line - 1; // Convert to 0-based
        const declarationCandidates =
          cached.symbolPositions?.get(word)?.filter(pos => pos.line === declLine) ?? [];
        const declarationCharacter =
          declarationCandidates.length > 0
            ? Math.min(...declarationCandidates.map(pos => pos.character))
            : undefined;

        const normalizeUriOrPath = (value: string): string => {
          let normalized = decodeURIComponent(value);
          if (normalized.startsWith('file://')) {
            normalized = normalized.replace(/^file:\/\//, '');
          }
          normalized = normalized.replace(/\\/g, '/');
          if (/^\/[A-Za-z]:\//.test(normalized)) {
            normalized = normalized.slice(1);
          }
          while (normalized.includes('//')) {
            normalized = normalized.replace('//', '/');
          }
          return normalized;
        };

        const declarationUris = new Set<string>([normalizeUriOrPath(uri)]);
        const symbolFile = matchingSymbol.position.file;
        if (symbolFile) {
          declarationUris.add(normalizeUriOrPath(symbolFile));
        }

        const declarationBasenames = new Set<string>();
        for (const candidate of declarationUris) {
          declarationBasenames.add(basename(candidate));
        }

        const isDeclarationUri = (refUri: string): boolean => {
          const normalizedRef = normalizeUriOrPath(refUri);
          if (declarationUris.has(normalizedRef)) {
            return true;
          }

          for (const candidate of declarationUris) {
            if (normalizedRef.endsWith(`/${candidate}`) || candidate.endsWith(`/${normalizedRef}`)) {
              return true;
            }
          }

          return declarationBasenames.has(basename(normalizedRef));
        };

        log.debug('References: filtering declaration', {
          includeDeclaration,
          declLine,
          declFile: matchingSymbol.position.file,
          currentUri: uri,
          word,
        });

        let effectiveDeclarationCharacter = declarationCharacter;
        if (effectiveDeclarationCharacter === undefined) {
          const sameLineCandidates = references
            .filter(ref => isDeclarationUri(ref.uri) && ref.range.start.line === declLine)
            .map(ref => ref.range.start.character);
          if (sameLineCandidates.length > 0) {
            effectiveDeclarationCharacter = Math.min(...sameLineCandidates);
          }
        }

        // Filter out declaration location from parsed results
        const beforeFilter = references.length;
        references = references.filter(ref => {
          // Check if this reference is at the declaration location
          const isSameFile = isDeclarationUri(ref.uri);
          const isSameLine = ref.range.start.line === declLine;

          if (!(isSameFile && isSameLine)) {
            return true;
          }

          if (effectiveDeclarationCharacter === undefined) {
            return true;
          }

          return ref.range.start.character !== effectiveDeclarationCharacter;
        });

        log.debug('References: filtered declaration', {
          beforeFilter,
          afterFilter: references.length,
          removed: beforeFilter - references.length,
        });
      }

      log.debug('References found', { word, count: references.length, includeDeclaration });
      return references;
    } catch (err) {
      log.error(
        `References failed for ${params.textDocument.uri} at line ${params.position.line + 1}, col ${params.position.character}: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  });

  /**
   * Document highlight handler - highlight all occurrences of the symbol at cursor
   */
  connection.onDocumentHighlight(async (params): Promise<DocumentHighlight[] | null> => {
    log.debug('Document highlight request', { uri: params.textDocument.uri });
    try {
      const uri = params.textDocument.uri;
      const document = documents.get(uri);

      if (!document) {
        return null;
      }

      const text = document.getText();
      const offset = document.offsetAt(params.position);

      // Find word at cursor
      let wordStart = offset;
      let wordEnd = offset;
      while (wordStart > 0 && /\w/.test(text[wordStart - 1] ?? '')) {
        wordStart--;
      }
      while (wordEnd < text.length && /\w/.test(text[wordEnd] ?? '')) {
        wordEnd++;
      }
      const word = text.slice(wordStart, wordEnd);

      if (!word || word.length < 2) {
        return null;
      }

      const cached = documentCache.get(uri);

      if (cached?.symbolPositions) {
        const positions = cached.symbolPositions.get(word);
        if (positions && positions.length > 0) {
          const declarationLines = cached.symbols
            .filter(symbol => symbol.name === word && symbol.position)
            .map(symbol => Math.max(0, (symbol.position?.line ?? 1) - 1))
            .sort((a, b) => a - b);

          const cursorLine = params.position.line;
          let activeDeclarationLine = declarationLines[0] ?? -1;
          for (const line of declarationLines) {
            if (line <= cursorLine) {
              activeDeclarationLine = line;
            }
          }

          let nextDeclarationLine = Number.POSITIVE_INFINITY;
          if (activeDeclarationLine >= 0) {
            for (const line of declarationLines) {
              if (line > activeDeclarationLine) {
                nextDeclarationLine = line;
                break;
              }
            }
          }

          const escapeRegex = (value: string): string =>
            value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const escapedWord = escapeRegex(word);
          const declarationRegex = new RegExp(
            `\\b(?:int|string|float|mapping|array|object|mixed|multiset|program|function|void)\\s+${escapedWord}\\b`
          );

          const isWriteOccurrence = (line: string, character: number): boolean => {
            const before = line.slice(0, character);
            const after = line.slice(character + word.length);
            if (declarationRegex.test(line)) {
              return true;
            }
            if (/^\s*(\+\+|--|[+\-*/%&|^]?=)/.test(after)) {
              return true;
            }
            if (/(\+\+|--)\s*$/.test(before)) {
              return true;
            }
            return false;
          };

          const lines = text.split('\n');
          const semanticHighlights: DocumentHighlight[] = [];

          for (const pos of positions) {
            if (
              activeDeclarationLine >= 0 &&
              (pos.line < activeDeclarationLine || pos.line >= nextDeclarationLine)
            ) {
              continue;
            }

            const line = lines[pos.line] ?? '';
            const kind = isWriteOccurrence(line, pos.character)
              ? DocumentHighlightKind.Write
              : DocumentHighlightKind.Read;

            semanticHighlights.push({
              range: {
                start: pos,
                end: { line: pos.line, character: pos.character + word.length },
              },
              kind,
            });
          }

          if (semanticHighlights.length > 0) {
            return semanticHighlights;
          }
        }
      }

      const highlights: DocumentHighlight[] = [];
      const lines = text.split('\n');

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        if (!line) continue;
        let searchStart = 0;
        let matchIndex = line.indexOf(word, searchStart);

        while (matchIndex !== -1) {
          const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
          const afterChar =
            matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

          if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
            highlights.push({
              range: {
                start: { line: lineNum, character: matchIndex },
                end: { line: lineNum, character: matchIndex + word.length },
              },
              kind: DocumentHighlightKind.Text,
            });
          }
          searchStart = matchIndex + 1;
          matchIndex = line.indexOf(word, searchStart);
        }
      }

      return highlights.length > 0 ? highlights : null;
    } catch (err) {
      log.error(
        `Document highlight failed for ${params.textDocument.uri} at line ${params.position.line + 1}, col ${params.position.character}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  });
}
