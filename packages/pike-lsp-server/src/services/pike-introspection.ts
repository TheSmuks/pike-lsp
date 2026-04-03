import type { StdlibIndexManager } from '../stdlib-index.js';
import type { WorkspaceIndex, ImportableSymbolSearchResult } from '../workspace-index.js';

export interface ImportableSymbolCandidate {
  symbol: string;
  modulePath: string;
  importKind: 'import' | 'inherit';
  score: number;
  source: 'workspace-index' | 'stdlib-index';
}

const DEFAULT_STDLIB_MODULES = [
  'Parser',
  'Parser.Pike',
  'Stdio',
  'String',
  'Array',
  'Math',
] as const;

export class PikeIntrospectionService {
  constructor(
    private readonly workspaceIndex: WorkspaceIndex,
    private readonly stdlibIndex: StdlibIndexManager | null
  ) {}

  async searchImportableSymbols(
    symbol: string,
    options: { excludeUri?: string; limit?: number } = {}
  ): Promise<ImportableSymbolCandidate[]> {
    const query = symbol.trim();
    if (!query) {
      return [];
    }

    const workspaceCandidates = this.workspaceIndex.searchImportableSymbols(query, options);
    const stdlibCandidates = await this.searchStdlibCandidates(query);
    const merged = this.mergeCandidates(workspaceCandidates, stdlibCandidates);

    const limit = Math.max(1, options.limit ?? 20);
    return merged.slice(0, limit);
  }

  private async searchStdlibCandidates(query: string): Promise<ImportableSymbolCandidate[]> {
    if (!this.stdlibIndex) {
      return [];
    }

    const queryLower = query.toLowerCase();
    const candidates: ImportableSymbolCandidate[] = [];

    for (const modulePath of DEFAULT_STDLIB_MODULES) {
      const moduleInfo = await this.stdlibIndex.getModule(modulePath);
      if (!moduleInfo?.symbols) {
        continue;
      }

      for (const [name, symbolInfo] of moduleInfo.symbols) {
        if (!name.toLowerCase().startsWith(queryLower)) {
          continue;
        }

        const importKind: 'import' | 'inherit' = symbolInfo.kind === 'class' ? 'inherit' : 'import';
        const exactBoost = name.toLowerCase() === queryLower ? 130 : 0;
        const kindBoost = importKind === 'inherit' ? 15 : 10;

        candidates.push({
          symbol: name,
          modulePath,
          importKind,
          score: exactBoost + kindBoost + Math.max(0, 60 - modulePath.length),
          source: 'stdlib-index',
        });
      }
    }

    return candidates;
  }

  private mergeCandidates(
    workspaceCandidates: ImportableSymbolSearchResult[],
    stdlibCandidates: ImportableSymbolCandidate[]
  ): ImportableSymbolCandidate[] {
    const merged = [...workspaceCandidates, ...stdlibCandidates];
    const deduped = new Map<string, ImportableSymbolCandidate>();

    for (const candidate of merged) {
      const key = `${candidate.symbol}:${candidate.modulePath}:${candidate.importKind}`;
      const existing = deduped.get(key);
      if (!existing || candidate.score > existing.score) {
        deduped.set(key, candidate);
      }
    }

    return [...deduped.values()].sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.symbol !== b.symbol) {
        return a.symbol.localeCompare(b.symbol);
      }
      if (a.modulePath !== b.modulePath) {
        return a.modulePath.localeCompare(b.modulePath);
      }
      return a.importKind.localeCompare(b.importKind);
    });
  }
}
