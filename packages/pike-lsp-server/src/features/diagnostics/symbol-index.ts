/**
 * Symbol Position Index Building
 *
 * Provides functions for building symbol position indices used in diagnostics.
 * Extracted from diagnostics.ts for maintainability (Issue #136).
 */

import type { CorePosition } from '../../core/types.js';
import type { PikeSymbol, PikeToken } from '@pike-lsp/pike-bridge';
import { createLexicalExclusionMap } from '../../utils/lexical-exclusion-map.js';
import { Logger } from '@pike-lsp/core';

const log = new Logger('symbol-index');

/**
 * Build symbol name index for O(1) lookups.
 * Maps symbol names to their PikeSymbol objects.
 * Prioritizes non-variant symbols over variant symbols.
 */
export function buildSymbolNameIndex(symbols: PikeSymbol[]): Map<string, PikeSymbol> {
  const index = new Map<string, PikeSymbol>();

  // First pass: index non-variant symbols
  indexSymbolsRecursive(symbols, index, false);

  // Second pass: add variant symbols only if name not already present
  indexSymbolsRecursive(symbols, index, true);

  return index;
}

/**
 * Recursively index symbols into the map.
 * @param symbols - Array of symbols to index
 * @param index - Map to populate
 * @param variantsOnly - If true, only index variant symbols; if false, only non-variants
 */
function indexSymbolsRecursive(
  symbols: PikeSymbol[],
  index: Map<string, PikeSymbol>,
  variantsOnly: boolean
): void {
  for (const symbol of symbols) {
    if (!symbol.name) continue;

    const isVariant = symbol.modifiers?.includes('variant') ?? false;

    // Skip if not matching the variant filter
    if (variantsOnly && !isVariant) continue;
    if (!variantsOnly && isVariant) continue;

    // Only add if not already present (first pass takes precedence)
    if (!index.has(symbol.name)) {
      index.set(symbol.name, symbol);
    }

    // Recursively index children
    if (symbol.children && symbol.children.length > 0) {
      indexSymbolsRecursive(symbol.children, index, variantsOnly);
    }
  }
}

/**
 * Flatten nested symbol tree into a single-level array.
 * This ensures all class members are indexed at the document level.
 */
export function flattenSymbols(symbols: PikeSymbol[], parentName = ''): PikeSymbol[] {
  const flat: PikeSymbol[] = [];

  for (const sym of symbols) {
    // Add the symbol itself
    flat.push(sym);

    // Recursively flatten children with qualified names
    if (sym.children && sym.children.length > 0) {
      const qualifiedPrefix = parentName ? `${parentName}.${sym.name}` : sym.name;

      for (const child of sym.children) {
        // Create a copy with qualified name for easier lookup
        const childWithQualName = {
          ...child,
          // Store qualified name for namespaced lookup
          qualifiedName: `${qualifiedPrefix}.${child.name}`,
        };
        flat.push(childWithQualName);

        // Recursively handle nested children
        if (child.children && child.children.length > 0) {
          flat.push(...flattenSymbols(child.children, qualifiedPrefix));
        }
      }
    }
  }

  return flat;
}

/**
 * Build symbol position index for O(1) lookups.
 * PERF-001: Uses Pike tokenization for accuracy and performance
 * PERF-004: Reuses tokens from analyze() to avoid separate findOccurrences() IPC call
 * PERF-1229: Accepts pre-split lines array to avoid redundant text.split('\n') calls
 */
