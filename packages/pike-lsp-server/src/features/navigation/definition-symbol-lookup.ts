/**
 * Symbol Lookup for Go-to-Definition
 *
 * Functions for finding symbols at cursor positions and in
 * included files, workspace cache, and direct includes.
 * Extracted from definition.ts for maintainability.
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Location } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { DocumentCache } from '../../services/document-cache.js';
import type { DocumentCacheEntry } from '../../core/types.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { Logger } from '@pike-lsp/core';
import { readFile } from 'node:fs/promises';
import { getWordAtPositionGeneric } from '../utils/pike-identifier.js';
import { uriToFsPath } from '../../utils/uri-path.js';

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
 * Find a symbol by name in included file symbols.
 * Used for go-to-definition when the symbol is defined in an included header file.
 */
export function findSymbolInIncludedFiles(
  symbolName: string,
  cached: DocumentCacheEntry,
  services: Services,
  log: Logger
): { symbol: PikeSymbol; filePath: string } | null {
  // Check if we have dependencies with included symbols
  if (!cached.dependencies?.includes || !services.includeResolver) {
    return null;
  }

  for (const include of cached.dependencies.includes) {
    if (!include.symbols) continue;

    for (const symbol of include.symbols) {
      if (symbol.name === symbolName && symbol.position) {
        log.debug('Definition: found symbol in included file', {
          symbolName,
          filePath: include.resolvedPath,
        });
        return { symbol, filePath: include.resolvedPath };
      }
    }
  }

  return null;
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

/**
 * Parse included files via bridge to find a symbol by name.
 * Uses the dependency-resolved include list.
 */
export async function findSymbolTextInIncludedFiles(
  symbolName: string,
  cached: DocumentCacheEntry,
  services: Services,
  log: Logger
): Promise<{ filePath: string; line: number; character: number } | null> {
  if (!symbolName || !cached.dependencies?.includes || !services.includeResolver) {
    return null;
  }

  // Parse included files via bridge analyze to get real symbol tables
  for (const include of cached.dependencies.includes) {
    try {
      if (!services.bridge?.bridge) {
        continue;
      }

      const content = await readFile(include.resolvedPath, 'utf-8');
      const response = await services.bridge.bridge.analyze(
        content,
        ['parse'],
        include.resolvedPath
      );

      const symbols = response.result?.parse?.symbols;
      if (!symbols) {
        continue;
      }

      const matched = symbols.find(s => s.name === symbolName && s.position);
      if (matched?.position) {
        // Pike positions are 1-based; LSP uses 0-based
        const line = Math.max(0, (matched.position.line ?? 1) - 1);
        const character = Math.max(0, (matched.position.column ?? 1) - 1);
        log.debug('Definition: found symbol in included file via bridge parse', {
          symbolName,
          filePath: include.resolvedPath,
          line,
          character,
        });
        return {
          filePath: include.resolvedPath,
          line,
          character,
        };
      }
    } catch (err) {
      log.debug('Definition: failed to parse included file', {
        includePath: include.resolvedPath,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
  }

  return null;
}

/**
 * Find a symbol by parsing #include directives directly from the source document.
 * Traverses each include path, resolves it, parses the included file, and searches symbols.
 */
export async function findSymbolInDirectIncludes(
  symbolName: string,
  document: TextDocument,
  uri: string,
  services: Services,
  log: Logger
): Promise<{ filePath: string; line: number; character: number } | null> {
  if (!symbolName || !services.bridge?.bridge) {
    return null;
  }

  // Parse #include directives via bridge extractImports instead of regex
  let imports: Awaited<ReturnType<typeof services.bridge.bridge.extractImports>>;
  try {
    imports = await services.bridge.bridge.extractImports(document.getText(), uriToFsPath(uri));
  } catch (err) {
    log.debug('Definition: failed to extract imports', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  const includePaths = imports.imports
    .filter(imp => imp.type === 'include')
    .map(imp => imp.path ?? '');

  for (const includePath of includePaths) {
    if (!includePath) continue;

    try {
      const resolved = await services.bridge.bridge.resolveInclude(includePath, uriToFsPath(uri));
      if (!resolved.exists || !resolved.path) {
        continue;
      }

      const includeContent = await readFile(resolved.path, 'utf-8');
      const response = await services.bridge.bridge.analyze(
        includeContent,
        ['parse'],
        resolved.path
      );

      const symbols = response.result?.parse?.symbols;
      if (!symbols) {
        continue;
      }

      const matched = symbols.find(s => s.name === symbolName && s.position);
      if (matched?.position) {
        const line = Math.max(0, (matched.position.line ?? 1) - 1);
        const character = Math.max(0, (matched.position.column ?? 1) - 1);
        log.debug('Definition: resolved symbol through direct include via bridge parse', {
          symbolName,
          includePath,
          resolvedPath: resolved.path,
          line,
          character,
        });
        return {
          filePath: resolved.path,
          line,
          character,
        };
      }
    } catch (err) {
      log.debug('Definition: include traversal failed', {
        includePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return null;
}
