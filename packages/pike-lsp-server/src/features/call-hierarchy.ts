/**
 * Call Hierarchy Handlers
 *
 * Handlers for call hierarchy: who calls this / what does this call.
 */

import {
  Connection,
  SymbolKind,
  Range,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';

import type { Services } from '../services/index.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { Logger } from '@pike-lsp/core';
import { isCallable, getCallableSymbolKind, loadClosedWorkspaceFile } from './hierarchy-utils.js';

/**
 * Register call hierarchy handlers on the connection.
 */
export function registerCallHierarchyHandlers(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
  const log = new Logger('Hierarchy');

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
          const loaded = await loadClosedWorkspaceFile(fileInfo, services);
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
              const loaded = await loadClosedWorkspaceFile(fileInfo, services);
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
}
