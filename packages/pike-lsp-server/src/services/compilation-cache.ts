import { LRUCache, type LRUCacheOptions, type LRUCacheStats } from './lru-cache.js';
import { Logger } from '@pike-lsp/core';

const log = new Logger('CompilationCache');

export interface CompilationCacheEntry<TResult> {
  code: string;
  result: TResult;
  dependencies: string[];
  timestamp: number;
}

export interface CompilationCacheOptions<TResult> extends Omit<
  LRUCacheOptions<string, CompilationCacheEntry<TResult>>,
  'sizeEstimator'
> {
  sizeEstimator?: (entry: CompilationCacheEntry<TResult>, uri: string) => number;
  clock?: () => number;
  validateResult?: (result: unknown) => boolean;
}

export interface CompilationCacheStats extends LRUCacheStats {
  trackedFiles: number;
  trackedDependencyEdges: number;
}

interface SerializedCacheEntry<TResult> {
  uri: string;
  entry: CompilationCacheEntry<TResult>;
}

interface SerializedPayload<TResult> {
  entries: SerializedCacheEntry<TResult>[];
}

export class CompilationCache<TResult> {
  private readonly cache: LRUCache<string, CompilationCacheEntry<TResult>>;
  private readonly dependenciesByFile = new Map<string, Set<string>>();
  private readonly dependentsByFile = new Map<string, Set<string>>();
  private readonly clock: () => number;

  constructor(options: CompilationCacheOptions<TResult>) {
    this.clock = options.clock ?? Date.now;
    this.cache = new LRUCache<string, CompilationCacheEntry<TResult>>({
      maxSize: options.maxSize,
      sizeEstimator: (entry, uri) => {
        const estimator = options.sizeEstimator;
        if (estimator) {
          return estimator(entry, uri);
        }
        return defaultCompilationEntrySize(entry);
      },
    });
  }

  get size(): number {
    return this.cache.entryCount;
  }

  store(
    uri: string,
    code: string,
    result: TResult,
    dependencies: readonly string[] = [],
    timestamp = this.clock()
  ): boolean {
    const normalizedDependencies = [...new Set(dependencies)];
    const entry: CompilationCacheEntry<TResult> = {
      code,
      result,
      dependencies: normalizedDependencies,
      timestamp,
    };

    const stored = this.cache.set(uri, entry);
    if (!stored) {
      this.batchRemoveDependencyEdges([uri]);
      return false;
    }

    this.updateDependencyEdges(uri, normalizedDependencies);
    return true;
  }

  get(uri: string, code: string): CompilationCacheEntry<TResult> | undefined {
    const entry = this.cache.get(uri);
    if (!entry) {
      return undefined;
    }
    if (entry.code !== code) {
      return undefined;
    }
    return entry;
  }

  invalidate(uri: string, transitive = false): string[] {
    if (!transitive) {
      const removed = this.invalidateSingle(uri);
      return removed ? [uri] : [];
    }

    const queue: string[] = [uri];
    const visited = new Set<string>([uri]);
    const invalidated: string[] = [];

    for (let i = 0; i < queue.length; i++) {
      const current = queue[i]!;

      const dependents = this.dependentsByFile.get(current);
      if (dependents) {
        for (const dependent of dependents) {
          if (!visited.has(dependent)) {
            visited.add(dependent);
            queue.push(dependent);
          }
        }
      }

      const removed = this.invalidateSingle(current);
      if (removed) {
        invalidated.push(current);
      }
    }

    return invalidated;
  }

  evictOlderThan(maxAgeMs: number, now = this.clock()): string[] {
    const expired: string[] = [];
    for (const [uri, entry] of this.cache.entries()) {
      if (now - entry.timestamp > maxAgeMs) {
        expired.push(uri);
      }
    }

    if (expired.length === 0) {
      return expired;
    }

    this.cache.deleteBatch(expired);

    this.batchRemoveDependencyEdges(expired);
    return expired;
  }

