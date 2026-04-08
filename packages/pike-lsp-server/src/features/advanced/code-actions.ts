/**
 * Code Actions Handler
 *
 * Provides quick fixes and refactorings for Pike code.
 *
 * Implements context filtering per LSP 3.19 spec:
 * - Filters returned actions by params.context.only if present
 * - Supports hierarchical kind matching (e.g., 'refactor' matches 'refactor.rewrite')
 * - Returns all applicable actions when filter is empty/undefined
 *
 * KB-1248: Parse-under-edit resilience with error isolation and graceful degradation.
 */

import {
  Connection,
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  TextEdit,
  CancellationToken,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';
import { getGenerateGetterSetterActions } from './getters-setters.js';
import { getExtractMethodAction } from './extract-method.js';
import { RequestScheduler } from '../../services/request-scheduler.js';
import { toSchedulerMetricsLogPayload } from '../utils/scheduler-metrics.js';

interface ImportCandidate {
  modulePath: string;
  importKind: 'import' | 'inherit';
  score: number;
}

interface UnresolvedDiagnosticData {
  kind?: string;
  symbol?: string;
  importCandidates?: ImportCandidate[];
}

function toUnresolvedDiagnosticData(value: unknown): UnresolvedDiagnosticData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const symbol = typeof record['symbol'] === 'string' ? record['symbol'] : undefined;
  const kind = typeof record['kind'] === 'string' ? record['kind'] : undefined;
  const importCandidatesRaw = Array.isArray(record['importCandidates'])
    ? (record['importCandidates'] as unknown[])
    : [];

  const importCandidates: ImportCandidate[] = [];
  for (const entry of importCandidatesRaw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    const modulePath = typeof candidate['modulePath'] === 'string' ? candidate['modulePath'] : null;
    const importKind = candidate['importKind'] === 'inherit' ? 'inherit' : 'import';
    const score = typeof candidate['score'] === 'number' ? candidate['score'] : 0;
    if (!modulePath) {
      continue;
    }
    importCandidates.push({ modulePath, importKind, score });
  }

  const result: UnresolvedDiagnosticData = { importCandidates };
  if (kind !== undefined) {
    result.kind = kind;
  }
  if (symbol !== undefined) {
    result.symbol = symbol;
  }
  return result;
}

function sortImportCandidates(candidates: ImportCandidate[]): ImportCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.importKind !== b.importKind) {
      return a.importKind.localeCompare(b.importKind);
    }
    return a.modulePath.localeCompare(b.modulePath);
  });
}

function getImportInsertionLine(lines: string[]): number {
  let insertionLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? '').trim();
    if (
      trimmed.startsWith('#include ') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('inherit ')
    ) {
      insertionLine = i + 1;
      continue;
    }
    if (trimmed === '') {
      continue;
    }
    break;
  }
  return insertionLine;
}

function buildImportStatement(candidate: ImportCandidate): string {
  return candidate.importKind === 'inherit'
    ? `inherit ${candidate.modulePath};\n`
    : `import ${candidate.modulePath};\n`;
}

function hasImportStatement(lines: string[], candidate: ImportCandidate): boolean {
  const expected =
    candidate.importKind === 'inherit'
      ? `inherit ${candidate.modulePath};`
      : `import ${candidate.modulePath};`;
  return lines.some(line => line.trim() === expected);
}

/**
 * Register code actions handler.
 * KB-1248: Parse-under-edit resilience with snapshot-based queries and error isolation.
 */
