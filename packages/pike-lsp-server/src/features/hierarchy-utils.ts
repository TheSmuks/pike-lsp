/**
 * Hierarchy Utilities
 *
 * Shared helpers used by both call hierarchy and type hierarchy handlers.
 */

import { SymbolKind } from 'vscode-languageserver/node.js';
import { promises as fs } from 'node:fs';
import { buildCallPositionIndex } from './diagnostics/symbol-index.js';
import { Logger } from '@pike-lsp/core';
import type { Services } from '../services/index.js';
import type { PikeSymbol, PikeSymbolKind, PikeToken } from '@pike-lsp/pike-bridge';

/**
 * Validation set for PikeSymbolKind values
 * Using type assertions ensures TypeScript validates against the union type
 */
const VALID_KINDS: Set<PikeSymbolKind> = new Set<PikeSymbolKind>([
  'class' as PikeSymbolKind,
  'method' as PikeSymbolKind,
  'function' as PikeSymbolKind,
  'variable' as PikeSymbolKind,
  'constant' as PikeSymbolKind,
  'typedef' as PikeSymbolKind,
  'enum' as PikeSymbolKind,
  'enum_constant' as PikeSymbolKind,
  'inherit' as PikeSymbolKind,
  'import' as PikeSymbolKind,
  'include' as PikeSymbolKind,
  'module' as PikeSymbolKind,
]);

/**
 * Validate symbol kind and log warnings for unknown values
 */
export function validateSymbolKind(symbol: PikeSymbol, context: string): void {
  if (!VALID_KINDS.has(symbol.kind)) {
    const log = new Logger('Hierarchy');
    log.warn(`Unknown symbol kind: ${symbol.kind}`, {
      symbol: symbol.name,
      kind: symbol.kind,
      context,
    });
  }
}

/**
 * Check if a symbol kind represents a callable entity (function or method)
 */
export function isCallable(kind: string): boolean {
  return kind === 'method' || kind === 'function';
}

/**
 * Get the appropriate SymbolKind for a callable symbol
 */
export function getCallableSymbolKind(
  kind: string
): typeof SymbolKind.Method | typeof SymbolKind.Function {
  return kind === 'method' ? SymbolKind.Method : SymbolKind.Function;
}

/**
 * Format inheritance detail for TypeHierarchyItem
 * Shows "class ClassName (extends Parent1, Parent2)"
 */
export function formatInheritanceDetail(
  symbol: PikeSymbol,
  cached: { symbols: PikeSymbol[] }
): string {
  if (!symbol.position) {
    return `class ${symbol.name}`;
  }

  // Find inherit symbols on the same line as the class declaration
  const inheritSymbols = cached.symbols.filter(
    s => s.position && s.position.line === symbol.position!.line && s.kind === 'inherit'
  );

  if (inheritSymbols.length === 0) {
    return `class ${symbol.name}`;
  }

  const parents = inheritSymbols
    .map(s => s.classname ?? s.name)
    .filter((name): name is string => Boolean(name));

  if (parents.length === 0) {
    return `class ${symbol.name}`;
  }

  return `class ${symbol.name} (extends ${parents.join(', ')})`;
}

/**
 * Get symbols for a URI from documentCache, falling back to workspaceIndex.
 */
export function getSymbolsForUri(uri: string, services: Services): PikeSymbol[] {
  const { documentCache } = services;
  const cached = documentCache.get(uri);
  if (cached?.symbols && cached.symbols.length > 0) {
    return cached.symbols;
  }

  const workspaceIndex = services.workspaceIndex as unknown as {
    getDocumentSymbols?: (documentUri: string) => PikeSymbol[];
  };
  if (workspaceIndex?.getDocumentSymbols) {
    const indexedSymbols = workspaceIndex.getDocumentSymbols(uri);
    if (indexedSymbols && indexedSymbols.length > 0) {
      return indexedSymbols;
    }
  }

  return [];
}

/**
 * Collect all known URIs from documentCache and workspaceIndex.
 */
export function getKnownUris(services: Services): string[] {
  const { documentCache } = services;
  const uris = new Set<string>();
  for (const uri of documentCache.keys()) {
    uris.add(uri);
  }

  const workspaceIndex = services.workspaceIndex as unknown as {
    getAllDocumentUris?: () => string[];
  };
  if (workspaceIndex?.getAllDocumentUris) {
    for (const uri of workspaceIndex.getAllDocumentUris()) {
      uris.add(uri);
    }
  }
  return Array.from(uris);
}

/**
 * Build a map from identifier text to its positions from Pike tokens.
 */
export function buildSymbolPositionsFromTokens(
  tokens: PikeToken[]
): Map<string, Array<{ line: number; character: number }>> {
  const symbolPositions = new Map<string, Array<{ line: number; character: number }>>();

  for (const token of tokens) {
    if (!token?.text) {
      continue;
    }

    const line = Math.max(0, token.line - 1); // Convert to 0-indexed
    const character = Math.max(0, token.character);

    const positions = symbolPositions.get(token.text) ?? [];
    positions.push({ line, character });
    symbolPositions.set(token.text, positions);
  }

  return symbolPositions;
}

/**
 * Result type for loadClosedWorkspaceFile.
 */
export interface LoadedWorkspaceFile {
  uri: string;
  text: string;
  symbols: PikeSymbol[];
  symbolPositions: Map<string, Array<{ line: number; character: number }>>;
  callPositions: Map<string, Array<{ line: number; character: number }>>;
}

/**
 * Load and analyze a closed (not open in editor) workspace file for hierarchy lookups.
 */
export async function loadClosedWorkspaceFile(
  fileInfo: { uri: string },
  services: Services
): Promise<LoadedWorkspaceFile | null> {
  const log = new Logger('Hierarchy');
  try {
    const filePath = decodeURIComponent(fileInfo.uri.replace(/^file:\/\//, ''));
    const text = await fs.readFile(filePath, 'utf-8');
    const analyzed = await services.bridge?.bridge?.analyze(text, ['parse', 'tokenize'], filePath);
    const symbols = analyzed?.result?.parse?.symbols ?? [];
    const tokens = analyzed?.result?.tokenize?.tokens ?? [];
    const symbolPositions = buildSymbolPositionsFromTokens(tokens);

    // Build call positions for call hierarchy
    const callableNames = new Set<string>(
      symbols
        .filter(s => isCallable(s.kind))
        .map(s => s.name)
        .filter((name): name is string => !!name)
    );
    const callPositions = buildCallPositionIndex(tokens, callableNames);
    return {
      uri: fileInfo.uri,
      text,
      symbols,
      symbolPositions,
      callPositions,
    };
  } catch (err) {
    log.debug(`Failed to read closed workspace file for call hierarchy: ${fileInfo.uri}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Resolve a class definition to its URI and line by searching all known documents.
 */
export function resolveClassDefinition(
  className: string,
  services: Services,
  preferredUri?: string
): { uri: string; line: number } | null {
  const uris = getKnownUris(services);
  const orderedUris = preferredUri
    ? [preferredUri, ...uris.filter(uri => uri !== preferredUri)]
    : uris;

  for (const uri of orderedUris) {
    const symbols = getSymbolsForUri(uri, services);
    if (symbols.length === 0) {
      continue;
    }

    const classSymbol = symbols.find(s => s.kind === 'class' && s.name === className && s.position);
    if (classSymbol?.position) {
      return {
        uri,
        line: Math.max(0, (classSymbol.position.line ?? 1) - 1),
      };
    }
  }

  return null;
}
