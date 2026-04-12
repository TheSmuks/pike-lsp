/**
 * RXML Module Scanner
 *
 * Scans Pike module files for RXML tag definitions.
 * Provides the single source of truth for tag extraction patterns used by
 * all RXML providers (definition, references, rename).
 *
 * Tag function detection uses bridge.parse() symbols (ADR-001 compliant).
 * All symbol-based functions filter for kind === 'method' and inspect names
 * for `simpletag_` / `container_` prefixes.
 *
 * buildTagPattern() provides regex for text-based rename operations only.
 */

import type { PikeSymbol } from '@pike-lsp/pike-bridge';
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

/**
 * Scan Pike source for all simpletag and container tag function matches.
 *
 * Returns one {@link TagFunctionMatch} per tag method found, including the byte
 * offset of the tag name so callers can compute positions for LSP operations.
 *
 * When `symbols` are provided, uses them directly (ADR-001 compliant).
 * When omitted, performs a simple string scan for backward compatibility
 * with callers that have not yet been migrated to pass symbols.
 *
 * @param code    - Full Pike module source code (for byte offset computation)
 * @param symbols - Parsed PikeSymbol[] from bridge.parse() (recommended)
 * @returns All tag function matches found
 */
export function findTagFunctionsInCode(code: string, symbols?: PikeSymbol[]): TagFunctionMatch[] {
  if (symbols) {
    return findTagMatchesFromSymbols(code, symbols);
  }
  return findTagMatchesByStringScan(code);
}

/**
 * Find tag matches using parsed PikeSymbol[] (ADR-001 compliant).
 *
 * Filters symbols for kind === 'method' with simpletag_/container_ prefixes,
 * then computes the byte offset of each tag name in the source.
 */
function findTagMatchesFromSymbols(code: string, symbols: PikeSymbol[]): TagFunctionMatch[] {
  const results: TagFunctionMatch[] = [];
  const lines = code.split('\n');

  for (const symbol of symbols) {
    if (symbol.kind !== 'method' || !symbol.name) continue;

    const tagInfo = extractTagInfo(symbol.name);
    if (!tagInfo) continue;

    const nameStart = computeNameOffset(lines, symbol, tagInfo.name);
    if (nameStart < 0) continue;

    results.push({ name: tagInfo.name, type: tagInfo.type, index: nameStart });
  }

  return results;
}

/**
 * Find tag matches by scanning source code for function name patterns.
 *
 * Backward-compatible fallback for callers without bridge.parse() symbols.
 * Scans each line for simpletag_/container_ prefixed identifiers and computes
 * the byte offset of the tag name portion.
 */
function findTagMatchesByStringScan(code: string): TagFunctionMatch[] {
  const results: TagFunctionMatch[] = [];
  const lines = code.split('\n');
  let offset = 0;

  // Each entry: [keyword, type, separatorChar]
  // 'simpletag_' and 'simpletag ' both extract a simple tag;
  // 'container_' and 'container ' both extract a container tag.
  const patterns: ReadonlyArray<[string, 'simple' | 'container']> = [
    ['simpletag_', 'simple'],
    ['simpletag ', 'simple'],
    ['container_', 'container'],
    ['container ', 'container'],
  ];

  for (const line of lines) {
    if (line) {
      for (const [prefix, tagType] of patterns) {
        let searchFrom = 0;
        while (true) {
          const idx = line.indexOf(prefix, searchFrom);
          if (idx < 0) break;

          // Verify boundary before the keyword
          if (idx === 0 || !isIdentChar(line[idx - 1] ?? '')) {
            const nameStart = idx + prefix.length;
            let end = nameStart;
            while (end < line.length && isIdentChar(line[end] ?? '')) {
              end++;
            }
            const tagName = line.slice(nameStart, end);
            if (tagName.length > 0) {
              results.push({ name: tagName, type: tagType, index: offset + nameStart });
            }
          }
          searchFrom = idx + prefix.length;
        }
      }
    }
    offset += (line?.length ?? 0) + 1;
  }

  // Deduplicate: underscore form takes precedence over space form
  const seen = new Map<string, TagFunctionMatch>();
  for (const match of results) {
    const key = `${match.type}:${match.name}`;
    if (!seen.has(key)) {
      seen.set(key, match);
    }
  }

  return [...seen.values()];
}

