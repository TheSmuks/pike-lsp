/**
 * Directive Navigation
 *
 * Handles go-to-definition for Pike directives:
 * - #include "file.h"
 * - import Module;
 * - inherit "module";
 * - #require feature
 *
 * Extracted from definition.ts for maintainability.
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Location } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { DocumentCacheEntry } from '../../core/types.js';
import type { Logger } from '@pike-lsp/core';
import { uriToFsPath } from '../../utils/uri-path.js';

/**
 * Handle go-to-definition for directive lines (#include, import, inherit, #require).
 * Returns a Location or null if cursor is not on a directive.
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

  const filePath = uriToFsPath(uri);

  // Handle #include directives
  const includeMatch = lineText.match(/^#include\s+["<]([^">]+)[">]/);
  if (includeMatch && services.bridge?.bridge) {
    const includePath = includeMatch[1] ?? '';
    log.debug('Definition: directive include navigation', { includePath });

    try {
      const result = await services.bridge.bridge.resolveInclude(includePath, filePath);
      if (result.exists && result.path) {
        return {
          uri: `file://${result.path}`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        };
      }
    } catch (err) {
      log.debug('Definition: include resolution failed', {
        includePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return null;
  }

  // Handle import statements
  const importMatch = lineText.match(/^import\s+([^;]+)/);
  if (importMatch && services.bridge?.bridge) {
    const importPath = (importMatch[1] ?? '').trim();
    log.debug('Definition: directive import navigation', { importPath });

    // Check cached dependencies first
    if (cached.dependencies?.imports) {
      for (const imp of cached.dependencies.imports) {
        if (imp.modulePath === importPath || imp.modulePath.endsWith('/' + importPath)) {
          if (imp.resolvedPath) {
            return {
              uri: `file://${imp.resolvedPath}`,
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            };
          }
        }
      }
    }

    // Fall back to bridge resolution
    try {
      const result = await services.bridge.bridge.resolveImport('import', importPath, filePath);
      if (result.exists && result.path) {
        return {
          uri: `file://${result.path}`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        };
      }
    } catch (err) {
      log.debug('Definition: import resolution failed', {
        importPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return null;
  }

  // Handle inherit statements
  const inheritMatch = lineText.match(/^inherit\s+([^;:]+)/);
  if (inheritMatch) {
    const inheritPath = (inheritMatch[1] ?? '').trim().replace(/["\s]/g, '');
    log.debug('Definition: directive inherit navigation', { inheritPath });

    // Check cached inherits first
    if (cached.inherits) {
      for (const inh of cached.inherits) {
        if (inh.source_name === inheritPath || inh.path === inheritPath) {
          if (inh.path) {
            return {
              uri: `file://${inh.path}`,
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            };
          }
        }
      }
    }

    // Fall back to bridge resolution if available
    if (services.bridge?.bridge) {
      try {
        const result = await services.bridge.bridge.resolveImport('inherit', inheritPath, filePath);
        if (result.exists && result.path) {
          return {
            uri: `file://${result.path}`,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          };
        }
      } catch (err) {
        log.debug('Definition: inherit resolution failed', {
          inheritPath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return null;
  }

  // Handle #require directives
  const requireMatch = lineText.match(/^#require\s+["<]?([^">;]+)/);
  if (requireMatch) {
    log.debug('Definition: directive require (no navigation)', {
      feature: requireMatch[1],
    });
    // #require doesn't point to a file, no navigation
    return null;
  }

  // Not a directive line
  return null;
}