  /**
   * Evict expired entries and serialize survivors in a single pass.
   * Avoids the double iteration of calling evictOlderThen() then serialize().
   * @returns JSON string of surviving entries, or the expired URIs array
   */
  evictAndSerialize(
    maxAgeMs: number,
    now = this.clock()
  ): { serialized: string; evicted: string[] } {
    const surviving: SerializedCacheEntry<TResult>[] = [];
    const expired: string[] = [];

    for (const [uri, entry] of this.cache.entries()) {
      if (now - entry.timestamp > maxAgeMs) {
        expired.push(uri);
      } else {
        surviving.push({ uri, entry });
      }
    }

    if (expired.length > 0) {
      this.cache.deleteBatch(expired);
      this.batchRemoveDependencyEdges(expired);
    }

    return {
      serialized: JSON.stringify({ entries: surviving }),
      evicted: expired,
    };
  }

  clear(): void {
    this.cache.clear();
    this.dependenciesByFile.clear();
    this.dependentsByFile.clear();
  }

  serialize(): string {
    const payload: SerializedPayload<TResult> = {
      entries: this.cache.entries().map(([uri, entry]) => ({ uri, entry })),
    };
    return JSON.stringify(payload);
  }

  getStats(): CompilationCacheStats {
    let dependencyEdgeCount = 0;
    for (const deps of this.dependenciesByFile.values()) {
      dependencyEdgeCount += deps.size;
    }

    return {
      ...this.cache.getStats(),
      trackedFiles: this.dependenciesByFile.size,
      trackedDependencyEdges: dependencyEdgeCount,
    };
  }

  static deserialize<TResult>(
    serialized: string,
    options: CompilationCacheOptions<TResult>
  ): CompilationCache<TResult> {
    const cache = new CompilationCache<TResult>(options);

    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch (error) {
      if (error instanceof SyntaxError) {
        log.warn('Failed to parse compilation cache payload as JSON', {
          error: error.message,
        });
        return cache;
      }
      throw error;
    }

    if (!isSerializedPayload<TResult>(parsed)) {
      return cache;
    }

    const validate = options.validateResult;
    for (const record of parsed.entries) {
      if (!isSerializedCacheEntry<TResult>(record)) {
        continue;
      }

      if (validate && !validate(record.entry.result)) {
        log.warn('Skipping deserialized entry with invalid result', {
          uri: record.uri,
        });
        continue;
      }

      cache.store(
        record.uri,
        record.entry.code,
        record.entry.result,
        record.entry.dependencies,
        record.entry.timestamp
      );
    }

    return cache;
  }

  private invalidateSingle(uri: string): boolean {
    const removed = this.cache.delete(uri);
    this.batchRemoveDependencyEdges([uri]);
    this.dependentsByFile.delete(uri);
    return removed;
  }

  private updateDependencyEdges(uri: string, dependencies: string[]): void {
    this.batchRemoveDependencyEdges([uri]);

    if (dependencies.length === 0) {
      return;
    }

    this.dependenciesByFile.set(uri, new Set(dependencies));

    for (const dependency of dependencies) {
      const dependents = this.dependentsByFile.get(dependency) ?? new Set<string>();
      dependents.add(uri);
      this.dependentsByFile.set(dependency, dependents);
    }
  }
  private batchRemoveDependencyEdges(uris: string[]): void {
    for (const uri of uris) {
      this.removeDependencyEdges(uri);
    }
  }

  private removeDependencyEdges(uri: string): void {
    const dependencies = this.dependenciesByFile.get(uri);
    if (dependencies) {
      for (const dependency of dependencies) {
        const dependents = this.dependentsByFile.get(dependency);
        if (!dependents) {
          continue;
        }
        dependents.delete(uri);
        if (dependents.size === 0) {
          this.dependentsByFile.delete(dependency);
        }
      }
      this.dependenciesByFile.delete(uri);
    }
  }
}

function defaultCompilationEntrySize<TResult>(entry: CompilationCacheEntry<TResult>): number {
  void entry;
  return 1;
}

function isSerializedPayload<TResult>(value: unknown): value is SerializedPayload<TResult> {
  if (!isRecord(value)) {
    return false;
  }
  return Array.isArray(value['entries']);
}

function isSerializedCacheEntry<TResult>(value: unknown): value is SerializedCacheEntry<TResult> {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value['uri'] !== 'string') {
    return false;
  }

  return isCompilationEntry<TResult>(value['entry']);
}

function isCompilationEntry<TResult>(value: unknown): value is CompilationCacheEntry<TResult> {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value['code'] === 'string' &&
    Array.isArray(value['dependencies']) &&
    value['dependencies'].every(item => typeof item === 'string') &&
    typeof value['timestamp'] === 'number' &&
    'result' in value
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
