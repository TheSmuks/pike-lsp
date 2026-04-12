/**
 * RXML Module Scanner
 *
 * Scans Pike module files for RXML tag definitions.
 * Provides the single source of truth for tag extraction patterns used by
 * all RXML providers (definition, references, rename).
 *
 * Tag Function Patterns (both forms are recognized):
 * - simpletag tagName( ... )   — space separator (e.g. Roxen tag API)
 * - simpletag_tagName( ... )   — underscore separator
 * - container tagName( ... )   — space separator
 * - container_tagName( ... )   — underscore separator
 */

import type { RXMLTagCatalogEntry } from './types.js';

/**
 * Tag function detected in Pike source code
 */
export interface DetectedTagFunction {
  name: string;
  type: 'simple' | 'container';
  description?: string;
}

/**
 * Match result from scanning Pike source for tag function patterns.
 * `index` is the byte offset of the tag name within the source string.
 */
export interface TagFunctionMatch {
  /** Tag name (e.g. "my_tag") */
  name: string;
  /** Whether this is a simpletag or container */
  type: 'simple' | 'container';
  /** Byte offset of the tag name in the source string */
  index: number;
}

// Canonical regex covering both `simpletag tagName(` and `simpletag_tagName(` forms.
// Captures: group 1 = separator (space or underscore), group 2 = tag name.
const SIMPLETAG_PATTERN = /\bsimpletag([ _])([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

const CONTAINER_PATTERN = /\bcontainer([ _])([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

/**
 * Scan Pike source code for all simpletag and container function declarations.
 *
 * Returns one {@link TagFunctionMatch} per occurrence, including the byte offset
 * of the tag name so callers can compute positions for LSP operations.
 *
 * @param code - Full Pike module source code
 * @returns All tag function matches found
 */
export function findTagFunctionsInCode(code: string): TagFunctionMatch[] {
  const results: TagFunctionMatch[] = [];

  collectMatches(code, SIMPLETAG_PATTERN, 'simple', results);
  collectMatches(code, CONTAINER_PATTERN, 'container', results);

  return results;
}

/**
 * Build a regex that matches a specific tag name in either space or underscore form.
 *
 * Useful for rename operations and targeted searches.
 *
 * @param kind    - `'simple'` or `'container'`
 * @param tagName - The tag name to match literally
 * @returns A global RegExp that matches `kind tagName` or `kind_tagName`
 */
export function buildTagPattern(kind: 'simple' | 'container', tagName: string): RegExp {
  const keyword = kind === 'simple' ? 'simpletag' : 'container';
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${keyword}([ _])${escaped}\\b`, 'g');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function collectMatches(
  code: string,
  pattern: RegExp,
  type: 'simple' | 'container',
  out: TagFunctionMatch[]
): void {
  // Reset lastIndex for reused RegExp literals with /g flag
  pattern.lastIndex = 0;

  let match = pattern.exec(code);
  while (match !== null) {
    const separator = match[1];
    const name = match[2];
    if (name) {
      // Name starts after the keyword + separator.
      const keyword = type === 'simple' ? 'simpletag' : 'container';
      const keywordEnd = match.index + keyword.length;
      const nameStart = separator === '_' ? keywordEnd + 1 : keywordEnd + 1; // skip separator
      out.push({ name, type, index: nameStart });
    }
    match = pattern.exec(code);
  }
}

/**
 * Extract description from doc comments above a function
 *
 * Looks for //! comments immediately preceding the function definition.
 *
 * @param lines - All source code lines
 * @param functionLine - Line number of function definition
 * @returns Concatenated doc comment text
 */
function extractDescription(lines: string[], functionLine: number): string | undefined {
  const comments: string[] = [];

  // Scan backwards from function line
  for (let i = functionLine - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) break;
    const trimmed = line.trim();

    // Stop at non-comment line
    if (!trimmed.startsWith('//!')) {
      break;
    }

    // Extract comment content (remove //! prefix)
    const comment = trimmed.replace(/^\/\/!\s*/, '');
    comments.unshift(comment);
  }

  if (comments.length === 0) {
    return undefined;
  }

  return comments.join(' ');
}

/**
 * Extract RXML tag definitions from Pike module source code
 *
 * Uses findTagFunctionsInCode() for pattern matching (ADR-001 compliant).
 *
 * @param pikeCode - Pike module source code
 * @returns Array of detected tag definitions
 */
export async function extractTagsFromPikeCode(pikeCode: string): Promise<RXMLTagCatalogEntry[]> {
  const detectedTags = detectTagFunctions(pikeCode);

  // Convert detected functions to catalog entries
  return detectedTags.map(
    (tag): RXMLTagCatalogEntry => ({
      name: tag.name,
      type: tag.type,
      requiredAttributes: [],
      optionalAttributes: [],
      ...(tag.description !== undefined && { description: tag.description }),
    })
  );
}

/**
 * Detect tag function patterns in Pike code
 *
 * @param code - Pike source code
 * @returns Array of detected tag functions
 */
function detectTagFunctions(code: string): DetectedTagFunction[] {
  const tags: DetectedTagFunction[] = [];

  // Split into lines for description extraction
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const trimmed = line.trim();

    // Match using canonical patterns (single-tag per line via trimmed context)
    const simpleMatch = trimmed.match(
      /(?:void|mapping|string)\s+simpletag[ _]([A-Za-z_][A-Za-z0-9_]*)\s*\(/
    );
    if (simpleMatch) {
      const tagName = simpleMatch[1]!;
      const desc = extractDescription(lines, i);
      tags.push({
        name: tagName,
        type: 'simple',
        ...(desc !== undefined && { description: desc }),
      });
      continue;
    }

    const containerMatch = trimmed.match(
      /(?:void|mapping|string)\s+container[ _]([A-Za-z_][A-Za-z0-9_]*)\s*\(/
    );
    if (containerMatch) {
      const tagName = containerMatch[1]!;
      const desc = extractDescription(lines, i);
      tags.push({
        name: tagName,
        type: 'container',
        ...(desc !== undefined && { description: desc }),
      });
    }
  }

  return tags;
}
