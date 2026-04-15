/**
 * Type Hierarchy Handlers
 *
 * Handlers for type hierarchy: supertypes / subtypes.
 */

import { Connection, SymbolKind, TypeHierarchyItem } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';

import type { Services } from '../services/index.js';
import { Logger } from '@pike-lsp/core';
import { PikeIntrospectionService } from '../services/pike-introspection.js';
import {
  validateSymbolKind,
  formatInheritanceDetail,
  getSymbolsForUri,
  getKnownUris,
  resolveClassDefinition,
} from './hierarchy-utils.js';

/**
 * Register type hierarchy handlers on the connection.
 */
export function registerTypeHierarchyHandlers(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
  const log = new Logger('Hierarchy');
  const pikeIntrospection = services.pikeIntrospection ?? new PikeIntrospectionService(services);

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
   * - Uses workspaceIndex to find uncached files
   * - Reads and searches uncached files for class/inherit patterns
   */
  connection.languages.typeHierarchy.onSupertypes(async params => {
    log.debug('Type hierarchy supertypes', { item: params.item.name });
    try {
      const results: TypeHierarchyItem[] = [];
      const classUri = params.item.uri;
      const className = params.item.name;

      const sourceSymbols = getSymbolsForUri(classUri, services);
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

          const parentDefinition = resolveClassDefinition(inheritedName, services, current.uri);
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
   * - Uses workspaceIndex to find uncached files
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

      for (const uri of getKnownUris(services)) {
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
