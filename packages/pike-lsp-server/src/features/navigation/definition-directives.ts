/**
 * Directive Navigation
 *
 * Handles go-to-definition for Pike directives:
 * - #include "file.h"
 * - import Module;
 * - inherit "module";
 * - #require feature
 *
 * Uses cached symbols from bridge.parse() (available in cached.symbols)
 * to extract directive paths, avoiding brittle regex patterns.
 * Falls back to bridge.extractImports() only when symbols are unavailable.
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Location } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { DocumentCacheEntry } from '../../core/types.js';
import type { Logger } from '@pike-lsp/core';
import { uriToFsPath } from '../../utils/uri-path.js';

/** Directive kinds we handle for navigation */
const DIRECTIVE_KINDS = ['include', 'import', 'inherit', 'require'] as const;
type DirectiveKind = (typeof DIRECTIVE_KINDS)[number];

interface ExtractedDirective {
  kind: DirectiveKind;
  path: string;
}

/**
 * Look up a directive symbol at the given line from cached.symbols.
 * The bridge parse output already classifies directives by kind with
 * resolved path information in classname/name fields.
 */
function findDirectiveSymbol(
  symbols: DocumentCacheEntry['symbols'],
  line: number,
  kind?: DirectiveKind
): ExtractedDirective | undefined {
  if (!symbols || symbols.length === 0) return undefined;

  const directiveKinds: ReadonlySet<string> = new Set(['include', 'import', 'inherit', 'require']);
  for (const s of symbols) {
    if (kind && s.kind !== kind) continue;
    if (!directiveKinds.has(s.kind)) continue;
    if (s.position && s.position.line - 1 === line) {
      return {
        kind: s.kind as DirectiveKind,
        path: (s.classname || s.name || '').trim(),
      };
    }
  }
  return undefined;
}

/**
 * Extract a directive at the given line using bridge.extractImports.
 * Used as fallback when cached symbols are unavailable.
 */
async function extractDirectiveFromBridge(
  document: TextDocument,
  filePath: string,
  line: number,
  services: Services,
  log: Logger,
  kind?: DirectiveKind
): Promise<ExtractedDirective | undefined> {
  if (!services.bridge?.bridge) return undefined;
  try {
    const imports = await services.bridge.bridge.extractImports(document.getText(), filePath);
    const match = imports.imports.find(imp => {
      if (kind && imp.type !== kind) return false;
      return imp.line - 1 === line;
    });
    if (match) {
      return { kind: match.type as DirectiveKind, path: match.path };
    }
  } catch (err) {
    log.debug('Definition: bridge.extractImports failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return undefined;
}

/**
 * Handle go-to-definition for directive lines (#include, import, inherit, #require).
 * Returns a Location or null if cursor is not on a directive.
 *
 * Resolution strategy:
 * 1. Look up directive symbol from cached.symbols (parsed by bridge)
 * 2. Fall back to bridge.extractImports for fresh parse
 * 3. Resolve the extracted path via bridge or cached dependencies
 */
export async function handleDirectiveNavigation(
  document: TextDocument,
  position: { line: number; character: number },
  uri: string,
  services: Services,
  cached: DocumentCacheEntry,
  log: Logger
): Promise<Location | null> {
  const lineText = document
    .getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line + 1, character: 0 },
    })
    .trim();

  // Determine expected directive kind from line prefix for fast rejection
  let expectedKind: DirectiveKind | undefined;
  if (lineText.startsWith('#include')) expectedKind = 'include';
  else if (lineText.startsWith('import ')) expectedKind = 'import';
  else if (lineText.startsWith('inherit ')) expectedKind = 'inherit';
  else if (lineText.startsWith('#require ')) expectedKind = 'require';
  else return null; // Not a directive line

  const filePath = uriToFsPath(uri);

  // Try cached symbols first (already parsed by Parser.Pike)
  const directive = findDirectiveSymbol(cached.symbols, position.line, expectedKind);

  // Fall back to bridge.extractImports for a fresh parse
  if (!directive) {
    const bridgeDirective = await extractDirectiveFromBridge(
      document,
      filePath,
      position.line,
      services,
      log,
      expectedKind
    );
    if (!bridgeDirective) {
      // Last resort for inherit: try cached.inherits directly by line
      // (supports scenarios where bridge is unavailable)
      if (expectedKind === 'inherit' && cached.inherits?.length) {
        return resolveInheritByLine(cached.inherits, position.line);
      }
      return null;
    }
    return resolveDirective(bridgeDirective, cached, services, filePath, log);
  }

  return resolveDirective(directive, cached, services, filePath, log);
}

