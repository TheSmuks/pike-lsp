import type { InheritanceInfo, IntrospectedSymbol, PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from './index.js';
import type { StdlibIndexManager, StdlibModuleInfo } from '../stdlib-index.js';
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

  /** Track which stdlib modules have been populated into stdlibSymbolIndex. */
  private populatedModules = new Set<string>();

  /** Sorted lowercase keys for binary-search prefix lookup. */
  private stdlibSortedKeys: string[] = [];

  /** Inverted index: lowercase symbol name → entries keyed by modulePath. */
  private stdlibSymbolIndex = new Map<
    string,
    Array<{ modulePath: string; name: string; kind: string }>
  >();
  constructor(
    private readonly services: Services,
    private readonly workspaceIndex?: WorkspaceIndex,
    private readonly stdlibIndex?: StdlibIndexManager | null
  ) {}

  /**
   * Add a loaded module's symbols to the search index.
   * Called after lazy-loading a module during query resolution.
   * Idempotent — safe to call multiple times for the same module.
   */
  addModuleToIndex(info: StdlibModuleInfo): void {
    if (this.populatedModules.has(info.modulePath)) return;
    if (!info.symbols) return;

    this.populatedModules.add(info.modulePath);
    const newKeys: string[] = [];
    for (const [name, sym] of info.symbols) {
      const key = name.toLowerCase();
      let bucket = this.stdlibSymbolIndex.get(key);
      if (!bucket) {
        bucket = [];
        this.stdlibSymbolIndex.set(key, bucket);
        newKeys.push(key);
      }
      bucket.push({ modulePath: info.modulePath, name, kind: sym.kind });
    }
    if (newKeys.length > 0) {
      this.stdlibSortedKeys = mergeIntoSorted(this.stdlibSortedKeys, newKeys);
    }
  }

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
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
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
    this.populatedModules.clear();
    this.stdlibSortedKeys = [];
    this.stdlibSymbolIndex.clear();
  }

  private async searchStdlibCandidates(query: string): Promise<ImportableSymbolCandidate[]> {
    const stdlibIndex = this.stdlibIndex;
    if (!stdlibIndex || query.length === 0) {
      return [];
    }

    const candidates = this.searchStdlibIndex(query);

    // If the index has results, return them — no bridge work needed.
    if (candidates.length > 0) {
      return candidates;
    }

    // No results — the relevant modules may not be indexed yet.
    // Load only the modules whose path matches the query, then retry.
    const modulePaths = this.candidateModulesForQuery(query, stdlibIndex);
    if (modulePaths.length === 0) {
      return [];
    }

    // Load and index each candidate module (at most a few bridge calls).
    for (const modPath of modulePaths) {
      if (this.populatedModules.has(modPath)) continue;
      const info = await stdlibIndex.getModule(modPath);
      if (info) {
        this.addModuleToIndex(info);
      }
    }

    // Retry the search against the now-populated index.
    return this.searchStdlibIndex(query);
  }

  /**
   * Pure index search — no bridge calls. Used by searchStdlibCandidates
   * both before and after lazy loading.
   */
  private searchStdlibIndex(query: string): ImportableSymbolCandidate[] {
    const candidates: ImportableSymbolCandidate[] = [];
    const qLower = query.toLowerCase();
    // Phase 1: exact + prefix lookup via binary search on sorted keys.
    const visited = new Set<string>();
    const startIdx = lowerBound(this.stdlibSortedKeys, qLower);
    const qEnd = qLower + '\uffff';
    const endIdx = lowerBound(this.stdlibSortedKeys, qEnd);
    for (let i = startIdx; i < endIdx; i++) {
      const indexKey = this.stdlibSortedKeys[i]!;
      const entries = this.stdlibSymbolIndex.get(indexKey);
      if (!entries) continue;
      for (const entry of entries) {
        const cacheKey = `${entry.name}:${entry.modulePath}`;
        if (visited.has(cacheKey)) continue;
        visited.add(cacheKey);

        const importKind: 'import' | 'inherit' = entry.kind === 'class' ? 'inherit' : 'import';
        const matchScore = indexKey === qLower ? 100 : 80 + qLower.length;
        const exactBoost = indexKey === qLower ? 130 : 0;
        const kindBoost = importKind === 'inherit' ? 15 : 10;

        candidates.push({
          symbol: entry.name,
          modulePath: entry.modulePath,
          importKind,
          score: exactBoost + kindBoost + Math.max(0, 60 - entry.modulePath.length) + matchScore,
          source: 'stdlib-index',
        });
      }
    }

    // Phase 2: fallback — fuzzy match against inverted index entries
    if (candidates.length === 0) {
      let scanned = 0;
      const maxPhase2Scan = 200;
      for (const entries of this.stdlibSymbolIndex.values()) {
        for (const entry of entries) {
          if (++scanned > maxPhase2Scan) break;
          const matchScore = PikeIntrospectionService.fuzzyScore(query, entry.name);
          if (matchScore === 0) continue;

          const importKind: 'import' | 'inherit' = entry.kind === 'class' ? 'inherit' : 'import';
          const kindBoost = importKind === 'inherit' ? 15 : 10;

          candidates.push({
            symbol: entry.name,
            modulePath: entry.modulePath,
            importKind,
            score: kindBoost + Math.max(0, 60 - entry.modulePath.length) + matchScore,
            source: 'stdlib-index',
          });
        }
        if (scanned > maxPhase2Scan) break;
      }
    }

    return candidates;
  }

  /**
   * Identify module paths that could contain symbols matching the query.
   * Returns at most 3 modules to keep bridge calls bounded.
   */
  private candidateModulesForQuery(query: string, stdlibIndex: StdlibIndexManager): string[] {
    const available = stdlibIndex.getAvailableModules();
    const qLower = query.toLowerCase();
    const matches: string[] = [];

    for (const modPath of available) {
      // Skip already-populated modules — if they didn't produce results,
      // re-loading won't help.
      if (this.populatedModules.has(modPath)) continue;

      const modLower = modPath.toLowerCase();
      // Direct match: query is a module name or prefix of it.
      // E.g. query="array" matches "Array", "Array" matches "Array"
      if (modLower === qLower || modLower.startsWith(qLower) || qLower.startsWith(modLower + '.')) {
        matches.push(modPath);
        if (matches.length >= 3) break;
      }
    }

    return matches;
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

/** Binary search: first index in sorted array where arr[i] >= target. */
function lowerBound(arr: readonly string[], target: string): number {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Merge new unique keys into a sorted array (both already sorted). */
function mergeIntoSorted(sorted: string[], newKeys: string[]): string[] {
  if (sorted.length === 0) return newKeys;
  const result: string[] = [];
  let i = 0,
    j = 0;
  while (i < sorted.length && j < newKeys.length) {
    const a = sorted[i]!,
      b = newKeys[j]!;
    if (a < b) {
      result.push(a);
      i++;
    } else if (a > b) {
      result.push(b);
      j++;
    } else {
      result.push(a);
      i++;
      j++;
    }
  }
  while (i < sorted.length) result.push(sorted[i++]!);
  while (j < newKeys.length) result.push(newKeys[j++]!);
  return result;
}
