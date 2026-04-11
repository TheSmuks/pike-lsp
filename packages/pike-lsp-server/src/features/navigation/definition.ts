/**
 * Definition Handlers
 *
 * Provides go-to-definition, declaration, and type-definition navigation.
 * Supports module path resolution (Stdio.File) and member access (file->read).
 */

import { Connection, Location } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';
import { extractExpressionAtPosition } from './expression-utils.js';
import { handleDirectiveNavigation } from './definition-directives.js';
import { getWordAtPositionGeneric } from '../utils/pike-identifier.js';
import {
  findSymbolAtPosition,
  findSymbolInIncludedFiles,
  findSymbolInWorkspaceCache,
  findSymbolTextInIncludedFiles,
  findSymbolInDirectIncludes,
} from './definition-symbol-lookup.js';
import { findReferencesForSymbol } from './definition-references.js';
import {
  resolveModulePath,
  resolveMemberAccess,
  resolveModuleMember,
} from './definition-resolution.js';
import { resolveOnDefinitionImport } from './definition-import-resolution.js';
/**
 * Register definition handlers.
 */
export function registerDefinitionHandlers(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
  const log = new Logger('Navigation');

  /**
   * Definition handler - go to symbol definition
   * Supports:
   * - Local symbol navigation
   * - Module path resolution (Stdio.File -> Pike stdlib)
   * - Member access navigation (file->read -> method definition)
   */
  connection.onDefinition(async (params): Promise<Location | Location[] | null> => {
    log.debug('Definition request', { uri: params.textDocument.uri });
    try {
      const uri = params.textDocument.uri;
      const document = documents.get(uri);

      if (!document) {
        return null;
      }

      const cached = documentCache.get(uri);
      if (!cached) {
        return null;
      }

      // Early check: if cursor is on a directive line (#include, import, inherit),
      // handle it directly to avoid expression extraction mangling paths.
      const directiveResult = await handleDirectiveNavigation(
        document,
        params.position,
        uri,
        services,
        cached,
        log
      );
      if (directiveResult) {
        return directiveResult;
      }

      // First, try to extract expression at cursor position
      const expr = extractExpressionAtPosition(document, params.position);
      if (expr) {
        log.debug('Definition: extracted expression', { expression: expr });

        // Try module path resolution first
        if (expr.isModulePath || expr.operator === '.') {
          const moduleLocation = await resolveModulePath(services, expr, document, uri);
          if (moduleLocation) {
            return moduleLocation;
          }
        }

        // Try member access resolution
        if (expr.member && expr.operator === '->') {
          const memberLocation = await resolveMemberAccess(services, expr, cached, uri);
          if (memberLocation) {
            return memberLocation;
          }
        }

        // Try module path with member (Stdio.File->read)
        if (expr.member && expr.operator === '.') {
          const moduleMemberLocation = await resolveModuleMember(services, expr, document);
          if (moduleMemberLocation) {
            return moduleMemberLocation;
          }
        }
      }

      const wordAtCursor = getWordAtPositionGeneric(document, params.position);
      if (wordAtCursor) {
        if (!cached.dependencies && services.includeResolver) {
          try {
            cached.dependencies = await services.includeResolver.resolveDependencies(
              uri,
              cached.symbols || []
            );
          } catch (err) {
            log.debug('Definition: failed to resolve dependencies', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const includedSymbol = findSymbolInIncludedFiles(wordAtCursor, cached, services, log);
        if (includedSymbol) {
          const targetUri = includedSymbol.filePath.startsWith('file://')
            ? includedSymbol.filePath
            : `file://${includedSymbol.filePath}`;
          const line = Math.max(0, (includedSymbol.symbol.position?.line ?? 1) - 1);

          log.debug('Definition: navigating to included symbol', {
            symbolName: wordAtCursor,
            filePath: includedSymbol.filePath,
            line,
          });

          return {
            uri: targetUri,
            range: {
              start: { line, character: 0 },
              end: { line, character: (includedSymbol.symbol.name || '').length },
            },
          };
        }

        const includedTextMatch = await findSymbolTextInIncludedFiles(
          wordAtCursor,
          cached,
          services,
          log
        );
        if (includedTextMatch) {
          return {
            uri: includedTextMatch.filePath.startsWith('file://')
              ? includedTextMatch.filePath
              : `file://${includedTextMatch.filePath}`,
            range: {
              start: { line: includedTextMatch.line, character: includedTextMatch.character },
              end: {
                line: includedTextMatch.line,
                character: includedTextMatch.character + wordAtCursor.length,
              },
            },
          };
        }

        const directIncludeMatch = await findSymbolInDirectIncludes(
          wordAtCursor,
          document,
          uri,
          services,
          log
        );
        if (directIncludeMatch) {
          return {
            uri: directIncludeMatch.filePath.startsWith('file://')
              ? directIncludeMatch.filePath
              : `file://${directIncludeMatch.filePath}`,
            range: {
              start: { line: directIncludeMatch.line, character: directIncludeMatch.character },
              end: {
                line: directIncludeMatch.line,
                character: directIncludeMatch.character + wordAtCursor.length,
              },
            },
          };
        }
      }

      // Fallback to local symbol lookup
      const symbol = findSymbolAtPosition(cached.symbols, params.position, document);

      // If not found locally, search in included files
      if (!symbol || !symbol.position) {
        // Ensure dependencies are resolved (on-demand resolution)
        if (!cached.dependencies && services.includeResolver) {
          try {
            cached.dependencies = await services.includeResolver.resolveDependencies(
              uri,
              cached.symbols || []
            );
          } catch (err) {
            log.debug('Definition: failed to resolve dependencies', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        // Extract the word at cursor position
        const word = getWordAtPositionGeneric(document, params.position);

        if (word) {
          const includedSymbol = findSymbolInIncludedFiles(word, cached, services, log);
          if (includedSymbol) {
            // Found symbol in included file - return its location
            const targetUri = includedSymbol.filePath.startsWith('file://')
              ? includedSymbol.filePath
              : `file://${includedSymbol.filePath}`;
            const line = Math.max(0, (includedSymbol.symbol.position?.line ?? 1) - 1);

            log.debug('Definition: navigating to symbol from included file', {
              symbolName: word,
              filePath: includedSymbol.filePath,
              line,
            });

            return {
              uri: targetUri,
              range: {
                start: { line, character: 0 },
                end: { line, character: (includedSymbol.symbol.name || '').length },
              },
            };
          }

          const workspaceDefinition = findSymbolInWorkspaceCache(word, uri, documentCache);
          if (workspaceDefinition) {
            return workspaceDefinition;
          }
        }

        return null;
      }

      // Check if we're clicking ON the definition itself
      // Pike uses 1-based lines, LSP uses 0-based
      const symbolLine = (symbol.position.line ?? 1) - 1;
      const isOnDefinition = symbolLine === params.position.line;

      if (isOnDefinition) {
        // If this is an import, include, or inherit, navigate to the target module/file
        if (symbol.kind === 'import' || symbol.kind === 'include' || symbol.kind === 'inherit') {
          const importResult = await resolveOnDefinitionImport(
            symbol,
            document,
            uri,
            cached,
            services,
            log
          );
          if (importResult) {
            return importResult;
          }
        }

        // User clicked on a definition - show references instead
        log.debug('Definition: cursor on definition, returning references', {
          symbol: symbol.name,
        });

        const references = findReferencesForSymbol(
          symbol.name,
          uri,
          document,
          cached,
          documentCache,
          documents
        );

        if (references.length > 0) {
          return references;
        }
        // No references found, return null (nothing to show)
        return null;
      }

      // Normal case: return location of symbol definition
      const line = Math.max(0, symbolLine);
      return {
        uri,
        range: {
          start: { line, character: 0 },
          end: { line, character: (symbol.name || symbol.classname || '').length },
        },
      };
    } catch (err) {
      log.error(
        `Definition failed for ${params.textDocument.uri} at line ${params.position.line + 1}, col ${params.position.character}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  });

  /**
   * Declaration handler - navigate to declaration (delegates to definition)
   * For Pike, declaration and definition are the same
   */
  connection.onDeclaration(async (params): Promise<Location | null> => {
    log.debug('Declaration request', { uri: params.textDocument.uri });
    try {
      const uri = params.textDocument.uri;
      const cached = documentCache.get(uri);
      const document = documents.get(uri);

      if (!cached || !document) {
        return null;
      }

      const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
      if (!symbol || !symbol.position) {
        return null;
      }

      const line = Math.max(0, (symbol.position.line ?? 1) - 1);
      return {
        uri,
        range: {
          start: { line, character: 0 },
          end: { line, character: (symbol.name || symbol.classname || '').length },
        },
      };
    } catch (err) {
      log.error(
        `Declaration failed for ${params.textDocument.uri} at line ${params.position.line + 1}, col ${params.position.character}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  });

  /**
   * Type definition handler - navigate to type definition
   * For classes, navigates to the class definition
   */
  connection.onTypeDefinition(async (params): Promise<Location | null> => {
    log.debug('Type definition request', { uri: params.textDocument.uri });
    try {
      const uri = params.textDocument.uri;
      const cached = documentCache.get(uri);
      const document = documents.get(uri);

      if (!cached || !document) {
        return null;
      }

      const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
      if (!symbol) {
        return null;
      }

      // For classes, navigate to the class definition
      if (symbol.kind === 'class' && symbol.position) {
        const line = Math.max(0, (symbol.position.line ?? 1) - 1);
        return {
          uri,
          range: {
            start: { line, character: 0 },
            end: { line, character: (symbol.name || symbol.classname || '').length },
          },
        };
      }

      // For variables/methods with type info, could navigate to type
      // For now, fall back to symbol position
      if (symbol.position) {
        const line = Math.max(0, (symbol.position.line ?? 1) - 1);
        return {
          uri,
          range: {
            start: { line, character: 0 },
            end: { line, character: (symbol.name || symbol.classname || '').length },
          },
        };
      }

      return null;
    } catch (err) {
      log.error(
        `Type definition failed for ${params.textDocument.uri} at line ${params.position.line + 1}, col ${params.position.character}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  });
}
