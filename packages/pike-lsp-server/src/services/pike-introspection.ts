import type { InheritanceInfo, IntrospectedSymbol, PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from './index.js';
import type { StdlibIndexManager } from '../stdlib-index.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import { readFile } from 'node:fs/promises';

import { LRUCache } from '../utils/lru-cache.js';
import { uriToFsPath } from '../utils/uri-path.js';

export interface InheritRelation {
  uri: string;
  ownerClass: string;
  ownerLine: number;
  inheritedName: string;
  inheritedPath?: string;
}

export interface ImportableSymbolCandidate {
  symbol: string;
  modulePath: string;
  importKind: 'import' | 'inherit';
  score: number;
  source: 'workspace-index' | 'stdlib-index';
}

interface CachedIntrospectionDocument {
  symbols: PikeSymbol[];
  relations: InheritRelation[];
  introspectedSymbols: IntrospectedSymbol[];
  versionKey: string;
}

export class PikeIntrospectionService {
  private readonly cache = new LRUCache<string, CachedIntrospectionDocument>(200);

  /** Cached symbol lists per stdlib module, populated on first search. */
  private stdlibSymbolCache = new LRUCache<string, Map<string, IntrospectedSymbol>>(100);

  constructor(
    private readonly services: Services,
    private readonly workspaceIndex?: WorkspaceIndex,
    private readonly stdlibIndex?: StdlibIndexManager | null
  ) {}

  // === P0 Methods for hierarchy/implementation ===

  async getSymbols(uri: string): Promise<PikeSymbol[]> {
    const doc = await this.getDocument(uri);
    return doc.symbols;
  }

  async getInherits(uri: string): Promise<InheritRelation[]> {
    const doc = await this.getDocument(uri);
    return doc.relations;
  }

  async getMethodSignature(symbolName: string, uri: string): Promise<string | null> {
    const doc = await this.getDocument(uri);
    const match = doc.introspectedSymbols.find(
      symbol => symbol.kind === 'function' && symbol.name === symbolName
    );
    if (!match) {
      return null;
    }

    const typeKind = match.type?.kind ?? 'mixed';
    return `${match.name}: ${typeKind}`;
  }

  // === Auto-import methods ===

  async searchImportableSymbols(
    symbol: string,
    options: { excludeUri?: string; limit?: number } = {}
  ): Promise<ImportableSymbolCandidate[]> {
    const query = symbol.trim();
    if (!query) {
      return [];
    }

    const workspaceCandidates = this.workspaceIndex?.searchImportableSymbols(query, options) ?? [];
    const stdlibCandidates = await this.searchStdlibCandidates(query);
    const merged = this.mergeCandidates(workspaceCandidates, stdlibCandidates);

    const limit = Math.max(1, options.limit ?? 20);
    return merged.slice(0, limit);
  }

  // === Private helper methods ===

  private async getDocument(uri: string): Promise<CachedIntrospectionDocument> {
    const cached = this.cache.get(uri);
    const currentVersionKey = this.computeVersionKey(uri);
    if (cached && cached.versionKey === currentVersionKey) {
      return cached;
    }

    const built = await this.buildDocument(uri, currentVersionKey);
    this.cache.set(uri, built);
    return built;
  }

  private computeVersionKey(uri: string): string {
    const cacheEntry = this.services.documentCache.get(uri);
    if (cacheEntry) {
      return `doc:${cacheEntry.version}`;
    }

    const scannerInfo = this.services.workspaceScanner.getFile(uri);
    if (scannerInfo) {
      return `fs:${scannerInfo.lastModified}`;
    }

    return 'unknown';
  }

  private async buildDocument(
    uri: string,
    versionKey: string
  ): Promise<CachedIntrospectionDocument> {
    const cacheEntry = this.services.documentCache.get(uri);
    if (cacheEntry) {
      const symbols = cacheEntry.symbols as PikeSymbol[];
      const inherits = cacheEntry.inherits ?? [];
      return {
        symbols,
        relations: this.buildRelations(uri, symbols, inherits),
        introspectedSymbols: [],
        versionKey,
      };
    }

    const analyzed = await this.safeAnalyze(uri);
    const symbols = analyzed?.result?.parse?.symbols ?? this.getIndexedSymbols(uri);
    const inherits = analyzed?.result?.introspect?.inherits ?? [];
    const introspectedSymbols = analyzed?.result?.introspect?.symbols ?? [];

    return {
      symbols,
      relations: this.buildRelations(uri, symbols, inherits),
      introspectedSymbols,
      versionKey,
    };
  }

  private getIndexedSymbols(uri: string): PikeSymbol[] {
    const indexed = this.services.workspaceIndex.getDocumentSymbols(uri);
    if (indexed.length > 0) {
      return indexed;
    }
    return [];
  }

  private async safeAnalyze(uri: string) {
    try {
      const bridgeManager = this.services.bridge;
      const bridge = bridgeManager?.bridge;
      if (!bridge) {
        return null;
      }

      const fsPath = uriToFsPath(uri);
      const text = await this.readDocumentText(uri);
      if (text === null) {
        return null;
      }

      return await bridge.analyze(text, ['parse', 'introspect'], fsPath);
    } catch (error) {
      this.services.logger.debug('Pike introspection analyze failed', {
        uri,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async readDocumentText(uri: string): Promise<string | null> {
    const doc = this.services.documentSnapshots?.get(uri);
    if (typeof doc === 'string') {
      return doc;
    }

    try {
      return await readFile(uriToFsPath(uri), 'utf-8');
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code === 'ENOENT') return null;
      this.services.logger.debug('readDocumentText failed', {
        uri,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private buildRelations(
    uri: string,
    symbols: PikeSymbol[],
    introspectedInherits: InheritanceInfo[]
  ): InheritRelation[] {
    const classes = symbols
      .filter(
        (symbol): symbol is PikeSymbol & { position: NonNullable<PikeSymbol['position']> } => {
          return symbol.kind === 'class' && Boolean(symbol.position);
        }
      )
      .sort((a, b) => (a.position.line ?? 0) - (b.position.line ?? 0));

    const relations: InheritRelation[] = [];

    for (const symbol of symbols) {
      if (symbol.kind !== 'inherit' || !symbol.position) {
        continue;
      }

      const inheritedName = this.normalizeIdentifier(symbol.classname || symbol.name);
      if (!inheritedName) {
        continue;
      }

      const ownerClass = this.findOwnerClass(classes, symbol.position.line ?? 1);
      if (!ownerClass?.position) {
        continue;
      }

      const relation: InheritRelation = {
        uri,
        ownerClass: ownerClass.name,
        ownerLine: Math.max(0, (ownerClass.position.line ?? 1) - 1),
        inheritedName,
      };

      const source = introspectedInherits.find(inherit => {
        const sourceName = this.normalizeIdentifier(inherit.source_name ?? '');
        const sourcePath = this.normalizeIdentifier(inherit.path ?? '');
        return sourceName === inheritedName || sourcePath === inheritedName;
      });
      if (source?.path) {
        relation.inheritedPath = source.path;
      }

      relations.push(relation);
    }

    return relations;
  }
  private findOwnerClass(
    classes: Array<PikeSymbol & { position: NonNullable<PikeSymbol['position']> }>,
    inheritLineOneBased: number
  ): (PikeSymbol & { position: NonNullable<PikeSymbol['position']> }) | null {
    const inheritLineZeroBased = Math.max(0, inheritLineOneBased - 1);
    let best: (PikeSymbol & { position: NonNullable<PikeSymbol['position']> }) | null = null;

    for (const classSymbol of classes) {
      const classLine = Math.max(0, (classSymbol.position.line ?? 1) - 1);
      if (classLine > inheritLineZeroBased) {
        break;
      }
      best = classSymbol;
    }

    return best;
  }

  private normalizeIdentifier(input: string): string {
    if (!input) {
      return '';
    }

    let text = input.trim();
    if (
      text.length > 1 &&
      ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
    ) {
      text = text.slice(1, -1);
    }

    const slash = text.lastIndexOf('/');
    if (slash >= 0 && slash < text.length - 1) {
      text = text.slice(slash + 1);
    }

    const dot = text.lastIndexOf('.');
    if (dot >= 0 && dot < text.length - 1) {
      text = text.slice(dot + 1);
    }

    return text.trim();
  }

  // === Auto-import private methods ===

  /**
   * Score how well `name` matches `query`.
   * Returns 0 for no match, or a positive score where higher = better.
   * Prefix match scores higher than substring; contiguous subsequence gets a bonus.
   */
  private static fuzzyScore(query: string, name: string): number {
    const q = query.toLowerCase();
    const n = name.toLowerCase();

    // Exact match
    if (n === q) return 100;
    // Prefix match
    if (n.startsWith(q)) return 80 + q.length;
    // Substring match
    const subIdx = n.indexOf(q);
    if (subIdx >= 0) return 40 + q.length;

    // Contiguous subsequence match (characters appear in order)
    let qi = 0;
    let contiguous = 0;
    let bestContiguous = 0;
    for (let ni = 0; ni < n.length && qi < q.length; ni++) {
      if (n[ni] === q[qi]) {
        qi++;
        contiguous++;
        if (contiguous > bestContiguous) bestContiguous = contiguous;
      } else {
        contiguous = 0;
      }
    }
    if (qi < q.length) return 0; // not all query chars found
    return 20 + bestContiguous + q.length;
  }

  /**
   * Clear the cached stdlib symbol lists. Should be called when
   * the workspace index changes.
   */
  invalidateStdlibCache(): void {
    this.stdlibSymbolCache.clear();
  }

  private async searchStdlibCandidates(query: string): Promise<ImportableSymbolCandidate[]> {
    if (!this.stdlibIndex || query.length === 0) {
      return [];
    }

    const searchPaths = this.stdlibIndex.getAvailableModules();

    // Populate cache for any modules not yet loaded
    for (const modulePath of searchPaths) {
      if (this.stdlibSymbolCache.has(modulePath)) continue;
      const moduleInfo = await this.stdlibIndex.getModule(modulePath);
      if (moduleInfo?.symbols) {
        this.stdlibSymbolCache.set(modulePath, moduleInfo.symbols);
      }
    }

    const candidates: ImportableSymbolCandidate[] = [];

    for (const modulePath of searchPaths) {
      const symbols = this.stdlibSymbolCache.get(modulePath);
      if (!symbols) continue;

      for (const [name, symbolInfo] of symbols) {
        const matchScore = PikeIntrospectionService.fuzzyScore(query, name);
        if (matchScore === 0) continue;

        const importKind: 'import' | 'inherit' = symbolInfo.kind === 'class' ? 'inherit' : 'import';
        const exactBoost = name.toLowerCase() === query.toLowerCase() ? 130 : 0;
        const kindBoost = importKind === 'inherit' ? 15 : 10;

        candidates.push({
          symbol: name,
          modulePath,
          importKind,
          score: exactBoost + kindBoost + Math.max(0, 60 - modulePath.length) + matchScore,
          source: 'stdlib-index',
        });
      }
    }

    return candidates;
  }

  private mergeCandidates(
    workspaceCandidates: Array<{
      symbol: string;
      modulePath: string;
      importKind: 'import' | 'inherit';
      score: number;
      source: string;
    }>,
    stdlibCandidates: ImportableSymbolCandidate[]
  ): ImportableSymbolCandidate[] {
    const merged: ImportableSymbolCandidate[] = [
      ...workspaceCandidates.map(c => ({ ...c, source: 'workspace-index' as const })),
      ...stdlibCandidates,
    ];
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
