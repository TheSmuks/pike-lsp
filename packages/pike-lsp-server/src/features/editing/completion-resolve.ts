/**
 * Completion Resolve Handler
 *
 * Handles onCompletionResolve — adds documentation and additionalTextEdits
 * for auto-import completions.
 */

import { CompletionItem, MarkupKind } from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from '../../services/index.js';
import { buildHoverContent } from '../utils/hover-builder.js';

export interface AutoImportCompletionData {
  autoImport: true;
  symbol: string;
  modulePath: string;
  importKind: 'import' | 'inherit';
}

export function buildAutoImportStatement(
  modulePath: string,
  importKind: 'import' | 'inherit'
): string {
  return importKind === 'inherit' ? `inherit ${modulePath};\n` : `import ${modulePath};\n`;
}

/**
 * Register the completion resolve handler on the connection.
 */
export function registerCompletionResolveHandler(
  connection: import('vscode-languageserver/node.js').Connection,
  services: Services
): void {
  const { logger, documentCache } = services;

  connection.onCompletionResolve(async (item): Promise<CompletionItem> => {
    const data = item.data as
      | { uri?: string; name?: string }
      | { modulePath?: string; name?: string; isStdlib?: boolean }
      | AutoImportCompletionData
      | undefined;

    // Handle auto-import resolution
    if (data && 'autoImport' in data && data.autoImport) {
      if (!item.additionalTextEdits || item.additionalTextEdits.length === 0) {
        const statement = buildAutoImportStatement(data.modulePath, data.importKind);
        item.additionalTextEdits = [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
            newText: statement,
          },
        ];
      }
      return item;
    }

    // Handle local symbol resolution
    if (data && 'uri' in data && data.uri && data.name) {
      const cached = documentCache.get(data.uri);
      if (cached) {
        const symbol = cached.symbols.find(s => s.name === data.name);
        if (symbol) {
          item.documentation = {
            kind: MarkupKind.Markdown,
            value: buildHoverContent(symbol) ?? '',
          };
        }
      }
      return item;
    }

    // Handle import symbol resolution
    if (
      data &&
      'modulePath' in data &&
      data.modulePath &&
      'name' in data &&
      typeof data.name === 'string'
    ) {
      const modulePath = data.modulePath;
      const symbolName = data.name;
      const isStdlib = 'isStdlib' in data ? (data.isStdlib ?? true) : true;

      if (services.stdlibIndex && isStdlib) {
        try {
          const moduleInfo = await services.stdlibIndex.getModule(modulePath);
          if (moduleInfo?.symbols) {
            const symbol = moduleInfo.symbols.get(symbolName);
            if (symbol) {
              item.documentation = {
                kind: MarkupKind.Markdown,
                value: buildHoverContent(symbol as PikeSymbol, modulePath) ?? '',
              };
            }
          }
        } catch (err) {
          logger.debug('Failed to get symbol for completion resolve', {
            modulePath,
            symbolName,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const importStatement = isStdlib ? `import ${modulePath};\n` : `import .${modulePath};\n`;

      item.additionalTextEdits = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          newText: importStatement,
        },
      ];
    }

    return item;
  });
}
