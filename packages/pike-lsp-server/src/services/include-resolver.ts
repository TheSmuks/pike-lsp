/**
 * Include Resolver Service
 *
 * Manages resolution and caching of #include dependencies.
 * Provides symbol lookup from included files for IntelliSense.
 */

import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { BridgeManager } from './bridge-manager.js';
import type { ResolvedInclude, DocumentDependencies } from '../core/types.js';
import { Logger } from '@pike-lsp/core';
import { readFileSync } from 'node:fs';

/**
 * Cache for resolved includes with their symbols.
 * Key is the absolute file path.
 */
type IncludeCache = Map<string, ResolvedInclude>;

/**
 * Include Resolver Service
 *
 * Resolves #include paths to absolute file paths and caches
 * symbols from included files for IntelliSense completion.
 */
export class IncludeResolver {
    private cache: IncludeCache = new Map();
    private readonly CACHE_TTL = 30_000; // 30 seconds

    constructor(
        private readonly bridge: BridgeManager | null,
        private readonly logger: Logger
    ) {}

    /**
     * Resolve dependencies for a document.
     *
     * Extracts #include and import symbols, resolves their paths,
     * and caches symbols from included files.
     *
     * @param uri - Document URI
     * @param symbols - Symbols from the document
     * @returns Document dependencies with resolved includes and imports
     */
    async resolveDependencies(
        uri: string,
        symbols: PikeSymbol[]
    ): Promise<DocumentDependencies> {
        const dependencies: DocumentDependencies = {
            includes: [],
            imports: [],
        };

        const includeSymbols = symbols.filter(s => s.kind === 'import' && s.name?.startsWith('#'));
        const importSymbols = symbols.filter(s => s.kind === 'import' && !s.name?.startsWith('#'));

        // Resolve #include statements
        for (const symbol of includeSymbols) {
            const includePath = (symbol as any).classname || symbol.name;
            if (!includePath) continue;

            try {
                const resolved = await this.resolveInclude(includePath, uri);
                if (resolved) {
                    dependencies.includes.push(resolved);
                }
            } catch (err) {
                this.logger.debug('Failed to resolve include', {
                    includePath,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        // Track import statements
        for (const symbol of importSymbols) {
            const modulePath = (symbol as any).classname || symbol.name;
            if (!modulePath) continue;

            // Try to resolve as stdlib to determine type
            const isStdlib = await this.isStdlibModule(modulePath);
            dependencies.imports.push({
                modulePath,
                isStdlib,
            });
        }

        return dependencies;
    }

    /**
     * Resolve a single include path.
     *
     * @param includePath - Include path from source (with or without quotes/brackets)
     * @param currentUri - Current document URI
     * @returns Resolved include with symbols, or null if not found
     */
    async resolveInclude(includePath: string, currentUri: string): Promise<ResolvedInclude | null> {
        if (!this.bridge?.bridge) {
            return null;
        }

        try {
            const result = await this.bridge.bridge.resolveInclude(includePath, currentUri);

            if (!result.exists || !result.path) {
                return null;
            }

            const cacheKey = result.path;
            const cached = this.cache.get(cacheKey);
            const now = Date.now();

            // Return cached if still valid
            if (cached && (now - cached.lastModified) < this.CACHE_TTL) {
                return cached;
            }

            // Parse the included file to get symbols
            const symbols = await this.parseIncludedFile(result.path);

            const resolved: ResolvedInclude = {
                originalPath: result.originalPath,
                resolvedPath: result.path,
                symbols,
                lastModified: now,
            };

            this.cache.set(cacheKey, resolved);
            return resolved;
        } catch (err) {
            this.logger.debug('Include resolution failed', {
                includePath,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }

    /**
     * Parse an included file to extract its symbols.
     *
     * @param filePath - Absolute path to the included file
     * @returns Array of symbols from the file
     */
    private async parseIncludedFile(filePath: string): Promise<PikeSymbol[]> {
        if (!this.bridge?.bridge) {
            return [];
        }

        try {
            // Read file content
            const content = readFileSync(filePath, 'utf-8');

            // Use analyze to get symbols (parse operation only)
            const response = await this.bridge.bridge.analyze(content, ['parse'], filePath);

            if (response.result?.parse?.symbols) {
                return response.result.parse.symbols;
            }

            return [];
        } catch (err) {
            this.logger.debug('Failed to parse included file', {
                filePath,
                error: err instanceof Error ? err.message : String(err),
            });
            return [];
        }
    }

    /**
     * Check if a module is a stdlib module.
     *
     * @param modulePath - Module path to check
     * @returns true if the module is in stdlib
     */
    private async isStdlibModule(modulePath: string): Promise<boolean> {
        if (!this.bridge?.bridge) {
            return false;
        }

        try {
            const result = await this.bridge.bridge.resolveStdlib(modulePath);
            return result.found === 1;
        } catch {
            return false;
        }
    }

    /**
     * Get all symbols from document dependencies.
     *
     * @param dependencies - Document dependencies
     * @returns Array of all symbols from includes
     */
    async getDependencySymbols(dependencies: DocumentDependencies): Promise<PikeSymbol[]> {
        const symbols: PikeSymbol[] = [];

        // Add symbols from includes
        for (const include of dependencies.includes) {
            symbols.push(...include.symbols);
        }

        // Import symbols are resolved via stdlibIndex in completion handler
        // We just return the include symbols here

        return symbols;
    }

    /**
     * Invalidate cache for a specific file.
     *
     * @param filePath - Absolute path to invalidate
     */
    invalidate(filePath: string): void {
        this.cache.delete(filePath);
    }

    /**
     * Clear all cached includes.
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics.
     */
    getStats(): { cachedIncludes: number; totalSymbols: number } {
        let totalSymbols = 0;
        for (const include of this.cache.values()) {
            totalSymbols += include.symbols.length;
        }

        return {
            cachedIncludes: this.cache.size,
            totalSymbols,
        };
    }
}
