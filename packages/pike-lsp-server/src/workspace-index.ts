/**
 * Workspace Symbol Index
 *
 * Maintains an index of symbols across all Pike files in the workspace.
 * Enables fast workspace-wide symbol search (Ctrl+T).
 */

import { PikeSymbol, PikeBridge } from '@pike-lsp/pike-bridge';
import { SymbolInformation, SymbolKind } from 'vscode-languageserver';
import * as fs from 'fs';
import * as path from 'path';
import { LSP } from './constants/index.js';

/**
 * Indexed document with its symbols
 */
interface IndexedDocument {
    uri: string;
    symbols: PikeSymbol[];
    version: number;
    lastModified: number;
}

/**
 * Symbol entry in the quick lookup index
 */
interface SymbolEntry {
    name: string;
    kind: string;
    uri: string;
    line: number;
}

/**
 * Error callback type for reporting indexing errors
 */
export type IndexErrorCallback = (message: string, uri?: string) => void;

/**
 * WorkspaceIndex manages symbol indexing across the workspace
 */
export class WorkspaceIndex {
    // Document URI -> IndexedDocument
    private documents = new Map<string, IndexedDocument>();

    // Symbol name (lowercase) -> Map<URI, SymbolEntry>
    // Enables fast prefix matching AND O(1) removal
    private symbolLookup = new Map<string, Map<string, SymbolEntry>>();

    // Pike bridge for parsing
    private bridge: PikeBridge | null = null;

    // Optional error callback for LSP connection reporting
    private onError: IndexErrorCallback | null = null;

    constructor(bridge?: PikeBridge) {
        this.bridge = bridge ?? null;
    }

    /**
     * Set error callback for reporting indexing errors to the LSP connection
     */
    setErrorCallback(callback: IndexErrorCallback): void {
        this.onError = callback;
    }

    /**
     * Report an error through both console and optional callback
     */
    private reportError(message: string, uri?: string): void {
        console.error(message);
        this.onError?.(message, uri);
    }

    /**
     * Set the Pike bridge for parsing
     */
    setBridge(bridge: PikeBridge): void {
        this.bridge = bridge;
    }

    /**
     * Flatten nested symbol tree into a single-level array
     * This ensures all class members are indexed at the workspace level
     */
    private flattenSymbols(symbols: PikeSymbol[]): PikeSymbol[] {
        const flat: PikeSymbol[] = [];

        for (const sym of symbols) {
            // Add the symbol itself
            flat.push(sym);

            // Recursively flatten children
            if (sym.children && sym.children.length > 0) {
                flat.push(...this.flattenSymbols(sym.children));
            }
        }

        return flat;
    }

    /**
     * Index a single document
     */
    async indexDocument(uri: string, content: string, version: number): Promise<void> {
        if (!this.bridge?.isRunning()) {
            return;
        }

        // Extract filename from URI and decode URL encoding
        const filename = decodeURIComponent(uri.replace(/^file:\/\//, ''));

        try {
            const result = await this.bridge.parse(content, filename);
            const symbols = this.flattenSymbols(result.symbols);

            // Remove old entries from lookup
            const existing = this.documents.get(uri);
            if (existing) {
                this.removeFromLookup(uri);
            }

            // Store indexed document
            this.documents.set(uri, {
                uri,
                symbols,
                version,
                lastModified: Date.now(),
            });

            // Add to lookup
            this.addToLookup(uri, symbols);

        } catch (err) {
            // Report error through callback for LSP connection visibility
            this.reportError(`[Pike LSP] Failed to index document: ${err instanceof Error ? err.message : String(err)}`, uri);
        }
    }

    /**
     * Remove a document from the index
     */
    removeDocument(uri: string): void {
        this.removeFromLookup(uri);
        this.documents.delete(uri);
    }

    /**
     * Get symbols for a document
     */
    getDocumentSymbols(uri: string): PikeSymbol[] {
        return this.documents.get(uri)?.symbols ?? [];
    }

    /**
     * Search for symbols across the workspace
     * Returns symbols matching the query string (case-insensitive prefix match)
     */
    searchSymbols(query: string, limit: number = LSP.MAX_WORKSPACE_SYMBOLS): SymbolInformation[] {
        const results: SymbolInformation[] = [];
        const queryLower = query?.toLowerCase() ?? '';

        // If query is empty, return some symbols from each file
        if (!queryLower) {
            for (const [uri, doc] of this.documents) {
                if (!doc.symbols) continue;
                for (const symbol of doc.symbols.slice(0, 5)) {
                    // Skip symbols with null names
                    if (!symbol.name) continue;
                    results.push(this.toSymbolInformation(symbol, uri));
                    if (results.length >= limit) {
                        return results;
                    }
                }
            }
            return results;
        }

        // Search by prefix in the lookup index
        for (const [name, entriesByUri] of this.symbolLookup) {
            if (name.startsWith(queryLower) || name.includes(queryLower)) {
                for (const entry of entriesByUri.values()) {
                    results.push({
                        name: entry.name,
                        kind: this.convertSymbolKind(entry.kind),
                        location: {
                            uri: entry.uri,
                            range: {
                                start: { line: Math.max(0, entry.line - 1), character: 0 },
                                end: { line: Math.max(0, entry.line - 1), character: entry.name.length },
                            },
                        },
                    });
                    if (results.length >= limit) {
                        return results;
                    }
                }
            }
        }

        return results;
    }

    /**
     * Index all Pike files in a directory
     * PERF-002: Uses batch parsing for better performance
     */
    async indexDirectory(dirPath: string, recursive: boolean = true): Promise<number> {
        if (!this.bridge?.isRunning()) {
            return 0;
        }

        const pikeFiles = this.findPikeFiles(dirPath, recursive);

        if (pikeFiles.length === 0) {
            return 0;
        }

        // PERF-002: Collect all files and use batch parsing
        const filesToParse: Array<{ code: string; filename: string }> = [];

        for (const filePath of pikeFiles) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                filesToParse.push({
                    code: content,
                    filename: filePath,
                });
            } catch {
                // Skip files that can't be read
            }
        }

        let indexed = 0;

        if (filesToParse.length > 0) {
            try {
                // Batch parse all files at once
                const batchResult = await this.bridge.batchParse(filesToParse);

                // Process results
                for (const result of batchResult.results) {
                    const uri = `file://${result.filename}`;
                    const version = 1;

                    // Remove old entries from lookup
                    const existing = this.documents.get(uri);
                    if (existing) {
                        this.removeFromLookup(uri);
                    }

                    // Store indexed document
                    this.documents.set(uri, {
                        uri,
                        symbols: this.flattenSymbols(result.symbols),
                        version,
                        lastModified: Date.now(),
                    });

                    // Add to lookup
                    this.addToLookup(uri, this.flattenSymbols(result.symbols));
                    indexed++;
                }
            } catch (err) {
                this.reportError(`[Pike LSP] Batch parse failed, falling back to sequential parsing: ${err instanceof Error ? err.message : String(err)}`);
                // Fallback to sequential parsing on error
                for (const fileToParse of filesToParse) {
                    try {
                        const parseResult = await this.bridge.parse(fileToParse.code, fileToParse.filename);
                        const uri = `file://${fileToParse.filename}`;

                        // Remove old entries from lookup
                        const existing = this.documents.get(uri);
                        if (existing) {
                            this.removeFromLookup(uri);
                        }

                        // Store indexed document
                        this.documents.set(uri, {
                            uri,
                            symbols: this.flattenSymbols(parseResult.symbols),
                            version: 1,
                            lastModified: Date.now(),
                        });

                        // Add to lookup
                        this.addToLookup(uri, this.flattenSymbols(parseResult.symbols));
                        indexed++;
                    } catch {
                        // Skip files that fail to parse
                    }
                }
            }
        }

        return indexed;
    }

