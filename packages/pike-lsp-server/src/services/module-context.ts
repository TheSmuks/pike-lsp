/**
 * Module Context Service
 *
 * Provides import/include/inherit/require resolution and management.
 * Uses PikeBridge's extractImports, resolveImport, checkCircular, and
 * getWaterfallSymbols methods for comprehensive module tracking.
 */

import type {
    ExtractedImport,
    ResolveImportResult,
    WaterfallSymbolsResult,
    CircularCheckResult,
    ImportType,
} from '@pike-lsp/pike-bridge';

/**
 * Cached import data for a document.
 */
export interface ModuleImportData {
    /** Document URI */
    uri: string;
    /** Extracted imports */
    imports: ExtractedImport[];
    /** Resolved import paths (path -> resolved path) */
    resolved: Map<string, string>;
    /** Timestamp when data was extracted */
    timestamp: number;
}

/**
 * Module Context Service
 *
 * Manages import extraction, resolution, and waterfall symbol loading
 * for Pike documents.
 */
export class ModuleContext {
    private cache = new Map<string, ModuleImportData>();
    private pending = new Map<string, Promise<ModuleImportData>>();

    /**
     * Get imports for a document.
     * @param uri - Document URI
     * @param content - Document content
     * @param bridge - PikeBridge instance
     * @param filename - Filename for Pike (extracted from URI)
     */
    async getImportsForDocument(
        uri: string,
        content: string,
        bridge: { extractImports: typeof import('@pike-lsp/pike-bridge').PikeBridge.prototype.extractImports },
        filename?: string
    ): Promise<ExtractedImport[]> {
        // Check cache first
        const cached = this.cache.get(uri);
        const cacheAge = Date.now() - (cached?.timestamp ?? 0);
        const CACHE_TTL = 5000; // 5 seconds

        if (cached && cacheAge < CACHE_TTL) {
            return cached.imports;
        }

        // Check for pending request
        const pending = this.pending.get(uri);
        if (pending) {
            const result = await pending;
            return result.imports;
        }

        // Extract imports using PikeBridge
        const promise = this.extractImports(uri, content, bridge, filename);
        this.pending.set(uri, promise);

        try {
            const result = await promise;
            this.cache.set(uri, result);
            return result.imports;
        } finally {
            this.pending.delete(uri);
        }
    }

    /**
     * Resolve an import target to its file path.
     * @param importType - Type of import (include, import, inherit, require)
     * @param target - Import target path
     * @param currentFile - Current file URI for relative resolution
     * @param bridge - PikeBridge instance
     */
    async resolveImportTarget(
        importType: ImportType,
        target: string,
        currentFile: string,
        bridge: { resolveImport: typeof import('@pike-lsp/pike-bridge').PikeBridge.prototype.resolveImport }
    ): Promise<ResolveImportResult> {
        return bridge.resolveImport(importType, target, currentFile);
    }

    /**
     * Get waterfall symbols for a document (transitive imports).
     * @param uri - Document URI
     * @param content - Document content
     * @param bridge - PikeBridge instance
     * @param maxDepth - Maximum depth for transitive resolution
     */
    async getWaterfallSymbolsForDocument(
        uri: string,
        content: string,
        bridge: {
            extractImports: typeof import('@pike-lsp/pike-bridge').PikeBridge.prototype.extractImports;
            getWaterfallSymbols: typeof import('@pike-lsp/pike-bridge').PikeBridge.prototype.getWaterfallSymbols;
        },
        maxDepth: number = 5
    ): Promise<WaterfallSymbolsResult> {
        const filename = this.uriToFilename(uri);
        return bridge.getWaterfallSymbols(content, filename, maxDepth);
    }

    /**
     * Check for circular dependencies in a document.
     * @param uri - Document URI
     * @param content - Document content
     * @param bridge - PikeBridge instance
     */
    async checkCircularDependencies(
        uri: string,
        content: string,
        bridge: {
            extractImports: typeof import('@pike-lsp/pike-bridge').PikeBridge.prototype.extractImports;
            checkCircular: typeof import('@pike-lsp/pike-bridge').PikeBridge.prototype.checkCircular;
        }
    ): Promise<CircularCheckResult> {
        const filename = this.uriToFilename(uri);
        return bridge.checkCircular(content, filename);
    }

    /**
     * Invalidate cached data for a document.
     * @param uri - Document URI
     */
    invalidate(uri: string): void {
        this.cache.delete(uri);
        this.pending.delete(uri);
    }

    /**
     * Clear all cached data.
     */
    clear(): void {
        this.cache.clear();
        this.pending.clear();
    }

    /**
     * Get the number of cached documents.
     */
    get size(): number {
        return this.cache.size;
    }

    /**
     * Extract imports from document content.
     */
    private async extractImports(
        uri: string,
        content: string,
        bridge: { extractImports: typeof import('@pike-lsp/pike-bridge').PikeBridge.prototype.extractImports },
        filename?: string
    ): Promise<ModuleImportData> {
        const fname = filename || this.uriToFilename(uri);
        const result = await bridge.extractImports(content, fname);

        const resolved = new Map<string, string>();
        for (const imp of result.imports) {
            if (imp.path && imp.resolved_path) {
                resolved.set(imp.path, imp.resolved_path);
            }
        }

        return {
            uri,
            imports: result.imports,
            resolved,
            timestamp: Date.now(),
        };
    }

    /**
     * Convert document URI to filename for Pike.
     * Handles file:// URIs and workspace paths.
     */
    private uriToFilename(uri: string): string {
        // Remove file:// prefix
        if (uri.startsWith('file://')) {
            return decodeURIComponent(uri.substring(7));
        }
        return uri;
    }
}
