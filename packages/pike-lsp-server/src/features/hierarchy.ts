/**
 * Hierarchy Feature Handlers
 *
 * Groups "what is related to this" handlers:
 * - Call Hierarchy: who calls this / what does this call
 * - Type Hierarchy: supertypes / subtypes
 *
 * Each handler includes try/catch with logging fallback (SRV-12).
 */

import {
  Connection,
  SymbolKind,
  Range,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  TypeHierarchyItem,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import { promises as fs } from 'node:fs';

import type { Services } from '../services/index.js';
import type { PikeSymbol, PikeSymbolKind, PikeToken } from '@pike-lsp/pike-bridge';
import { Logger } from '@pike-lsp/core';
import { PikeIntrospectionService } from '../services/pike-introspection.js';
import { buildCallPositionIndex } from './diagnostics/symbol-index.js';

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
function validateSymbolKind(symbol: PikeSymbol, context: string): void {
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
function isCallable(kind: string): boolean {
  return kind === 'method' || kind === 'function';
}

/**
 * Get the appropriate SymbolKind for a callable symbol
 */
function getCallableSymbolKind(
  kind: string
): typeof SymbolKind.Method | typeof SymbolKind.Function {
  return kind === 'method' ? SymbolKind.Method : SymbolKind.Function;
}

/**
 * Format inheritance detail for TypeHierarchyItem
 * Shows "class ClassName (extends Parent1, Parent2)"
 */
function formatInheritanceDetail(symbol: PikeSymbol, cached: { symbols: PikeSymbol[] }): string {
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
 * Register all hierarchy handlers with the LSP connection.
 *
 * @param connection - LSP connection
 * @param services - Bundle of server services
 * @param documents - TextDocuments manager for LSP document synchronization
 */
export function registerHierarchyHandlers(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
  const log = new Logger('Hierarchy');
  const pikeIntrospection = services.pikeIntrospection ?? new PikeIntrospectionService(services);

  const getSymbolsForUri = (uri: string): PikeSymbol[] => {
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
  };

  const getKnownUris = (): string[] => {
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

    // Include uncached files from workspace scanner
    const scanner = services.workspaceScanner as unknown as {
      getUncachedFiles?: (cachedUris: Set<string>) => Array<{ uri: string }>;
    };
    if (scanner?.getUncachedFiles) {
      for (const file of scanner.getUncachedFiles(uris)) {
        uris.add(file.uri);
      }
    }

    return Array.from(uris);
  };

  const buildSymbolPositionsFromTokens = (
    tokens: PikeToken[]
  ): Map<string, Array<{ line: number; character: number }>> => {
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
  };

  const loadClosedWorkspaceFile = async (fileInfo: {
    uri: string;
  }): Promise<{
    uri: string;
    text: string;
    symbols: PikeSymbol[];
    symbolPositions: Map<string, Array<{ line: number; character: number }>>;
    callPositions: Map<string, Array<{ line: number; character: number }>>;
  } | null> => {
    try {
      const filePath = decodeURIComponent(fileInfo.uri.replace(/^file:\/\//, ''));
      const text = await fs.readFile(filePath, 'utf-8');
      const analyzed = await services.bridge?.bridge?.analyze(
        text,
        ['parse', 'tokenize'],
        filePath
      );
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

      services.workspaceScanner.updateFileData(fileInfo.uri, {
        symbolPositions,
      });

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
  };

  const resolveClassDefinition = (
    className: string,
    preferredUri?: string
  ): { uri: string; line: number } | null => {
    const uris = getKnownUris();
    const orderedUris = preferredUri
      ? [preferredUri, ...uris.filter(uri => uri !== preferredUri)]
      : uris;

    for (const uri of orderedUris) {
      const symbols = getSymbolsForUri(uri);
      if (symbols.length === 0) {
        continue;
      }

      const classSymbol = symbols.find(
        s => s.kind === 'class' && s.name === className && s.position
      );
      if (classSymbol?.position) {
        return {
          uri,
          line: Math.max(0, (classSymbol.position.line ?? 1) - 1),
        };
      }
    }

    return null;
  };

  /**
   * Prepare call hierarchy - get call hierarchy item at position
   */
  connection.languages.callHierarchy.onPrepare(params => {
    log.debug('Call hierarchy prepare', { uri: params.textDocument.uri });
    try {
      const uri = params.textDocument.uri;
      const cached = documentCache.get(uri);
      const document = documents.get(uri);

      if (!cached || !document) {
        return null;
      }

      // Find method at position
      const text = document.getText();
      const offset = document.offsetAt(params.position);

      let wordStart = offset;
      let wordEnd = offset;
      while (wordStart > 0 && /\w/.test(text[wordStart - 1] ?? '')) {
        wordStart--;
      }
      while (wordEnd < text.length && /\w/.test(text[wordEnd] ?? '')) {
        wordEnd++;
      }
      const word = text.slice(wordStart, wordEnd);

      if (!word) return null;

      // Find callable symbol (function or method)
      const callableSymbol = cached.symbols.find(
        s => s.name === word && isCallable(s.kind) && s.position
      );

      if (!callableSymbol || !callableSymbol.position) {
        return null;
      }
      if (
        callableSymbol.position.line === undefined ||
        callableSymbol.position.column === undefined
      ) {
        log.warn(`Symbol ${callableSymbol.name} has incomplete position information`);
        return null;
      }

      const line = callableSymbol.position.line - 1;

      return [
        {
          name: callableSymbol.name,
          kind: getCallableSymbolKind(callableSymbol.kind),
          uri,
          range: {
            start: { line, character: 0 },
            end: { line, character: callableSymbol.name.length },
          },
          selectionRange: {
            start: { line, character: 0 },
            end: { line, character: callableSymbol.name.length },
          },
        },
      ];
    } catch (err) {
      log.error(
        `Call hierarchy prepare failed for ${params.textDocument.uri} at line ${params.position.line + 1}, col ${params.position.character}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  });

  /**
   * Incoming calls - who calls this function?
   * Uses symbolPositions from documentCache (built via Pike tokenization) for accuracy.
   */
  connection.languages.callHierarchy.onIncomingCalls(async params => {
    log.debug('Call hierarchy incoming calls', { item: params.item.name });
    try {
      const results: CallHierarchyIncomingCall[] = [];
      const targetName = params.item.name;
      const targetUri = params.item.uri;

      // Check if document has symbolPositions (fully analyzed)
      const cached = documentCache.get(targetUri);
      if (!cached?.symbolPositions) {
        return results; // Empty array = no callers found
      }

      // Track already-added callers to prevent duplicates
      const addedCallers = new Set<string>();

      // Helper function to search for calls in a cached document
      const searchCachedDocument = (
        docUri: string,
        cached: {
          symbols: PikeSymbol[];
          symbolPositions?: Map<string, { line: number; character: number }[]>;
          callPositions?: Map<string, { line: number; character: number }[]>;
        },
        text: string
      ) => {
        const lines = text.split('\n');
        const symbols = cached.symbols;

        // #1206: Use callPositions directly (already filtered to actual function calls)
        const targetCallPositions = cached.callPositions?.get(targetName) ?? [];

        // For each callable, find which calls are within its body
        for (const symbol of symbols) {
          if (!isCallable(symbol.kind) || !symbol.position) continue;

          // Don't include self-references from the same method
          if (docUri === targetUri && symbol.name === targetName) continue;

          const methodStartLine = (symbol.position.line ?? 1) - 1;

          // Find callable end by looking for the next callable
          const nextCallableLine =
            symbols
              .filter(
                s =>
                  isCallable(s.kind) &&
                  s.position &&
                  (s.position.line ?? 0) > (symbol.position?.line ?? 0)
              )
              .map(s => (s.position?.line ?? 0) - 1)
              .sort((a, b) => a - b)[0] ?? lines.length;

          // Find call positions within this callable's body
          const ranges: Range[] = [];
          for (const pos of targetCallPositions) {
            if (pos.line >= methodStartLine && pos.line < nextCallableLine) {
              ranges.push({
                start: { line: pos.line, character: pos.character },
                end: { line: pos.line, character: pos.character + targetName.length },
              });
            }
          }

          if (ranges.length > 0) {
            // Prevent duplicate entries for the same caller
            const callerId = `${docUri}:${symbol.name}:${methodStartLine}`;
            if (addedCallers.has(callerId)) continue;
            addedCallers.add(callerId);

            results.push({
              from: {
                name: symbol.name,
                kind: SymbolKind.Method,
                uri: docUri,
                range: {
                  start: { line: methodStartLine, character: 0 },
                  end: { line: methodStartLine, character: symbol.name.length },
                },
                selectionRange: {
                  start: { line: methodStartLine, character: 0 },
                  end: { line: methodStartLine, character: symbol.name.length },
                },
              },
              fromRanges: ranges,
            });
          }
        }
      };

      // Search all open/cached documents (these have accurate symbolPositions)
      const entries = Array.from(documentCache.entries());
      for (const [docUri, cached] of entries) {
        const doc = documents.get(docUri);
        if (!doc) continue;
        searchCachedDocument(docUri, cached, doc.getText());
      }

      if (services.workspaceScanner?.isReady()) {
        const cachedUris = new Set(documentCache.keys());
        const uncachedFiles = services.workspaceScanner.getUncachedFiles(cachedUris);

        for (const fileInfo of uncachedFiles) {
          const loaded = await loadClosedWorkspaceFile(fileInfo);
          if (!loaded) {
            continue;
          }

          searchCachedDocument(
            loaded.uri,
            {
              symbols: loaded.symbols,
              symbolPositions: loaded.symbolPositions,
              callPositions: loaded.callPositions,
            },
            loaded.text
          );
        }
      }

      return results;
    } catch (err) {
      log.error(
        `Call hierarchy incoming calls failed for ${params.item.name} in ${params.item.uri}: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  });

  /**
   * Outgoing calls - what does this function call?
   * Uses symbolPositions from documentCache (built via Pike tokenization) for accuracy.
   */
  connection.languages.callHierarchy.onOutgoingCalls(async params => {
    log.debug('Call hierarchy outgoing calls', { item: params.item.name });
    try {
      const results: CallHierarchyOutgoingCall[] = [];
      const sourceUri = params.item.uri;
      const sourceLine = params.item.range.start.line;
      const sourceMethodName = params.item.name;

      const cached = documentCache.get(sourceUri);
      const doc = documents.get(sourceUri);
      if (!cached || !doc) {
        return results;
      }

      if (!cached.symbolPositions) {
        return results;
      }

      const text = doc.getText();
      const lines = text.split('\n');

      // Find this callable and its end
      const sourceSymbol = cached.symbols.find(
        s =>
          isCallable(s.kind) && s.position && Math.max(0, (s.position.line ?? 1) - 1) === sourceLine
      );

      if (!sourceSymbol) return results;

      const callableStartLine = sourceLine;
      const nextCallableLine =
        cached.symbols
          .filter(s => isCallable(s.kind) && s.position && (s.position.line ?? 0) - 1 > sourceLine)
          .map(s => (s.position?.line ?? 0) - 1)
          .sort((a, b) => a - b)[0] ?? lines.length;

      // #1206: Use callPositions directly - already filtered to actual function calls
      const calledFunctions = new Map<string, Range[]>();

      if (cached.callPositions) {
        for (const [funcName, positions] of cached.callPositions.entries()) {
          // Skip self-recursion
          if (funcName === sourceMethodName) continue;

          // Filter positions to those within this callable's body
          const ranges: Range[] = [];
          for (const pos of positions) {
            if (pos.line >= callableStartLine && pos.line < nextCallableLine) {
              ranges.push({
                start: { line: pos.line, character: pos.character },
                end: { line: pos.line, character: pos.character + funcName.length },
              });
            }
          }

          if (ranges.length > 0) {
            calledFunctions.set(funcName, ranges);
          }
        }
      }

      // Build results for each called function
      for (const [funcName, ranges] of calledFunctions) {
        // Phase 2.1: Search all cached documents for function definition
        let targetUri = sourceUri;
        let targetLine: number | null = null;

        // First, try the current document
        const targetSymbol = cached.symbols.find(s => s.name === funcName && isCallable(s.kind));
        if (targetSymbol?.position) {
          // Validate position has required fields before using
          if (
            targetSymbol.position.line === undefined ||
            targetSymbol.position.column === undefined
          ) {
            log.debug(`Skipping ${funcName} (incomplete position in current document)`);
            continue; // Skip this function entirely
          }
          targetLine = targetSymbol.position.line - 1;
        } else {
          // Not found in current document - search all cached documents
          for (const [docUri, cachedDoc] of documentCache.entries()) {
            const symbol = cachedDoc.symbols?.find(s => s.name === funcName && isCallable(s.kind));
            if (symbol?.position) {
              // Validate position has required fields before using
              if (symbol.position.line === undefined || symbol.position.column === undefined) {
                log.debug(`Skipping ${funcName} (incomplete position in ${docUri})`);
                continue; // Skip to next document
              }
              targetUri = docUri;
              targetLine = symbol.position.line - 1;
              break; // Found it
            }
          }

          if (targetLine === null && services.workspaceScanner?.isReady()) {
            const cachedUris = new Set(documentCache.keys());
            const uncachedFiles = services.workspaceScanner.getUncachedFiles(cachedUris);

            for (const fileInfo of uncachedFiles) {
              const loaded = await loadClosedWorkspaceFile(fileInfo);
              if (!loaded) {
                continue;
              }

              const symbol = loaded.symbols.find(s => s.name === funcName && isCallable(s.kind));
              if (!symbol?.position) {
                continue;
              }

              if (symbol.position.line === undefined || symbol.position.column === undefined) {
                continue;
              }

              targetUri = loaded.uri;
              targetLine = symbol.position.line - 1;
              break;
            }
          }
        }

        // Skip if targetLine is still null (not found in any document)
        if (targetLine === null) {
          log.debug(`Skipping unresolved function call: ${funcName} (not in any cached document)`);
          continue; // Skip this function entirely - don't create invalid item
        }

        results.push({
          to: {
            name: funcName,
            kind: SymbolKind.Method,
            uri: targetUri,
            range: {
              start: { line: targetLine, character: 0 },
              end: { line: targetLine, character: funcName.length },
            },
            selectionRange: {
              start: { line: targetLine, character: 0 },
              end: { line: targetLine, character: funcName.length },
            },
          },
          fromRanges: ranges,
        });
      }

      return results;
    } catch (err) {
      log.error(
        `Call hierarchy outgoing calls failed for ${params.item.name} in ${params.item.uri}: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  });

  /**
   * Prepare type hierarchy - get type hierarchy item at position
   *
   * Phase 3: Distinguish null from empty results
   * - Returns null: "no type hierarchy item at this position" (cursor not on class, document not analyzed)
   * - Returns TypeHierarchyItem[]: valid class with inheritance detail
   */
  connection.languages.typeHierarchy.onPrepare(params => {
    log.debug('Type hierarchy prepare', { uri: params.textDocument.uri });
    try {
      const uri = params.textDocument.uri;
      const cached = documentCache.get(uri);
      const document = documents.get(uri);

      // Return null: document not analyzed (valid LSP response)
      if (!cached || !document) {
        return null;
      }

      // Find class at position
      const text = document.getText();
      const offset = document.offsetAt(params.position);

      let wordStart = offset;
      let wordEnd = offset;
      while (wordStart > 0 && /\w/.test(text[wordStart - 1] ?? '')) {
        wordStart--;
      }
      while (wordEnd < text.length && /\w/.test(text[wordEnd] ?? '')) {
        wordEnd++;
      }
      const word = text.slice(wordStart, wordEnd);

      // Return null: cursor not on a class (valid LSP response)
      if (!word) return null;

      // Find class symbol
      const classSymbol = cached.symbols.find(
        s => s.name === word && s.kind === 'class' && s.position
      );

      // Return null: symbol not found or not a class (valid LSP response)
      if (!classSymbol || !classSymbol.position) {
        return null;
      }

      const line = Math.max(0, (classSymbol.position.line ?? 1) - 1);

      // Validate kind
      validateSymbolKind(classSymbol, 'type hierarchy prepare');

      return [
        {
          name: classSymbol.name,
          kind: SymbolKind.Class,
          uri,
          range: {
            start: { line, character: 0 },
            end: { line, character: classSymbol.name.length },
          },
          selectionRange: {
            start: { line, character: 0 },
            end: { line, character: classSymbol.name.length },
          },
          // Phase 3: Populate detail field with inheritance summary
          detail: formatInheritanceDetail(classSymbol, cached),
        },
      ];
    } catch (err) {
      log.error(
        `Type hierarchy prepare failed for ${params.textDocument.uri} at line ${params.position.line + 1}, col ${params.position.character}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  });

  /**
   * Supertypes - what does this class inherit from?
   *
   * Phase 2: Circular inheritance detection (single-file only)
   * - Tracks visited nodes to detect cycles
   * - Cross-file cycle detection NOT implemented in Phase 2
   *
   * Phase 5: Diagnostic filtering
   * - Only clears type-hierarchy diagnostics (d.code !== 'type-hierarchy')
   * - All type hierarchy diagnostics include code: 'type-hierarchy'
   *
   * Phase 6: Workspace file search for cross-file inheritance
   * - Uses workspaceScanner to find uncached files
   * - Reads and searches uncached files for class/inherit patterns
   */
  connection.languages.typeHierarchy.onSupertypes(async params => {
    log.debug('Type hierarchy supertypes', { item: params.item.name });
    try {
      const results: TypeHierarchyItem[] = [];
      const classUri = params.item.uri;
      const className = params.item.name;

      const sourceSymbols = getSymbolsForUri(classUri);
      if (sourceSymbols.length === 0) {
        return results; // Empty array = no hierarchy found
      }

      const visited = new Set<string>();
      const cyclePath: string[] = [];
      const seenResults = new Set<string>();
      const queue = [{ uri: classUri, name: className }];

      while (queue.length > 0) {
        const current = queue.shift()!;
        const visitKey = `${current.uri}:${current.name}`;

        // Circular inheritance detected
        if (visited.has(visitKey)) {
          cyclePath.push(current.name);
          log.warn(`Circular inheritance detected: ${cyclePath.join(' -> ')}`, {
            uri: classUri,
            className,
          });
          return results;
        }

        visited.add(visitKey);
        cyclePath.push(current.name);

        const inheritRelations = await pikeIntrospection.getInherits(current.uri);
        const classInherits = inheritRelations.filter(
          relation => relation.ownerClass === current.name
        );

        for (const relation of classInherits) {
          const inheritedName = relation.inheritedName;
          if (!inheritedName) continue;

          const parentDefinition = resolveClassDefinition(inheritedName, current.uri);
          if (parentDefinition) {
            const parentKey = `${parentDefinition.uri}:${inheritedName}`;
            if (!seenResults.has(parentKey)) {
              seenResults.add(parentKey);
              const parentLine = parentDefinition.line;
              results.push({
                name: inheritedName,
                kind: SymbolKind.Class,
                uri: parentDefinition.uri,
                range: {
                  start: { line: parentLine, character: 0 },
                  end: { line: parentLine, character: inheritedName.length },
                },
                selectionRange: {
                  start: { line: parentLine, character: 0 },
                  end: { line: parentLine, character: inheritedName.length },
                },
              });
            }

            queue.push({ uri: parentDefinition.uri, name: inheritedName });
          } else {
            log.debug(`Parent class not found in indexed symbols: ${inheritedName}`);
          }
        }
      }

      return results; // Empty array = no parents found (valid)
    } catch (err) {
      log.error(
        `Type hierarchy supertypes failed for ${params.item.name} in ${params.item.uri}: ${err instanceof Error ? err.message : String(err)}`
      );
      return []; // Empty array signals error occurred
    }
  });

  /**
   * Subtypes - what classes inherit from this?
   *
   * Phase 5: Diagnostic filtering
   * - Only clears type-hierarchy diagnostics (d.code !== 'type-hierarchy')
   * - All type hierarchy diagnostics include code: 'type-hierarchy'
   *
   * Phase 6: Workspace file search for cross-file inheritance
   * - Uses workspaceScanner to find uncached files
   * - Reads and searches uncached files for inherit patterns
   */
  connection.languages.typeHierarchy.onSubtypes(async params => {
    log.debug('Type hierarchy subtypes', { item: params.item.name });
    try {
      const results: TypeHierarchyItem[] = [];
      const className = params.item.name;
      const classUri = params.item.uri;

      // Check if the source document is analyzed
      const cached = documentCache.get(classUri);
      if (!cached) {
        return results; // Empty array = no hierarchy found
      }

      const inheritanceIndex = new Map<
        string,
        Array<{ name: string; uri: string; line: number }>
      >();

      const addDirectSubtype = (
        parentName: string,
        subtype: { name: string; uri: string; line: number }
      ) => {
        const existing = inheritanceIndex.get(parentName) ?? [];
        existing.push(subtype);
        inheritanceIndex.set(parentName, existing);
      };

      for (const uri of getKnownUris()) {
        const relations = await pikeIntrospection.getInherits(uri);
        for (const relation of relations) {
          addDirectSubtype(relation.inheritedName, {
            name: relation.ownerClass,
            uri: relation.uri,
            line: relation.ownerLine,
          });
        }
      }

      const seenParents = new Set<string>();
      const seenResults = new Set<string>();
      const queue = [className];

      while (queue.length > 0) {
        const parent = queue.shift()!;
        if (seenParents.has(parent)) {
          continue;
        }
        seenParents.add(parent);

        const directSubtypes = inheritanceIndex.get(parent) ?? [];
        for (const subtype of directSubtypes) {
          const subtypeKey = `${subtype.uri}:${subtype.name}`;
          if (!seenResults.has(subtypeKey)) {
            seenResults.add(subtypeKey);
            results.push({
              name: subtype.name,
              kind: SymbolKind.Class,
              uri: subtype.uri,
              range: {
                start: { line: subtype.line, character: 0 },
                end: { line: subtype.line, character: subtype.name.length },
              },
              selectionRange: {
                start: { line: subtype.line, character: 0 },
                end: { line: subtype.line, character: subtype.name.length },
              },
            });
          }

          queue.push(subtype.name);
        }
      }

      return results; // Empty array = no children found (valid)
    } catch (err) {
      log.error(
        `Type hierarchy subtypes failed for ${params.item.name} in ${params.item.uri}: ${err instanceof Error ? err.message : String(err)}`
      );
      return []; // Empty array signals error occurred
    }
  });
}
