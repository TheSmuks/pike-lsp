/**
 * Import/Inherit Resolution for On-Definition Navigation
 *
 * When the cursor is ON a definition (import, include, or inherit symbol),
 * resolves the target module path through introspection, bridge resolution,
 * stdlib index, and import-qualified paths.
 * Extracted from definition.ts for maintainability.
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Location } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { DocumentCacheEntry } from '../../core/types.js';
import type { PikeSymbol, InheritanceInfo } from '@pike-lsp/pike-bridge';
import { Logger } from '@pike-lsp/core';
import { uriToFsPath } from '../../utils/uri-path.js';

/**
 * Resolve navigation target when cursor is on an import/include/inherit definition.
 * Tries multiple strategies in order: introspection, include/require resolution,
 * relative paths, inherit-via-import, and stdlib index fallback.
 */
export async function resolveOnDefinitionImport(
  symbol: PikeSymbol,
  document: TextDocument,
  uri: string,
  cached: DocumentCacheEntry,
  services: Services,
  log: Logger
): Promise<Location | null> {
  // Use classname if available (usually contains the module path), otherwise name
  const modulePath = symbol.classname || symbol.name;
  if (!modulePath) {
    return null;
  }

  log.debug('Definition: navigating to import/inherit target', { modulePath });

  // Use introspection data for inherits if available
  // This handles macros and complex resolutions performed by the Pike compiler
  if (symbol.kind === 'inherit' && cached.inherits) {
    const normalizedPath = modulePath.replace(/['"]/g, '');
    const foundInherit = cached.inherits.find(
      (h: InheritanceInfo) =>
        h.source_name === normalizedPath ||
        h.path === normalizedPath ||
        h.label === normalizedPath ||
        (h.source_name && h.source_name.replace(/['"]/g, '') === normalizedPath)
    );

    if (foundInherit && foundInherit.path) {
      log.debug('Definition: resolved inherit from introspection', {
        modulePath,
        resolvedPath: foundInherit.path,
      });

      const targetUri = foundInherit.path.startsWith('file://')
        ? foundInherit.path
        : `file://${foundInherit.path}`;

      return {
        uri: targetUri,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
      };
    }
  }

  // Check if this is a #include statement by looking at the actual source code
  // The parser strips quotes from the path, so we check the source line directly
  const symbolLine = ((symbol.position?.line ?? 1) || 1) - 1; // Convert to 0-based
  const lineText = document
    .getText({
      start: { line: symbolLine, character: 0 },
      end: { line: symbolLine + 1, character: 0 },
    })
    .trim();
  const isIncludeDirective =
    lineText.startsWith('#include') ||
    lineText.startsWith('#if') ||
    lineText.startsWith('#else') ||
    lineText.startsWith('#elif') ||
    lineText.startsWith('#endif');

  const isRequireDirective = lineText.startsWith('#require');

  if (isIncludeDirective && services.bridge?.bridge) {
    // Use resolveInclude for #include directives
    try {
      const includeResult = await services.bridge.bridge.resolveInclude(
        modulePath,
        uriToFsPath(uri)
      );

      if (includeResult.exists && includeResult.path) {
        const targetUri = includeResult.path.startsWith('file://')
          ? includeResult.path
          : `file://${includeResult.path}`;

        log.debug('Definition: resolved include path', {
          originalPath: includeResult.originalPath,
          resolvedPath: includeResult.path,
        });

        return {
          uri: targetUri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
        };
      }
    } catch (err) {
      log.debug('Definition: failed to resolve include path', {
        modulePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Handle #require directives using resolveImport
  if (isRequireDirective && services.bridge?.bridge) {
    try {
      // Use resolveImport for #require directives
      // The PikeBridge's resolveImport method handles both string literals
      // and constant identifiers, returning appropriate results
      const requireResult = await services.bridge.bridge.resolveImport(
        'require',
        modulePath,
        uriToFsPath(uri)
      );

      if (requireResult.exists === 1 && requireResult.path) {
        const targetUri = requireResult.path.startsWith('file://')
          ? requireResult.path
          : `file://${requireResult.path}`;

        log.debug('Definition: resolved require path', {
          modulePath,
          resolvedPath: requireResult.path,
        });

        return {
          uri: targetUri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
        };
      } else {
        log.debug('Definition: #require target not found', {
          modulePath,
          error: requireResult.error,
        });
      }
    } catch (err) {
      log.debug('Definition: failed to resolve require path', {
        modulePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Handle relative import paths (starting with .)
  if (modulePath.startsWith('.') && services.bridge?.bridge) {
    try {
      const relativeResult = await services.bridge.bridge.resolveInclude(
        modulePath,
        uriToFsPath(uri)
      );

      if (relativeResult.exists && relativeResult.path) {
        const targetUri = relativeResult.path.startsWith('file://')
          ? relativeResult.path
          : `file://${relativeResult.path}`;

        log.debug('Definition: resolved relative import path', {
          modulePath,
          resolvedPath: relativeResult.path,
        });

        return {
          uri: targetUri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
        };
      }
    } catch (err) {
      log.debug('Definition: failed to resolve relative path', {
        modulePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // For inherit statements, try resolving with ALL import paths (order-independent)
  if (symbol.kind === 'inherit') {
    // Get ALL imports in the file, not just prior ones (fixes Gap 2)
    const allImports = cached.symbols.filter((s: PikeSymbol) => s.kind === 'import');

    for (const importSymbol of allImports) {
      const importPath = importSymbol.classname || importSymbol.name;
      if (importPath && importPath !== modulePath) {
        const qualifiedPath = `${importPath}.${modulePath}`;

        const moduleInfo = await services.stdlibIndex?.getModule(qualifiedPath);
        if (moduleInfo && moduleInfo.resolvedPath) {
          const targetUri = moduleInfo.resolvedPath.startsWith('file://')
            ? moduleInfo.resolvedPath
            : `file://${moduleInfo.resolvedPath}`;

          log.debug('Definition: resolved inherit via import', {
            qualifiedPath,
            resolvedPath: moduleInfo.resolvedPath,
          });

          return {
            uri: targetUri,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
          };
        }

        if (services.bridge?.bridge) {
          try {
            const bridgeResult = await services.bridge.bridge.resolveInclude(
              qualifiedPath,
              uriToFsPath(uri)
            );

            if (bridgeResult.exists && bridgeResult.path) {
              const targetUri = bridgeResult.path.startsWith('file://')
                ? bridgeResult.path
                : `file://${bridgeResult.path}`;

              log.debug('Definition: resolved inherit via bridge', {
                qualifiedPath,
                resolvedPath: bridgeResult.path,
              });

              return {
                uri: targetUri,
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 0 },
                },
              };
            }
          } catch (err) {
            log.debug('Definition: bridge resolve failed for inherit', {
              qualifiedPath,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }
  }

  // Fall back to stdlib index for import/inherit statements
  const moduleInfo = await services.stdlibIndex?.getModule(modulePath);

  if (moduleInfo && moduleInfo.resolvedPath) {
    const targetUri = moduleInfo.resolvedPath.startsWith('file://')
      ? moduleInfo.resolvedPath
      : `file://${moduleInfo.resolvedPath}`;

    return {
      uri: targetUri,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
    };
  }

  return null;
}
