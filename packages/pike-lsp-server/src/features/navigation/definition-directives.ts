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

  // Handle #include directives — use cached symbols or bridge.extractImports instead of regex
  if (lineText.startsWith('#include') && services.bridge?.bridge) {
    let includePath: string | undefined;

    // Try cached symbols first (already parsed by Parser.Pike)
    if (cached.symbols) {
      const includeSymbol = cached.symbols.find(
        s => s.kind === 'include' && s.position && s.position.line - 1 === position.line
      );
      if (includeSymbol) {
        includePath = includeSymbol.classname || includeSymbol.name;
      }
    }

    // Fall back to bridge.extractImports for a fresh parse
    if (!includePath) {
      try {
        const imports = await services.bridge.bridge.extractImports(document.getText(), filePath);
        const lineInclude = imports.imports.find(
          imp => imp.type === 'include' && imp.line - 1 === position.line
        );
        includePath = lineInclude?.path;
      } catch (err) {
        log.debug('Definition: failed to extract imports', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (includePath) {
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
    }

    return null;
  }

  // Handle import statements — use bridge.extractImports instead of regex
  if (lineText.startsWith('import ') && services.bridge?.bridge) {
    let importPath: string | undefined;

    // Try bridge.extractImports for a fresh parse
    try {
      const imports = await services.bridge.bridge.extractImports(document.getText(), filePath);
      const lineImport = imports.imports.find(
        imp => imp.type === 'import' && imp.line - 1 === position.line
      );
      importPath = lineImport?.path;
    } catch (err) {
      log.debug('Definition: failed to extract imports for import', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (!importPath) {
      // Simple string extraction: strip 'import ' prefix, take up to ';'
      const trimmed = lineText.slice(7).trim();
      const semiIdx = trimmed.indexOf(';');
      importPath = (semiIdx >= 0 ? trimmed.slice(0, semiIdx) : trimmed).trim();
    }

    if (importPath) {
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
    }
    return null;
  }

  // Handle inherit statements — use bridge.extractImports instead of regex
  if (lineText.startsWith('inherit ')) {
    let inheritPath: string | undefined;

    // Try bridge.extractImports for a fresh parse
    if (services.bridge?.bridge) {
      try {
        const imports = await services.bridge.bridge.extractImports(document.getText(), filePath);
        const lineInherit = imports.imports.find(
          imp => imp.type === 'inherit' && imp.line - 1 === position.line
        );
        inheritPath = lineInherit?.path;
      } catch (err) {
        log.debug('Definition: failed to extract imports for inherit', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!inheritPath) {
      // Simple string extraction: strip 'inherit ' prefix, remove quotes/whitespace
      const trimmed = lineText.slice(8).trim();
      // Take up to first ; or :
      let end = trimmed.length;
      for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (ch === ';' || ch === ':') {
          end = i;
          break;
        }
      }
      inheritPath = trimmed.slice(0, end).replace(/"/g, '').trim();
    }

    log.debug('Definition: directive inherit navigation', { inheritPath });

    // Check cached inherits first (works even without bridge)
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

    // Fall back to bridge resolution
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

  // Handle #require directives — use bridge.extractImports instead of regex
  if (lineText.startsWith('#require ') && services.bridge?.bridge) {
    let feature: string | undefined;

    // Try bridge.extractImports first
    try {
      const imports = await services.bridge.bridge.extractImports(document.getText(), filePath);
      const lineRequire = imports.imports.find(
        imp => imp.type === 'require' && imp.line - 1 === position.line
      );
      feature = lineRequire?.path;
    } catch (err) {
      log.debug('Definition: failed to extract imports for require', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (!feature) {
      // Simple string extraction: strip '#require ' prefix, trim delimiters
      const trimmed = lineText.slice(9).trim();
      let end = trimmed.length;
      for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (ch === '"' || ch === '>' || ch === ';') {
          end = i;
          break;
        }
      }
      feature = trimmed.slice(0, end).trim();
    }

    if (feature) {
      log.debug('Definition: directive require (no navigation)', { feature });
    }
    // #require doesn't point to a file, no navigation
    return null;
  }

  // Not a directive line
  return null;
}
