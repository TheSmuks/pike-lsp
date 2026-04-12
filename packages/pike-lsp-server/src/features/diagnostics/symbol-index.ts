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
 * Metadata extracted from a symbol list for token-based position matching.
 */
interface SymbolMatchMetadata {
  /** Set of symbol names to search for in token streams. */
  symbolNames: Set<string>;
  /** Map from symbol name to its definition line (1-indexed). */
  definitionLines: Map<string, number>;
}

/**
 * Extract searchable metadata from a symbol list.
 * Shared by buildSymbolPositionIndex and buildSymbolPositionIndexRegex
 * so both callers use a single definition of "what counts as a definition line".
 */
function extractSymbolMatchMetadata(symbols: PikeSymbol[]): SymbolMatchMetadata {
  const symbolNames = new Set<string>();
  const definitionLines = new Map<string, number>();

  for (const symbol of symbols) {
    if (!symbol.name) continue;
    symbolNames.add(symbol.name);
    // Parse symbols have .line, introspection symbols have .position?.line
    const defLine =
      (symbol as { line?: number; position?: { line?: number } }).line ?? symbol.position?.line;
    if (defLine !== undefined) {
      definitionLines.set(symbol.name, defLine);
    }
  }

  return { symbolNames, definitionLines };
}

/**
 * Match tokens against a symbol list, filtering out definitions and comments.
 * Returns a map of symbol name -> array of reference positions.
 * @param tokens - Token stream to scan
 * @param meta - Symbol metadata (names + definition lines)
 * @param exclusions - Comment/string position exclusion map
 * @param lines - Pre-split source lines
 */
function matchTokensToSymbolPositions(
  tokens: PikeToken[],
  meta: SymbolMatchMetadata,
  exclusions: { isCommentPosition: (line: number, char: number) => boolean },
  lines: string[]
): Map<string, CorePosition[]> {
  const index = new Map<string, CorePosition[]>();
  const { symbolNames, definitionLines } = meta;

  for (const token of tokens) {
    if (!symbolNames.has(token.text)) continue;
    if (token.character < 0) continue;

    const lineIdx = token.line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) continue;

    // Skip tokens at the definition line
    const defLine = definitionLines.get(token.text);
    if (defLine !== undefined && token.line === defLine) continue;

    // Skip tokens inside comments or strings
    if (exclusions.isCommentPosition(lineIdx, token.character)) continue;


    const pos: CorePosition = { line: lineIdx, character: token.character };
    if (!index.has(token.text)) {
      index.set(token.text, []);
    }
    index.get(token.text)!.push(pos);
  }

  return index;
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
  const exclusions = createLexicalExclusionMap(text);
  const linesArray = lines ?? text.split('\n');
  const meta = extractSymbolMatchMetadata(symbols);

  // PERF-004: Use tokens from analyze() when available (no additional IPC)
  if (tokens && tokens.length > 0) {
    const index = matchTokensToSymbolPositions(tokens, meta, exclusions, linesArray);
    if (index.size > 0) return index;
  }

  // PERF-001: Fallback to findOccurrences IPC call if tokens not available
  if (bridge?.isRunning()) {
    try {
      const result = await bridge.findOccurrences(text);

      const index = new Map<string, CorePosition[]>();
      for (const occ of result.occurrences) {
        if (!meta.symbolNames.has(occ.text)) continue;
        if (exclusions.isCommentPosition(occ.line - 1, occ.character)) continue;

        // Skip definition line
        const defLine = meta.definitionLines.get(occ.text);
        if (defLine !== undefined && occ.line === defLine) continue;

        const pos: CorePosition = { line: occ.line - 1, character: occ.character };
        if (!index.has(occ.text)) index.set(occ.text, []);
        index.get(occ.text)!.push(pos);
      }

      if (index.size === meta.symbolNames.size) return index;
    } catch (err) {
      log.error('Token-based symbol position finding failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Final fallback: tokenize via bridge
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
  const linesArray = lines ?? text.split('\n');
  const exclusions = createLexicalExclusionMap(text);
  const meta = extractSymbolMatchMetadata(symbols);

  // Token-based path: use pre-computed tokens or bridge.tokenize()
  let resolvedTokens = tokens;
  if (!resolvedTokens?.length && bridge) {
    try {
      resolvedTokens = await bridge.tokenize(text);
    } catch {
      resolvedTokens = undefined;
    }
  }

  if (resolvedTokens && resolvedTokens.length > 0) {
    const index = matchTokensToSymbolPositions(resolvedTokens, meta, exclusions, linesArray);
    if (index.size > 0) return index;
  }

  // No tokens available — return empty index
  return new Map();
}
