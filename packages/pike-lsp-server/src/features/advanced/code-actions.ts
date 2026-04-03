/**
 * Code Actions Handler
 *
 * Provides quick fixes and refactorings for Pike code.
 *
 * Implements context filtering per LSP 3.19 spec:
 * - Filters returned actions by params.context.only if present
 * - Supports hierarchical kind matching (e.g., 'refactor' matches 'refactor.rewrite')
 * - Returns all applicable actions when filter is empty/undefined
 */

import { Connection, CodeAction, CodeActionKind, TextEdit } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';
import { getGenerateGetterSetterActions } from './getters-setters.js';
import { getExtractMethodAction } from './extract-method.js';

interface UnresolvedSymbolDiagnosticData {
  kind: 'unresolved-symbol';
  symbolName: string;
}

function asUnresolvedSymbolDiagnosticData(data: unknown): UnresolvedSymbolDiagnosticData | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const unresolved = data as Partial<UnresolvedSymbolDiagnosticData>;
  if (unresolved.kind !== 'unresolved-symbol') {
    return null;
  }

  if (!unresolved.symbolName || typeof unresolved.symbolName !== 'string') {
    return null;
  }

  return {
    kind: 'unresolved-symbol',
    symbolName: unresolved.symbolName,
  };
}

function findUnresolvedSymbolName(diag: { message: string; data?: unknown }): string | null {
  const data = asUnresolvedSymbolDiagnosticData(diag.data);
  if (data) {
    return data.symbolName;
  }

  const match = diag.message.match(/Undefined symbol:\s*'([^']+)'/);
  return match?.[1] ?? null;
}

function findImportInsertionLine(lines: string[], importKind: 'import' | 'inherit'): number {
  const includeLines: number[] = [];
  const importLines: number[] = [];
  const inheritLines: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? '').trim();
    if (trimmed.startsWith('#include ')) {
      includeLines.push(i);
      continue;
    }
    if (trimmed.startsWith('import ')) {
      importLines.push(i);
      continue;
    }
    if (trimmed.startsWith('inherit ')) {
      inheritLines.push(i);
    }
  }

  if (importKind === 'import') {
    if (importLines.length > 0) {
      return importLines[importLines.length - 1]! + 1;
    }
    if (includeLines.length > 0) {
      return includeLines[includeLines.length - 1]! + 1;
    }
    if (inheritLines.length > 0) {
      return inheritLines[0]!;
    }
    return 0;
  }

  if (inheritLines.length > 0) {
    return inheritLines[inheritLines.length - 1]! + 1;
  }
  if (importLines.length > 0) {
    return importLines[importLines.length - 1]! + 1;
  }
  if (includeLines.length > 0) {
    return includeLines[includeLines.length - 1]! + 1;
  }
  return 0;
}

/**
 * Register code actions handler.
 */