    /**
     * Get statistics about the index
     */
    getStats(): { documents: number; symbols: number; uniqueNames: number } {
        let symbolCount = 0;
        for (const doc of this.documents.values()) {
            symbolCount += doc.symbols.length;
        }

        return {
            documents: this.documents.size,
            symbols: symbolCount,
            uniqueNames: this.symbolLookup.size,
        };
    }

    /**
     * Clear the entire index
     */
    clear(): void {
        this.documents.clear();
        this.symbolLookup.clear();
    }

    /**
     * Get all indexed document URIs
     */
    getAllDocumentUris(): string[] {
        return Array.from(this.documents.keys());
    }

    // Private helpers

    private addToLookup(uri: string, symbols: PikeSymbol[]): void {
        for (const symbol of symbols) {
            // Skip symbols with null names (can occur with certain Pike constructs)
            if (!symbol.name) {
                continue;
            }

            const nameLower = symbol.name.toLowerCase();

            const entry: SymbolEntry = {
                name: symbol.name,
                kind: symbol.kind,
                uri,
                line: symbol.position?.line ?? 1,
            };

            let entriesByUri = this.symbolLookup.get(nameLower);
            if (!entriesByUri) {
                entriesByUri = new Map();
                this.symbolLookup.set(nameLower, entriesByUri);
            }
            entriesByUri.set(uri, entry);
        }
    }

    private removeFromLookup(uri: string): void {
        // O(1) removal using nested Map structure
        for (const [name, entriesByUri] of this.symbolLookup) {
            entriesByUri.delete(uri);
            // Clean up empty name entries
            if (entriesByUri.size === 0) {
                this.symbolLookup.delete(name);
            }
        }
    }

    private findPikeFiles(dirPath: string, recursive: boolean): string[] {
        const files: string[] = [];

        const walk = (dir: string) => {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory() && recursive) {
                        // Skip common non-source directories
                        if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
                            walk(fullPath);
                        }
                    } else if (entry.isFile()) {
                        if (entry.name.endsWith('.pike') || entry.name.endsWith('.pmod')) {
                            files.push(fullPath);
                        }
                    }
                }
            } catch {
                // Skip directories we can't read
            }
        };

        walk(dirPath);
        return files;
    }

    private toSymbolInformation(symbol: PikeSymbol, uri: string): SymbolInformation {
        const line = Math.max(0, (symbol.position?.line ?? 1) - 1);

        return {
            name: symbol.name,
            kind: this.convertSymbolKind(symbol.kind),
            location: {
                uri,
                range: {
                    start: { line, character: 0 },
                    end: { line, character: symbol.name.length },
                },
            },
        };
    }

    private convertSymbolKind(kind: string): SymbolKind {
        switch (kind) {
            case 'class':
                return SymbolKind.Class;
            case 'method':
                return SymbolKind.Method;
            case 'variable':
                return SymbolKind.Variable;
            case 'constant':
                return SymbolKind.Constant;
            case 'typedef':
                return SymbolKind.TypeParameter;
            case 'enum':
                return SymbolKind.Enum;
            case 'enum_constant':
                return SymbolKind.EnumMember;
            case 'inherit':
                return SymbolKind.Class;
            case 'import':
                return SymbolKind.Module;
            case 'module':
                return SymbolKind.Module;
            default:
                return SymbolKind.Variable;
        }
    }
}