export async function buildSymbolPositionIndex(
  text: string,
  symbols: PikeSymbol[],
  tokens?: PikeToken[],
  bridge?: {
    isRunning: () => boolean;
    findOccurrences: (
      text: string
    ) => Promise<{ occurrences: Array<{ text: string; line: number; character: number }> }>;
    tokenize: (text: string) => Promise<PikeToken[]>;
  },
  lines?: string[]
): Promise<Map<string, CorePosition[]>> {
  const index = new Map<string, CorePosition[]>();
  const exclusions = createLexicalExclusionMap(text);
  // PERF-1229: Use pre-split lines if provided, otherwise split once
  const linesArray = lines ?? text.split('\n');

  // Build set of symbol names we care about AND map to definition lines
  const symbolNames = new Set<string>();
  const definitionLines = new Map<string, number>(); // symbol name -> definition line

  for (const symbol of symbols) {
    if (symbol.name) {
      symbolNames.add(symbol.name);
      // Track definition line to exclude from reference count
      // Parse symbols have .line, introspection symbols have .position?.line
      const defLine =
        (symbol as { line?: number; position?: { line?: number } }).line ?? symbol.position?.line;
      if (defLine !== undefined) {
        definitionLines.set(symbol.name, defLine);
      }
    }
  }

  // PERF-004: Use tokens from analyze() when available (no additional IPC)
  // Tokens now include character positions (computed in Pike, faster than JS string search)
  // PERF-1229: Use pre-split lines array passed from caller
  if (tokens && tokens.length > 0) {
    // Filter tokens for our symbols and build positions
    for (const token of tokens) {
      if (symbolNames.has(token.text)) {
        const lineIdx = token.line - 1; // Convert to 0-indexed

        // Skip if character position is not available (-1)
        if (token.character < 0) {
          continue;
        }

        // Skip tokens at the definition line (don't count definition as reference)
        const defLine = definitionLines.get(token.text);
        if (defLine !== undefined && token.line === defLine) {
          continue; // This is the definition, not a reference
        }

        if (lineIdx >= 0 && lineIdx < linesArray.length) {
          if (exclusions.isCommentPosition(lineIdx, token.character)) {
            continue;
          }

          const line = linesArray[lineIdx];
          if (!line) continue;

          // Verify word boundary (still needed for accuracy)
          const beforeChar = token.character > 0 ? line[token.character - 1]! : ' ';
          const afterChar =
            token.character + token.text.length < line.length
              ? line[token.character + token.text.length]!
              : ' ';

          if (!/\w/.test(beforeChar) && !/\w/.test(afterChar)) {
            const pos: CorePosition = {
              line: lineIdx,
              character: token.character,
            };

            if (!index.has(token.text)) {
              index.set(token.text, []);
            }
            index.get(token.text)!.push(pos);
          }
        }
      }
    }

    if (index.size > 0) {
      return index;
    }
  }

  // PERF-001: Fallback to findOccurrences IPC call if tokens not available
  if (bridge?.isRunning()) {
    try {
      const result = await bridge.findOccurrences(text);

      // Group occurrences by symbol name
      for (const occ of result.occurrences) {
        if (symbolNames.has(occ.text)) {
          if (exclusions.isCommentPosition(occ.line - 1, occ.character)) {
            continue;
          }

          // Skip definition line (don't count definition as reference)
          const defLine = definitionLines.get(occ.text);
          if (defLine !== undefined && occ.line === defLine) {
            continue;
          }

          const pos: CorePosition = {
            line: occ.line - 1, // Convert 1-indexed to 0-indexed
            character: occ.character,
          };

          if (!index.has(occ.text)) {
            index.set(occ.text, []);
          }
          index.get(occ.text)!.push(pos);
        }
      }

      // If we found all our symbols, return early
      if (index.size === symbolNames.size) {
        return index;
      }
    } catch (err) {
      // Log error details before falling back to regex
      log.error('Token-based symbol position finding failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Fallback: tokenize-based search using bridge if available
  // PERF-1229: Pass pre-split lines to avoid re-splitting in fallback
  return buildSymbolPositionIndexRegex(text, symbols, linesArray, tokens, bridge);
}

/**
 * Build call position index using Pike tokenization.
 * Detects function calls by checking if identifier token is followed by '(' token.
 * @param tokens - Pike tokens from tokenization
 * @param callableNames - Set of callable symbol names to look for
 * @returns Map of function name to array of positions where it's called
 */
export function buildCallPositionIndex(
  tokens: PikeToken[],
  callableNames: Set<string>
): Map<string, CorePosition[]> {
  const index = new Map<string, CorePosition[]>();

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token || !callableNames.has(token.text)) {
      continue;
    }

    // Check if next token is '(' indicating a function call
    const nextToken = tokens[i + 1];
    if (nextToken && nextToken.text === '(') {
      const lineIdx = token.line - 1; // Convert to 0-indexed
      const character = token.character;

      // Skip if character position is not available
      if (character < 0) {
        continue;
      }

      const pos: CorePosition = {
        line: lineIdx,
        character: character,
      };

      if (!index.has(token.text)) {
        index.set(token.text, []);
      }
      index.get(token.text)!.push(pos);
    }
  }

  return index;
}

/**
 * Fallback tokenize-based symbol position finding.
 * Uses bridge.tokenize() when pre-computed tokens are unavailable.
 * PERF-1229: Accepts pre-split lines array to avoid redundant text.split('\n') calls
 */
export async function buildSymbolPositionIndexRegex(
  text: string,
  symbols: PikeSymbol[],
  lines?: string[],
  tokens?: PikeToken[],
  bridge?: {
    tokenize: (text: string) => Promise<PikeToken[]>;
  }
): Promise<Map<string, CorePosition[]>> {
  const index = new Map<string, CorePosition[]>();
  // PERF-1229: Use pre-split lines if provided, otherwise split once
  const linesArray = lines ?? text.split('\n');
  const exclusions = createLexicalExclusionMap(text);

  // Build set of symbol names and their definition lines for token matching
  const symbolNames = new Set<string>();
  const definitionLines = new Map<string, number>();
  for (const symbol of symbols) {
    if (!symbol.name) continue;
    symbolNames.add(symbol.name);
    const defLine =
      (symbol as { line?: number; position?: { line?: number } }).line ?? symbol.position?.line;
    if (defLine !== undefined) {
      definitionLines.set(symbol.name, defLine);
    }
  }

  // Token-based path: use pre-computed Pike tokens for accurate position matching
  // If no pre-computed tokens, try bridge.tokenize() for precise identifier matching
  let resolvedTokens = tokens;
  if (!resolvedTokens?.length && bridge) {
    try {
      resolvedTokens = await bridge.tokenize(text);
    } catch {
      resolvedTokens = undefined;
    }
  }

  if (resolvedTokens && resolvedTokens.length > 0) {
    for (const token of resolvedTokens) {
      if (!symbolNames.has(token.text)) continue;
      if (token.character < 0) continue;

      const lineIdx = token.line - 1;
      if (lineIdx < 0 || lineIdx >= linesArray.length) continue;

      const defLine = definitionLines.get(token.text);
      if (defLine !== undefined && token.line === defLine) continue;

      if (exclusions.isCommentPosition(lineIdx, token.character)) continue;

      const pos: CorePosition = { line: lineIdx, character: token.character };
      if (!index.has(token.text)) {
        index.set(token.text, []);
      }
      index.get(token.text)!.push(pos);
    }

    if (index.size > 0) {
      return index;
    }
  }

  // Final fallback: return empty index when no tokens available
  return index;
}
