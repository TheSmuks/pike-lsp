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
  findSymbolInDirectIncludes,
  findSymbolInWorkspaceCache,
} from './definition-symbol-lookup.js';
import type { IncludeSymbolMatch } from './definition-symbol-lookup.js';
import { findReferencesForSymbol } from './definition-references.js';
import {
  resolveModulePath,
  resolveMemberAccess,
  resolveModuleMember,
} from './definition-resolution.js';
import { resolveOnDefinitionImport } from './definition-import-resolution.js';

/**
 * Convert an include match to an LSP Location.
 */
function includeMatchToLocation(match: IncludeSymbolMatch): Location {
  const uri = match.filePath.startsWith('file://') ? match.filePath : `file://${match.filePath}`;
  return {
    uri,
    range: {
      start: { line: match.line, character: match.character },
      end: { line: match.line, character: match.character + match.nameLength },
    },
  };
}

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
   * Resolve include dependencies on-demand if not yet cached.
   * Deduplicated from the two original call sites in onDefinition.
   */
  async function ensureDependenciesResolved(
    uri: string,
    cached: NonNullable<ReturnType<typeof documentCache.get>>
  ): Promise<void> {
    if (cached.dependencies || !services.includeResolver) {
      return;
    }
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
        // Resolve include dependencies on-demand if not yet cached
        await ensureDependenciesResolved(uri, cached);

        // Search include dependencies for the symbol (cache first, then on-demand)
        const includeMatch = await findSymbolInDirectIncludes(wordAtCursor, uri, services, log);
        if (includeMatch) {
          log.debug('Definition: navigating to included symbol', {
            symbolName: wordAtCursor,
            filePath: includeMatch.filePath,
            line: includeMatch.line,
          });
          return includeMatchToLocation(includeMatch);
        }

        // Fallback: search full workspace cache
        const workspaceDefinition = findSymbolInWorkspaceCache(wordAtCursor, uri, documentCache);
        if (workspaceDefinition) {
          return workspaceDefinition;
        }
      }

      // Fallback to local symbol lookup
      const symbol = findSymbolAtPosition(cached.symbols, params.position, document);

      if (!symbol || !symbol.position) {
        // wordAtCursor + include/workspace search was already performed above.
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
