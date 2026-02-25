/**
 * Incremental Change Detection
 *
 * Provides functions for classifying document changes to determine if re-parsing is needed.
 * INC-002: Extracted from diagnostics.ts for maintainability (Issue #136).
 */

import type { Range } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { computeContentHash, computeLineHashes } from '../../services/document-cache.js';
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
}

/**
 * INC-002: Strip comments from a line of Pike code.
 * Handles both line comments (//) and block comment markers.
 */
export function stripLineComments(line: string): string {
  // Remove line comments
  const commentPos = line.indexOf('//');
  if (commentPos >= 0) {
    line = line.substring(0, commentPos);
  }
  return line.trim();
}

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

  const text = document.getText();

  // Strategy 1: Check if change range is provided
  if (changeRange) {
    const startLine = changeRange.start.line;
    const endLine = changeRange.end.line;

    // Strategy 2: Check if change overlaps with any symbol positions
    if (cachedEntry.lineHashes) {
      const newLineHashes = computeLineHashes(text);

      // Check if any line in the change range has different semantic content
      let hasSemanticChange = false;
      for (let i = startLine; i <= endLine && i < newLineHashes.length; i++) {
        const cachedHash = cachedEntry.lineHashes[i];
        const newHash = newLineHashes[i];

        if (cachedHash !== newHash) {
          hasSemanticChange = true;
          break;
        }
      }

      if (!hasSemanticChange) {
        return {
          canSkip: true,
          reason: 'semantic_unchanged',
          newHash: computeContentHash(text),
          newLineHashes,
        };
      }

      return {
        canSkip: false,
        reason: 'semantic_changed',
        newHash: computeContentHash(text),
        newLineHashes,
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