export function registerCodeActionsHandler(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
  const log = new Logger('Advanced');

  // KB-1248: Request scheduler for resilient code action requests
  const codeActionsScheduler = new RequestScheduler({ logger: log });
  const CODE_ACTIONS_SCHEDULER_LOG_EVERY = 50;
  let codeActionsRequestsObserved = 0;

  function maybeLogCodeActionsSchedulerMetrics(uri: string, outcome: string): void {
    codeActionsRequestsObserved += 1;
    if (codeActionsRequestsObserved % CODE_ACTIONS_SCHEDULER_LOG_EVERY !== 0) {
      return;
    }

    const schedulerMetrics = codeActionsScheduler.snapshotMetrics();
    log.debug('Code actions scheduler metrics', {
      uri,
      outcome,
      samples: codeActionsRequestsObserved,
      ...toSchedulerMetricsLogPayload(schedulerMetrics),
    });
  }

  /**
   * KB-1248: Wrap introspection call with parse-under-edit resilience.
   * Returns empty results on failure instead of crashing.
   */
  async function searchImportableSymbolsResilient(
    symbol: string,
    options: { excludeUri?: string; limit?: number },
    cancellationToken?: CancellationToken
  ): Promise<Array<{ modulePath: string; importKind: 'import' | 'inherit'; score: number }>> {
    if (!services.pikeIntrospection) {
      return [];
    }

    if (cancellationToken?.isCancellationRequested) {
      return [];
    }

    try {
      const result = await services.pikeIntrospection.searchImportableSymbols(symbol, options);

      if (cancellationToken?.isCancellationRequested) {
        return [];
      }

      return result;
    } catch (err) {
      // KB-1248: Gracefully handle introspection failures during parse-under-edit
      log.debug('Importable symbol search failed (handled gracefully)', {
        symbol,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Code Action handler - provide quick fixes and refactorings
   * KB-1248: Parse-under-edit resilience with graceful error handling
   */
  connection.onCodeAction(
    async (params: CodeActionParams, cancellationToken): Promise<CodeAction[]> => {
      log.debug('Code action request', { uri: params.textDocument.uri });

      // KB-1248: Check cancellation early
      if (cancellationToken?.isCancellationRequested) {
        return [];
      }

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

        // KB-1248: Check cancellation before heavy processing
        if (cancellationToken?.isCancellationRequested) {
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
          const importLines: { line: number; text: string; type: string; moduleName?: string }[] =
            [];
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

          const unusedImports = new Set<number>();
          if (removeUnused) {
            const importModuleNames = importLines
              .filter(imp => imp.moduleName !== undefined)
              .map(imp => imp.moduleName as string);

            if (importModuleNames.length > 0) {
              // Get code after the last import line to find actual symbol references
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

        // CA-010: Handle missing or empty diagnostics gracefully
        const diagnostics = params.context.diagnostics ?? [];
        if (!Array.isArray(diagnostics)) {
          log.warn('Invalid diagnostics array in code action request');
          return [];
        }

        // Quick Fixes - only if filter allows
        if (matchesFilter(CodeActionKind.QuickFix)) {
          for (const diag of diagnostics) {
            if (diag.code !== 'undefined-symbol.unresolved-import') {
              continue;
            }

            const unresolvedData = toUnresolvedDiagnosticData(diag.data);
            if (!unresolvedData?.symbol) {
              continue;
            }

            let candidates = unresolvedData.importCandidates ?? [];
            if (candidates.length === 0 && services.pikeIntrospection) {
              // KB-1248: Use resilient introspection call
              candidates = await searchImportableSymbolsResilient(
                unresolvedData.symbol,
                {
                  excludeUri: uri,
                  limit: 8,
                },
                cancellationToken
              );
            }

            // KB-1248: Check cancellation before processing candidates
            if (cancellationToken?.isCancellationRequested) {
              continue;
            }

            const sortedCandidates = sortImportCandidates(candidates);
            const insertionLine = getImportInsertionLine(lines);

            for (const candidate of sortedCandidates) {
              if (hasImportStatement(lines, candidate)) {
                continue;
              }

              const statement = buildImportStatement(candidate);
              const verb = candidate.importKind === 'inherit' ? 'inherit' : 'import';
              actions.push({
                title: `Add ${verb} for ${unresolvedData.symbol} from ${candidate.modulePath}`,
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
                        newText: statement,
                      },
                    ],
                  },
                },
              });
            }
          }

          for (const diag of diagnostics) {
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

        // KB-1248: Check cancellation before expensive refactoring operations
        if (cancellationToken?.isCancellationRequested) {
          maybeLogCodeActionsSchedulerMetrics(uri, 'cancelled_before_refactor');
          return actions;
        }

        // CA-011: Getter/Setter Generation - pass filter for consistency
        // KB-1248: Wrap in try-catch for resilience
        try {
          const getterSetterActions = getGenerateGetterSetterActions(
            document,
            uri,
            params.range,
            cached.symbols,
            onlyKinds // Pass filter to getter/setter generator
          );
          actions.push(...getterSetterActions);
        } catch (err) {
          // KB-1248: Gracefully handle getter/setter generation failures
          log.debug('Getter/setter generation failed (handled gracefully)', {
            uri,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Extract Method Refactoring
        // KB-1248: Wrap in try-catch for resilience
        try {
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
        } catch (err) {
          // KB-1248: Gracefully handle extract method failures
          log.debug('Extract method generation failed (handled gracefully)', {
            uri,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        maybeLogCodeActionsSchedulerMetrics(uri, actions.length > 0 ? 'success' : 'empty');
        return actions;
      } catch (err) {
        // KB-1248: Log at debug level for parse-under-edit scenarios, error only for unexpected
        const errorMessage = err instanceof Error ? err.message : String(err);
        const isParseError = errorMessage.includes('parse') || errorMessage.includes('syntax');

        if (isParseError) {
          log.debug('Code action failed (parse-under-edit, handled gracefully)', {
            uri: params.textDocument.uri,
            line: params.range.start.line + 1,
            error: errorMessage,
          });
        } else {
          log.error(
            `Code action failed for ${params.textDocument.uri} at line ${params.range.start.line + 1}: ${errorMessage}`
          );
        }

        maybeLogCodeActionsSchedulerMetrics(params.textDocument.uri, 'error');
        return [];
      }
    }
  );
}
