/**
 * Completion Auto-Import
 *
 * Handles searching and suggesting auto-import completions
 * for symbols not yet imported in the current file.
 */

import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from '../../services/index.js';
import { AutoImportCompletionData, buildAutoImportStatement } from './completion-resolve.js';
import { getImportInsertionLine, hasImportStatement } from './completion-qe.js';

export async function addAutoImportCompletions(
  completions: CompletionItem[],
  params: {
    uri: string;
    prefix: string;
    text: string;
    lineText: string;
    localSymbols: PikeSymbol[];
  },
  services: Services
): Promise<void> {
  if (!services.pikeIntrospection) return;

  const prefix = params.prefix.trim();
  if (prefix.length === 0) return;
  if (params.lineText.includes('->') || params.lineText.includes('::')) return;

  const initialLabels = new Set<string>(completions.map(item => item.label));
  for (const symbol of params.localSymbols) {
    if (symbol.name) initialLabels.add(symbol.name);
  }

  const lines = params.text.split('\n');
  const insertionLine = getImportInsertionLine(lines);
  const candidates = await services.pikeIntrospection.searchImportableSymbols(prefix, {
    excludeUri: params.uri,
    limit: 12,
  });

  const sortedCandidates = [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    if (a.importKind !== b.importKind) return a.importKind.localeCompare(b.importKind);
    return a.modulePath.localeCompare(b.modulePath);
  });

  for (const candidate of sortedCandidates) {
    if (!candidate.symbol.toLowerCase().startsWith(prefix.toLowerCase())) continue;
    if (initialLabels.has(candidate.symbol)) continue;
    if (hasImportStatement(lines, candidate.modulePath, candidate.importKind)) continue;

    const statement = buildAutoImportStatement(candidate.modulePath, candidate.importKind);
    completions.push({
      label: candidate.symbol,
      kind:
        candidate.importKind === 'inherit' ? CompletionItemKind.Class : CompletionItemKind.Function,
      detail:
        candidate.importKind === 'inherit'
          ? `Auto-import via inherit from ${candidate.modulePath}`
          : `Auto-import from ${candidate.modulePath}`,
      sortText: `0-auto-${candidate.symbol}-${candidate.modulePath}`,
      data: {
        autoImport: true,
        symbol: candidate.symbol,
        modulePath: candidate.modulePath,
        importKind: candidate.importKind,
      } satisfies AutoImportCompletionData,
      additionalTextEdits: [
        {
          range: {
            start: { line: insertionLine, character: 0 },
            end: { line: insertionLine, character: 0 },
          },
          newText: statement,
        },
      ],
    });
  }
}
