import type { InheritanceInfo, IntrospectedSymbol, PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from './index.js';
import { uriToFsPath } from '../utils/uri-path.js';

export interface InheritRelation {
  uri: string;
  ownerClass: string;
  ownerLine: number;
  inheritedName: string;
  inheritedPath?: string;
}

interface CachedIntrospectionDocument {
  symbols: PikeSymbol[];
  relations: InheritRelation[];
  introspectedSymbols: IntrospectedSymbol[];
  versionKey: string;
}

export class PikeIntrospectionService {
  private readonly cache = new Map<string, CachedIntrospectionDocument>();

  constructor(private readonly services: Services) {}

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
      const fs = await import('node:fs/promises');
      return await fs.readFile(uriToFsPath(uri), 'utf-8');
    } catch {
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

    const introspectedNames = this.collectInheritanceNames(introspectedInherits);
    // Only use introspection as additional source, not as filter
    // This allows symbols to be used when introspection is incomplete
    const hasCompleteIntrospection = introspectedInherits.length > 0 && introspectedNames.size > 0;
    const relations: InheritRelation[] = [];

    for (const symbol of symbols) {
      if (symbol.kind !== 'inherit' || !symbol.position) {
        continue;
      }

      const inheritedName = this.normalizeIdentifier(symbol.classname || symbol.name);
      if (!inheritedName) {
        continue;
      }

      // Only skip if we have complete introspection AND this inherit is not confirmed
      // This preserves behavior when introspection is partial or missing
      if (hasCompleteIntrospection && !introspectedNames.has(inheritedName)) {
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

  private collectInheritanceNames(inherits: InheritanceInfo[]): Set<string> {
    const result = new Set<string>();
    for (const inherit of inherits) {
      const sourceName = this.normalizeIdentifier(inherit.source_name ?? '');
      if (sourceName) {
        result.add(sourceName);
      }

      const pathName = this.normalizeIdentifier(inherit.path ?? '');
      if (pathName) {
        result.add(pathName);
      }
    }
    return result;
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
}
