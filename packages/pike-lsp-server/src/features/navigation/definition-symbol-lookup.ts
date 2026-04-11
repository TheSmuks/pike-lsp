/**
 * Symbol Lookup for Go-to-Definition
 *
 * Functions for finding symbols at cursor positions and in
 * included files, workspace cache, and direct includes.
 * All include-based lookups use parser-backed symbols from
 * IncludeResolver and cached dependencies — never regex.
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Location } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { DocumentCache } from '../../services/document-cache.js';
import type { ResolvedInclude } from '../../core/types.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { Logger } from '@pike-lsp/core';
import { getWordAtPositionGeneric } from '../utils/pike-identifier.js';

/** Result of searching for a symbol in resolved includes. */
export interface IncludeSymbolMatch {
  filePath: string;
  line: number;
  character: number;
  /** Length of the symbol name, for building the end-of-range character. */
  nameLength: number;
}

/**
 * Find symbol at given position in document.
 */
export function findSymbolAtPosition(
  symbols: PikeSymbol[],
  position: { line: number; character: number },
  document: TextDocument
): PikeSymbol | null {
  const word = getWordAtPositionGeneric(document, position);
  if (!word) {
    return null;
  }

  // Find symbol with matching name
  for (const symbol of symbols) {
    if (symbol.name === word) {
      return symbol;
    }

    // Match against classname for inherits, imports, and includes (stripping quotes)
    if (symbol.kind === 'inherit' || symbol.kind === 'import' || symbol.kind === 'include') {
      const classname = symbol.classname?.replace(/['"]/g, '');
      // Check if classname matches word or part of it (e.g. Stdio in Stdio.File)
      if (classname === word || (classname && classname.includes(word))) {
        return symbol;
      }
    }
  }

  return null;
}

/**
 * Search an array of resolved includes for a symbol by name.
 * Returns the first match with a valid position.
 */
export function searchIncludesForSymbol(
  includes: ResolvedInclude[],
  symbolName: string,
  log: Logger
): IncludeSymbolMatch | null {
  for (const include of includes) {
    if (!include.symbols) continue;

    const matched = include.symbols.find(s => s.name === symbolName && s.position);
    if (matched?.position) {
      const line = Math.max(0, (matched.position.line ?? 1) - 1);
      const character = Math.max(0, (matched.position.column ?? 1) - 1);
      log.debug('Definition: found symbol in include via cached symbols', {
        symbolName,
        filePath: include.resolvedPath,
        line,
        character,
      });
      return {
        filePath: include.resolvedPath,
        line,
        character,
        nameLength: matched.name.length,
      };
    }
  }

  return null;
}

/**
 * Find a symbol by resolving includes via the includeResolver.
 * Uses cached dependencies when available, falling back to on-demand resolution.
 * All symbol lookups use the parser-backed symbols from IncludeResolver.
 */
export async function findSymbolInDirectIncludes(
  symbolName: string,
  uri: string,
  services: Services,
  log: Logger
): Promise<IncludeSymbolMatch | null> {
  if (!symbolName || !services.includeResolver) {
    return null;
  }

  // Check document cache for already-resolved dependencies
  const cached = services.documentCache.get(uri);

  // If dependencies are already resolved, search them directly
  if (cached?.dependencies?.includes && cached.dependencies.includes.length > 0) {
    const result = searchIncludesForSymbol(cached.dependencies.includes, symbolName, log);
    if (result) return result;
  }

  // Resolve dependencies on-demand via includeResolver
  try {
    const dependencies = await services.includeResolver.resolveDependencies(
      uri,
      cached?.symbols ?? []
    );
    if (!dependencies?.includes) {
      return null;
    }

    // Update cache for future lookups
    if (cached) {
      cached.dependencies = dependencies;
    }

    return searchIncludesForSymbol(dependencies.includes, symbolName, log);
  } catch (err) {
    log.debug('Definition: failed to resolve dependencies for direct include search', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Search workspace cache for a symbol definition.
 * Scores candidates by declaration kind to prefer methods/classes over plain variables.
 */
export function findSymbolInWorkspaceCache(
  symbolName: string,
  currentUri: string,
  documentCache: DocumentCache
): Location | null {
  const declarationKinds = new Set([
    'method',
    'class',
    'constant',
    'typedef',
    'enum',
    'macro',
    'program',
  ]);

  let bestMatch:
    | {
        uri: string;
        symbol: PikeSymbol;
      }
    | undefined;
  let bestScore = -1;

  for (const [entryUri, entry] of Array.from(documentCache.entries())) {
    if (entryUri === currentUri || !entry?.symbols?.length) {
      continue;
    }

    for (const symbol of entry.symbols) {
      if (!symbol.position) {
        continue;
      }

      const symbolLabel = symbol.name || symbol.classname;
      if (!symbolLabel || symbolLabel !== symbolName) {
        continue;
      }

      let score = 0;
      if (declarationKinds.has(symbol.kind)) {
        score += 10;
      }
      if (symbol.kind === 'method') {
        score += 3;
      }
      if (symbol.kind === 'class') {
        score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { uri: entryUri, symbol };
      }
    }
  }

  if (!bestMatch?.symbol.position || bestScore < 0) {
    return null;
  }

  const line = Math.max(0, (bestMatch.symbol.position.line ?? 1) - 1);
  const label = bestMatch.symbol.name || bestMatch.symbol.classname || symbolName;
  return {
    uri: bestMatch.uri,
    range: {
      start: { line, character: 0 },
      end: { line, character: label.length },
    },
  };
}
