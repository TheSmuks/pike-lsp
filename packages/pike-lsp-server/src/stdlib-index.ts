/**
 * Stdlib Index Manager - Lazy on-demand loading of Pike standard library
 *
 * Features:
 * - Lazy loading: Only loads modules when first accessed
 * - LRU caching: Evicts least-recently-used modules
 * - Memory budget: Enforces 20MB limit for stdlib cache
 * - Access tracking: Records access times and counts
 */

import type { PikeBridge } from '@pike-lsp/pike-bridge';
import type { IntrospectedSymbol, InheritanceInfo } from '@pike-lsp/pike-bridge';
import { MAX_STDLIB_MODULES } from './constants/index.js';

/**
 * Information about a stdlib module
 */
export interface StdlibModuleInfo {
    /** Module path (e.g., "Stdio.File") */
    modulePath: string;

    /** Symbols in the module (lazy loaded) */
    symbols?: Map<string, IntrospectedSymbol>;

    /** Source file path (may include line number suffix like "file.pike:42") */
    resolvedPath?: string;

    /** Source file path without line number */
    filePath?: string;

    /** Line number within the file (0-based for LSP) */
    line?: number;

    /** Inheritance information */
    inherits?: InheritanceInfo[];

    /** Last access timestamp */
    lastAccessed: number;

    /** Access count */
    accessCount: number;

    /** Estimated size in bytes */
    sizeBytes: number;
}

/**
 * LRU queue entry
 */
interface LRUEntry {
    modulePath: string;
    timestamp: number;
}

/**
 * Stdlib Index Manager - Manages lazy loading of Pike stdlib modules
 */
export class StdlibIndexManager {
    /** Pike bridge for resolving modules */
    private bridge: PikeBridge;

    /** Module cache: Path -> Module Info */
    private modules = new Map<string, StdlibModuleInfo>();

    /** Negative cache: Modules that don't exist */
    private negativeCache = new Set<string>();

    /** LRU queue for eviction */
    private lruQueue: LRUEntry[] = [];

    /** Configuration */
    private readonly maxCacheSize: number;
    private readonly maxMemoryMB: number;

    /** Memory tracking */
    private currentMemoryBytes = 0;