/**
 * Resolve a directive to a file Location using cached dependencies or bridge.
 */
async function resolveDirective(
  directive: ExtractedDirective,
  cached: DocumentCacheEntry,
  services: Services,
  filePath: string,
  log: Logger
): Promise<Location | null> {
  // #require doesn't point to a file, no navigation
  if (directive.kind === 'require') {
    log.debug('Definition: directive require (no navigation)', { feature: directive.path });
    return null;
  }

  if (!directive.path) return null;

  // #include: resolve via bridge.resolveInclude or cached dependencies
  if (directive.kind === 'include') {
    return resolveIncludeDirective(directive.path, cached, services, filePath, log);
  }

  // import: check cached dependencies first, then bridge.resolveImport
  if (directive.kind === 'import') {
    return resolveImportDirective(directive.path, cached, services, filePath, log);
  }

  // inherit: check cached inherits first, then bridge.resolveImport
  if (directive.kind === 'inherit') {
    return resolveInheritDirective(directive.path, cached, services, filePath, log);
  }

  return null;
}

function makeLocation(resolvedPath: string): Location {
  return {
    uri: `file://${resolvedPath}`,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  };
}

async function resolveIncludeDirective(
  includePath: string,
  _cached: DocumentCacheEntry,
  services: Services,
  filePath: string,
  log: Logger
): Promise<Location | null> {
  log.debug('Definition: directive include navigation', { includePath });

  if (!services.bridge?.bridge) return null;
  try {
    const result = await services.bridge.bridge.resolveInclude(includePath, filePath);
    if (result.exists && result.path) {
      return makeLocation(result.path);
    }
  } catch (err) {
    log.debug('Definition: include resolution failed', {
      includePath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return null;
}

async function resolveImportDirective(
  importPath: string,
  cached: DocumentCacheEntry,
  services: Services,
  filePath: string,
  log: Logger
): Promise<Location | null> {
  log.debug('Definition: directive import navigation', { importPath });

  // Check cached dependencies first
  if (cached.dependencies?.imports) {
    for (const imp of cached.dependencies.imports) {
      if (imp.modulePath === importPath || imp.modulePath.endsWith('/' + importPath)) {
        if (imp.resolvedPath) {
          return makeLocation(imp.resolvedPath);
        }
      }
    }
  }

  // Fall back to bridge resolution
  if (!services.bridge?.bridge) return null;
  try {
    const result = await services.bridge.bridge.resolveImport('import', importPath, filePath);
    if (result.exists && result.path) {
      return makeLocation(result.path);
    }
  } catch (err) {
    log.debug('Definition: import resolution failed', {
      importPath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return null;
}

/**
 * Resolve inherit by matching cached.inherits entries at the given line.
 * Used as last resort when neither symbols nor bridge are available.
 */
function resolveInheritByLine(
  inherits: NonNullable<DocumentCacheEntry['inherits']>,
  _line: number
): Location | null {
  // cached.inherits doesn't carry line info, so return the first match.
  // This is a best-effort fallback for offline/no-bridge scenarios.
  const first = inherits[0];
  if (first?.path) {
    return makeLocation(first.path);
  }
  return null;
}
async function resolveInheritDirective(
  inheritPath: string,
  cached: DocumentCacheEntry,
  services: Services,
  filePath: string,
  log: Logger
): Promise<Location | null> {
  log.debug('Definition: directive inherit navigation', { inheritPath });

  // Check cached inherits first (works even without bridge)
  if (cached.inherits) {
    for (const inh of cached.inherits) {
      if (inh.source_name === inheritPath || inh.path === inheritPath) {
        if (inh.path) {
          return makeLocation(inh.path);
        }
      }
    }
  }

  // Fall back to bridge resolution
  if (!services.bridge?.bridge) return null;
  try {
    const result = await services.bridge.bridge.resolveImport('inherit', inheritPath, filePath);
    if (result.exists && result.path) {
      return makeLocation(result.path);
    }
  } catch (err) {
    log.debug('Definition: inherit resolution failed', {
      inheritPath,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return null;
}