export function registerCodeActionsHandler(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
  const log = new Logger('Advanced');

  /**
   * Code Action handler - provide quick fixes and refactorings
   */
  connection.onCodeAction((params): CodeAction[] => {
    log.debug('Code action request', { uri: params.textDocument.uri });
    try {
      const uri = params.textDocument.uri;

      // CA-006, CA-007: Validate URI
      if (!uri || typeof uri !== 'string' || uri.length === 0) {
        log.warn('Invalid URI in code action request', { uri });
        return [];
      }

      const document = documents.get(uri);
      const cached = documentCache.get(uri);

      if (!document || !cached) {
        return [];
      }

      // Filter by context.only if client specified kinds
      const onlyKinds = params.context.only;
      const filterByKind = onlyKinds && onlyKinds.length > 0;

      /**
       * Check if a CodeAction kind matches the filter.
       * Supports hierarchical matching: 'refactor' matches 'refactor.extract' and 'refactor.rewrite'.
       */
      const matchesFilter = (kind: string): boolean => {
        if (!filterByKind) return true;
        return onlyKinds.some(only => {
          // Exact match OR kind is a sub-kind of only (e.g., refactor.rewrite is a sub-kind of refactor)
          return kind === only || kind.startsWith(only + '.');
        });
      };

      const actions: CodeAction[] = [];
      const text = document.getText();
      const lines = text.split('\n');

      // CA-008, CA-009: Validate and clamp range bounds
      const startLine = params.range.start.line;
      if (startLine < 0 || startLine >= lines.length) {
        log.debug('Range start line out of bounds, clamping', {
          startLine,
          maxLine: lines.length - 1,
        });
        // Continue - will just return empty actions if nothing matches
      }
      // Organize Imports - only if filter allows
      if (matchesFilter(CodeActionKind.SourceOrganizeImports)) {
        const removeUnused = services.globalSettings.organizeImports?.removeUnused ?? true;
        const importLines: { line: number; text: string; type: string; moduleName?: string }[] = [];
        for (let i = 0; i < lines.length; i++) {
          const lt = (lines[i] ?? '').trim();
          if (lt.startsWith('inherit ')) {
            const match = lt.match(/^inherit\s+([A-Za-z_][A-Za-z0-9_]*)/);
            const entry: { line: number; text: string; type: string; moduleName?: string } = {
              line: i,
              text: lines[i] ?? '',
              type: 'inherit',
            };
            if (match?.[1]) entry.moduleName = match[1];
            importLines.push(entry);
          } else if (lt.startsWith('import ')) {
            const match = lt.match(
              /^import\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)/
            );
            const entry: { line: number; text: string; type: string; moduleName?: string } = {
              line: i,
              text: lines[i] ?? '',
              type: 'import',
            };
            if (match?.[1]) entry.moduleName = match[1];
            importLines.push(entry);
          } else if (lt.startsWith('#include ')) {
            importLines.push({ line: i, text: lines[i] ?? '', type: 'include' });
          }
        }

        if (importLines.length > 0) {
          const unusedImports = new Set<number>();
          if (removeUnused) {
            const importModuleNames = importLines
              .filter(imp => imp.moduleName !== undefined)
              .map(imp => imp.moduleName as string);

            if (importModuleNames.length > 0) {
              const lastImportLine = importLines[importLines.length - 1]!.line;
              const codeOnlyLines = lines.slice(lastImportLine + 1).join('\n');
              const allReferences = codeOnlyLines.match(/\b([A-Z][A-Za-z0-9_]*)\b/g) || [];
              const referenceSet = new Set(allReferences);

              for (const imp of importLines) {
                const moduleName = imp.moduleName;
                if (moduleName !== undefined && !referenceSet.has(moduleName)) {
                  unusedImports.add(imp.line);
                }
              }
            }
          }

          const usedImportLines = importLines.filter(imp => !unusedImports.has(imp.line));

          if (importLines.length > 1 || unusedImports.size > 0) {
            const sorted = [...usedImportLines].sort((a, b) => {
              const typeOrder = { include: 0, import: 1, inherit: 2 };
              const typeA = typeOrder[a.type as keyof typeof typeOrder] ?? 3;
              const typeB = typeOrder[b.type as keyof typeof typeOrder] ?? 3;
              if (typeA !== typeB) return typeA - typeB;
              return a.text.localeCompare(b.text);
            });

            const needsSort = importLines.some((item, i) => item.text !== sorted[i]?.text);
            const hasRemovals = unusedImports.size > 0;

            if (needsSort || hasRemovals) {
              const edits: TextEdit[] = [];

              for (const unusedLine of unusedImports) {
                const imp = importLines.find(i => i.line === unusedLine);
                if (imp) {
                  edits.push({
                    range: {
                      start: { line: imp.line, character: 0 },
                      end: { line: imp.line, character: imp.text.length },
                    },
                    newText: '',
                  });
                }
              }

              for (let i = 0; i < usedImportLines.length; i++) {
                const original = usedImportLines[i];
                const replacement = sorted[i];
                if (original && replacement && original.text !== replacement.text) {
                  edits.push({
                    range: {
                      start: { line: original.line, character: 0 },
                      end: { line: original.line, character: original.text.length },
                    },
                    newText: replacement.text,
                  });
                }
              }

              if (edits.length > 0) {
                actions.push({
                  title: 'Organize Imports',
                  kind: CodeActionKind.SourceOrganizeImports,
                  edit: {
                    changes: {
                      [uri]: edits,
                    },
                  },
                });
              }
            }
          }
        }
      }

      // CA-010: Handle missing or empty diagnostics gracefully
      const diagnostics = params.context.diagnostics ?? [];
      if (!Array.isArray(diagnostics)) {
        log.warn('Invalid diagnostics array in code action request');
        return [];
      }

      // Quick Fixes - only if filter allows
      if (matchesFilter(CodeActionKind.QuickFix)) {
        for (const diag of diagnostics) {
          const unresolvedSymbol = findUnresolvedSymbolName(diag);
          if (unresolvedSymbol) {
            const candidates = services.workspaceIndex.searchImportableSymbols(
              unresolvedSymbol,
              uri,
              8
            );
            const exactCandidates = candidates.filter(
              c => c.name.toLowerCase() === unresolvedSymbol.toLowerCase()
            );

            for (const candidate of exactCandidates) {
              const insertionLine = findImportInsertionLine(lines, candidate.importKind);
              const hasExistingStatement = lines.some(
                line => line.trim() === candidate.statement.trim()
              );
              if (hasExistingStatement) {
                continue;
              }

              const titlePrefix =
                candidate.importKind === 'inherit' ? 'Add inherit for' : 'Add import for';
              const sourceSuffix = `(${candidate.sourcePath})`;

              actions.push({
                title: `${titlePrefix} ${candidate.name} ${sourceSuffix}`,
                kind: CodeActionKind.QuickFix,
                diagnostics: [diag],
                edit: {
                  changes: {
                    [uri]: [
                      {
                        range: {
                          start: { line: insertionLine, character: 0 },
                          end: { line: insertionLine, character: 0 },
                        },
                        newText: `${candidate.statement}\n`,
                      },
                    ],
                  },
                },
              });
            }
          }

          if (diag.message.includes('syntax error') || diag.message.includes('expected')) {
            const diagLine = lines[diag.range.start.line] ?? '';
            if (
              !diagLine.trim().endsWith(';') &&
              !diagLine.trim().endsWith('{') &&
              !diagLine.trim().endsWith('}')
            ) {
              actions.push({
                title: 'Add missing semicolon',
                kind: CodeActionKind.QuickFix,
                diagnostics: [diag],
                edit: {
                  changes: {
                    [uri]: [
                      {
                        range: {
                          start: { line: diag.range.start.line, character: diagLine.length },
                          end: { line: diag.range.start.line, character: diagLine.length },
                        },
                        newText: ';',
                      },
                    ],
                  },
                },
              });
            }
          }
        }
      }

      // CA-011: Getter/Setter Generation - pass filter for consistency
      const getterSetterActions = getGenerateGetterSetterActions(
        document,
        uri,
        params.range,
        cached.symbols,
        onlyKinds // Pass filter to getter/setter generator
      );
      actions.push(...getterSetterActions);

      // Extract Method Refactoring
      const extractMethodAction = getExtractMethodAction(
        document,
        uri,
        params.range,
        text,
        onlyKinds // Pass filter for consistency
      );
      if (extractMethodAction) {
        actions.push(extractMethodAction);
      }

      return actions;
    } catch (err) {
      log.error(
        `Code action failed for ${params.textDocument.uri} at line ${params.range.start.line + 1}: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  });
}