    /** Statistics */
    private stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        negativeHits: 0,
    };


    constructor(bridge: PikeBridge, options?: { maxCacheSize?: number; maxMemoryMB?: number }) {
        this.bridge = bridge;
        this.maxCacheSize = options?.maxCacheSize ?? MAX_STDLIB_MODULES;
        this.maxMemoryMB = options?.maxMemoryMB ?? 20;
    }

    /**
     * Get module information, loading on-demand if needed
     */
    async getModule(modulePath: string): Promise<StdlibModuleInfo | null> {
        // Check negative cache first
        if (this.negativeCache.has(modulePath)) {
            this.stats.negativeHits++;
            return null;
        }

        // Check positive cache
        const cached = this.modules.get(modulePath);
        if (cached) {
            this.stats.hits++;
            this.touchModule(modulePath);
            return cached;
        }

        // Cache miss - load from Pike
        this.stats.misses++;
        return this.loadModule(modulePath);
    }

    /**
     * Get symbols for a module
     */
    async getSymbols(modulePath: string): Promise<Map<string, IntrospectedSymbol> | null> {
        const module = await this.getModule(modulePath);
        return module?.symbols ?? null;
    }

    /**
     * Check if module is cached
     */
    isCached(modulePath: string): boolean {
        return this.modules.has(modulePath);
    }

    /**
     * Preload common stdlib modules
     */
    async preloadCommon(): Promise<void> {
        const commonModules = [
            'Stdio',
            'Array',
            'String',
            'Mapping',
            'Stdio.File',
        ];

        for (const modulePath of commonModules) {
            await this.getModule(modulePath);
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): {
        hits: number;
        misses: number;
        evictions: number;
        negativeHits: number;
        hitRate: number;
        moduleCount: number;
        negativeCount: number;
        memoryBytes: number;
        memoryMB: number;
    } {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

        return {
            ...this.stats,
            hitRate,
            moduleCount: this.modules.size,
            negativeCount: this.negativeCache.size,
            memoryBytes: this.currentMemoryBytes,
            memoryMB: this.currentMemoryBytes / (1024 * 1024),
        };
    }

    /**
     * Clear the cache
     */
    clear(): void {
        this.modules.clear();
        this.negativeCache.clear();
        this.lruQueue = [];
        this.currentMemoryBytes = 0;
        this.stats = { hits: 0, misses: 0, evictions: 0, negativeHits: 0 };
    }

    /**
     * Parse a path that may contain a line number suffix.
     * Pike returns paths like "/path/to/file.pike:42" where 42 is the line number.
     * @param path - Path potentially with line number suffix
     * @returns Object with filePath and line (0-based for LSP)
     */
    private parsePathWithLine(path: string): { filePath: string; line: number } {
        const colonIndex = path.lastIndexOf(':');
        if (colonIndex !== -1) {
            // Check if the part after the last colon is a number (line number)
            const afterColon = path.slice(colonIndex + 1);
            if (/^\d+$/.test(afterColon)) {
                // It's a line number (Pike uses 1-based lines)
                const line = parseInt(afterColon, 10);
                return {
                    filePath: path.slice(0, colonIndex),
                    line: Math.max(0, line - 1), // Convert to 0-based for LSP
                };
            }
        }
        // No line number found
        return { filePath: path, line: 0 };
    }

    /**
     * Load module from Pike
     */
    private async loadModule(modulePath: string): Promise<StdlibModuleInfo | null> {
        try {
            const result = await this.bridge.resolveStdlib(modulePath);

            if (!result.found) {
                // Add to negative cache to avoid repeated lookups
                this.negativeCache.add(modulePath);
                return null;
            }

            // Convert arrays to Maps
            const symbols = new Map<string, IntrospectedSymbol>();
            if (result.symbols) {
                for (const symbol of result.symbols) {
                    symbols.set(symbol.name, symbol);
                }
            }

            // Estimate size
            const sizeBytes = this.estimateModuleSize(symbols, result.inherits || []);

            const moduleInfo: StdlibModuleInfo = {
                modulePath,
                symbols,
                lastAccessed: Date.now(),
                accessCount: 1,
                sizeBytes,
            };

            // Parse the path to extract line number
            if (result.path) {
                const { filePath, line } = this.parsePathWithLine(result.path);
                moduleInfo.resolvedPath = result.path; // Keep original with line number
                moduleInfo.filePath = filePath; // Without line number
                moduleInfo.line = line; // 0-based for LSP
            }
            if (result.inherits) {
                moduleInfo.inherits = result.inherits;
            }

            // Add to cache
            this.addToCache(moduleInfo);

            return moduleInfo;
        } catch (error) {
            console.error(`Failed to load stdlib module ${modulePath}:`, error);
            // Add to negative cache on error too
            this.negativeCache.add(modulePath);
            return null;
        }
    }

    /**
     * Add module to cache with LRU eviction
     */
    private addToCache(module: StdlibModuleInfo): void {
        // Check if we need to evict
        while (
            this.modules.size >= this.maxCacheSize ||
            this.currentMemoryBytes + module.sizeBytes > this.maxMemoryMB * 1024 * 1024
        ) {
            this.evictLRU();
        }

        // Add to cache
        this.modules.set(module.modulePath, module);
        this.currentMemoryBytes += module.sizeBytes;

        // Add to LRU queue
        this.lruQueue.push({
            modulePath: module.modulePath,
            timestamp: module.lastAccessed,
        });
    }

    /**
     * Update access time for module (move to end of LRU queue)
     */
    private touchModule(modulePath: string): void {
        const module = this.modules.get(modulePath);
        if (!module) return;

        // Update access info
        module.lastAccessed = Date.now();
        module.accessCount++;

        // Remove from LRU queue
        this.lruQueue = this.lruQueue.filter(entry => entry.modulePath !== modulePath);

        // Add back to end
        this.lruQueue.push({
            modulePath,
            timestamp: module.lastAccessed,
        });
    }

    /**
     * Evict least recently used module
     */
    private evictLRU(): void {
        if (this.lruQueue.length === 0) return;

        // Get oldest entry
        const victim = this.lruQueue.shift()!;
        const module = this.modules.get(victim.modulePath);

        if (module) {
            this.currentMemoryBytes -= module.sizeBytes;
            this.modules.delete(victim.modulePath);
            this.stats.evictions++;
        }
    }

    /**
     * Estimate memory size of a module
     */
    private estimateModuleSize(
        symbols: Map<string, IntrospectedSymbol>,
        inherits: InheritanceInfo[]
    ): number {
        // Estimate ~400 bytes per symbol on average
        const symbolBytes = symbols.size * 400;
        const inheritBytes = inherits.length * 200;

        return symbolBytes + inheritBytes;
    }
}
