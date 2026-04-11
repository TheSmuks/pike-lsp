/**
 * Definition References
 *
 * Finds all references to a symbol across open documents.
 * Extracted from definition.ts for maintainability.
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Location } from 'vscode-languageserver/node.js';
import type { TextDocuments } from 'vscode-languageserver/node.js';
import type { DocumentCache } from '../../services/document-cache.js';
import type { DocumentCacheEntry } from '../../core/types.js';

/**
 * Find all references to a symbol in the current and other open documents.
 * Excludes the definition itself from the results.
 */
export function findReferencesForSymbol(
  symbolName: string,
  currentUri: string,
  currentDocument: TextDocument,
  cached: DocumentCacheEntry,
  documentCache: DocumentCache,
  documents: TextDocuments<TextDocument>
): Location[] {
  const references: Location[] = [];
  const text = currentDocument.getText();

  // Use symbolPositions index if available (pre-computed positions)
  if (cached.symbolPositions) {
    const positions = cached.symbolPositions.get(symbolName);
    if (positions) {
      for (const pos of positions) {
        references.push({
          uri: currentUri,
          range: {
            start: pos,
            end: { line: pos.line, character: pos.character + symbolName.length },
          },
        });
      }
    }
  }

  // Fallback: if symbolPositions didn't have results, do text-based search
  if (references.length === 0) {
    const lines = text.split('\n');
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      if (!line) continue;
      let searchStart = 0;
      let matchIndex = line.indexOf(symbolName, searchStart);

      while (matchIndex !== -1) {
        const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
        const afterChar =
          matchIndex + symbolName.length < line.length ? line[matchIndex + symbolName.length] : ' ';

        // Check word boundaries
        if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
          references.push({
            uri: currentUri,
            range: {
              start: { line: lineNum, character: matchIndex },
              end: { line: lineNum, character: matchIndex + symbolName.length },
            },
          });
        }
        searchStart = matchIndex + 1;
        matchIndex = line.indexOf(symbolName, searchStart);
      }
    }
  }

  // Search in other open documents
  for (const [otherUri, otherCached] of Array.from(documentCache.entries())) {
    if (otherUri === currentUri) continue;

    // Use symbolPositions if available
    if (otherCached.symbolPositions) {
      const positions = otherCached.symbolPositions.get(symbolName);
      if (positions) {
        for (const pos of positions) {
          references.push({
            uri: otherUri,
            range: {
              start: pos,
              end: { line: pos.line, character: pos.character + symbolName.length },
            },
          });
        }
      }
    } else {
      // Fallback text search for other documents without symbolPositions
      const otherDoc = documents.get(otherUri);
      if (otherDoc) {
        const otherText = otherDoc.getText();
        const otherLines = otherText.split('\n');
        for (let lineNum = 0; lineNum < otherLines.length; lineNum++) {
          const line = otherLines[lineNum];
          if (!line) continue;
          let searchStart = 0;
          let matchIndex = line.indexOf(symbolName, searchStart);

          while (matchIndex !== -1) {
            const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
            const afterChar =
              matchIndex + symbolName.length < line.length
                ? line[matchIndex + symbolName.length]
                : ' ';

            if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
              references.push({
                uri: otherUri,
                range: {
                  start: { line: lineNum, character: matchIndex },
                  end: { line: lineNum, character: matchIndex + symbolName.length },
                },
              });
            }
            searchStart = matchIndex + 1;
            matchIndex = line.indexOf(symbolName, searchStart);
          }
        }
      }
    }
  }

  return references;
}