/**
 * Build a regex that matches a specific tag name in either space or underscore form.
 *
 * Used for text-based rename operations in .pike source files.
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

/**
 * Extract description from doc comments above a function
 *
 * Looks for //! comments immediately preceding the function definition.
 *
 * @param lines - All source code lines
 * @param functionLine - 0-based line number of function definition
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
 * Extract RXML tag definitions from parsed Pike symbols and source code.
 *
 * Uses bridge.parse() symbols for tag detection (ADR-001 compliant).
 * Source code is used only for //! doc comment extraction.
 *
 * @param pikeCode - Pike module source code (used for description extraction)
 * @param symbols  - Parsed PikeSymbol[] from bridge.parse()
 * @returns Array of detected tag definitions
 */
export async function extractTagsFromPikeCode(
  pikeCode: string,
  symbols: PikeSymbol[]
): Promise<RXMLTagCatalogEntry[]> {
  const detectedTags = detectTagFunctions(symbols, pikeCode);

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
 * Detect tag function patterns from parsed Pike symbols
 *
 * Filters symbols for kind === 'method' and names starting with
 * 'simpletag_' or 'container_' prefix. Extracts //! doc comments
 * from source code preceding each declaration.
 *
 * @param symbols - Parsed PikeSymbol[] from bridge.parse()
 * @param code    - Pike source code (for //! description extraction)
 * @returns Array of detected tag functions
 */
export function detectTagFunctions(symbols: PikeSymbol[], code: string): DetectedTagFunction[] {
  const tags: DetectedTagFunction[] = [];
  const lines = code.split('\n');

  for (const symbol of symbols) {
    if (symbol.kind !== 'method' || !symbol.name) continue;

    const tagInfo = extractTagInfo(symbol.name);
    if (!tagInfo) continue;

    const functionLine =
      symbol.position?.line != null
        ? symbol.position.line - 1 // convert 1-based to 0-based
        : findLineByName(lines, symbol.name);

    if (functionLine < 0) continue;

    const desc = extractDescription(lines, functionLine);
    tags.push({
      name: tagInfo.name,
      type: tagInfo.type,
      ...(desc !== undefined && { description: desc }),
    });
  }

  return tags;
}

/**
 * Extract tag type and name from a method symbol name.
 *
 * Handles underscore-separated forms:
 * - simpletag_my_tag -> { type: 'simple', name: 'my_tag' }
 * - container_my_cont -> { type: 'container', name: 'my_cont' }
 *
 * @returns Tag info object, or null if not a tag function
 */
function extractTagInfo(methodName: string): { type: 'simple' | 'container'; name: string } | null {
  if (methodName.startsWith('simpletag_')) {
    const tagName = methodName.slice('simpletag_'.length);
    if (tagName.length > 0) {
      return { type: 'simple', name: tagName };
    }
  }
  if (methodName.startsWith('container_')) {
    const tagName = methodName.slice('container_'.length);
    if (tagName.length > 0) {
      return { type: 'container', name: tagName };
    }
  }
  return null;
}

/**
 * Find the 0-based line index where a method name appears in source.
 * Fallback when symbol position is unavailable.
 */
function findLineByName(lines: string[], name: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.includes(name)) {
      return i;
    }
  }
  return -1;
}
function computeNameOffset(lines: string[], symbol: PikeSymbol, tagName: string): number {
  // Prefer symbol position when available
  if (symbol.position?.line != null) {
    const lineIdx = symbol.position.line - 1; // convert 1-based to 0-based
    if (lineIdx >= 0 && lineIdx < lines.length) {
      const line = lines[lineIdx];
      if (line) {
        // Find the tag name within the line — it appears after the function prefix
        const prefix = symbol.name.startsWith('simpletag_') ? 'simpletag_' : 'container_';
        const tagIdx = line.indexOf(tagName, line.indexOf(prefix));
        if (tagIdx >= 0) {
          // Byte offset = sum of all previous line lengths + newlines + column
          let offset = 0;
          for (let i = 0; i < lineIdx; i++) {
            offset += (lines[i]?.length ?? 0) + 1; // +1 for newline
          }
          return offset + tagIdx;
        }
      }
    }
  }

  // Fallback: scan all lines for the full function name
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line) {
      const funcIdx = line.indexOf(symbol.name);
      if (funcIdx >= 0) {
        const prefix = symbol.name.startsWith('simpletag_') ? 'simpletag_' : 'container_';
        return offset + funcIdx + prefix.length;
      }
    }
    offset += (line?.length ?? 0) + 1;
  }

  return -1;
}

/** Check whether a character is a valid Pike identifier character. */
function isIdentChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 95
  ); // _
}
