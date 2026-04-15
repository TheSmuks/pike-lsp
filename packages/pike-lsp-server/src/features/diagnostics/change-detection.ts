/**
 * Incremental Change Detection
 *
 * Provides functions for classifying document changes to determine if re-parsing is needed.
 * INC-002: Extracted from diagnostics.ts for maintainability (Issue #136).
 */

import type { Range } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import {
  computeContentHash,
  computeSemanticLineHash,
  stripLineComments,
} from '../../services/document-cache.js';
export { stripLineComments };
import type { DocumentCacheEntry } from '../../core/types.js';
/**
 * INC-002: Change detection result from classification
 */
export interface ChangeClassification {
  /** Whether parsing can be skipped entirely */
  canSkip: boolean;
  /** Reason for classification */
  reason: string;
  /** New content hash (computed if needed) */
  newHash?: string;
  /** New line hashes (computed if needed) */
  newLineHashes?: number[];
  /** Analysis depth: 'typing' = fast syntax-only, 'full' = complete introspection */
  analysisMode?: AnalysisMode;
}

export type AnalysisMode = 'typing' | 'full';

/**
 * INC-002: Classify document change to determine if re-parsing is needed.
 *
 * Uses multiple strategies to detect if the change affects semantic content:
 * 1. Comment/whitespace-only changes → skip entirely
 * 2. Line hash comparison → skip if semantic content unchanged
 * 3. Symbol position overlap → skip if no symbols affected
 *
 * @param document - Current document state
 * @param changeRange - LSP range of the change (undefined = full document)
 * @param cachedEntry - Previous cached parse result (undefined = must parse)
 * @returns Classification indicating if parsing can be skipped
 */
export function classifyChange(
  document: TextDocument,
  changeRange: Range | undefined,
  cachedEntry: DocumentCacheEntry | undefined
): ChangeClassification {
  // No cache? Must parse
  if (!cachedEntry) {
    return { canSkip: false, reason: 'no_cache' };
  }

  // Never skip when previous parse had errors — must re-validate to detect fixes
  if (cachedEntry.analysisState?.parseFailed) {
    return { canSkip: false, reason: 'previous_parse_failed' };
  }

  // #1068: Never skip when cached diagnostics contain errors (severity 1).
  // A change on one line can fix an error on a distant line, so we must
  // re-validate to detect whether the error was resolved.
  if (
    cachedEntry.analysisState?.hasErrorDiagnostics ||
    cachedEntry.diagnostics.some(d => d.severity === 1)
  ) {
    return { canSkip: false, reason: 'has_error_diagnostics' };
  }

  const text = document.getText();

  // Strategy 1: Check if change range is provided
  if (changeRange) {
    const startLine = changeRange.start.line;
    const endLine = changeRange.end.line;

    // Strategy 2: Check if change overlaps with any symbol positions
    if (cachedEntry.lineHashes) {
      const lines = extractLinesInRange(text, startLine, endLine, cachedEntry.lineHashes.length);

      if (lines.fullSplit) {
        // Line count changed — must re-parse
        return {
          canSkip: false,
          reason: 'line_count_changed',
        };
      }

      // Check if any line in the change range has different semantic content
      let hasSemanticChange = false;
      for (let j = 0; j < lines.partial.length; j++) {
        const lineIndex = startLine + j;
        const cachedHash = cachedEntry.lineHashes[lineIndex];
        const newHash = computeSemanticLineHash(lines.partial[j] ?? '');

        if (cachedHash !== newHash) {
          hasSemanticChange = true;
          break;
        }
      }

      if (!hasSemanticChange) {
        return {
          canSkip: true,
          reason: 'semantic_unchanged',
          newLineHashes: cachedEntry.lineHashes,
        };
      }

      return {
        canSkip: false,
        reason: 'semantic_changed',
      };
    }
  }

  // No range info (full document replacement) - compare content hash
  const newHash = computeContentHash(text);
  if (cachedEntry.contentHash === newHash) {
    return { canSkip: true, reason: 'content_unchanged', newHash };
  }

  return { canSkip: false, reason: 'full_replacement', newHash };
}

/**
 * Extract lines from text efficiently.
 * If the cached line count matches the actual line count (verified by cheap newline counting),
 * extracts only [startLine..endLine] using indexOf-based splitting — avoiding a full
 * document split. Falls back to full split when line counts differ.
 */
function extractLinesInRange(
  text: string,
  startLine: number,
  endLine: number,
  cachedLineCount: number
): { fullSplit: true; lines: string[] } | { fullSplit: false; partial: string[] } {
  // Cheap newline count — O(n) scan, no allocation
  let newlineCount = 1; // a document with 0 newlines has 1 line
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) newlineCount++;
  }

  if (newlineCount !== cachedLineCount) {
    return { fullSplit: true, lines: text.split('\n') };
  }

  // Line count matches — extract only the range we need
  const partial: string[] = [];
  let searchFrom = 0;
  // Advance to startLine
  for (let i = 0; i < startLine; i++) {
    const idx = text.indexOf('\n', searchFrom);
    searchFrom = idx === -1 ? text.length : idx + 1;
  }
  // Extract lines [startLine..endLine]
  for (let i = startLine; i <= endLine; i++) {
    const idx = text.indexOf('\n', searchFrom);
    partial.push(text.substring(searchFrom, idx === -1 ? text.length : idx));
    searchFrom = idx === -1 ? text.length : idx + 1;
  }

  return { fullSplit: false, partial };
}
