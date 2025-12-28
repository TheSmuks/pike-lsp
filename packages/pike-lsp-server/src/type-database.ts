/**
 * Type Database - Stores compiled program information and type inferences
 *
 * Manages:
 * - Compiled program cache per document
 * - Cross-file symbol index
 * - Inheritance hierarchy graph
 * - Type inference cache
 */

import type { IntrospectedSymbol, InheritanceInfo } from '@pike-lsp/pike-bridge';
import { TYPE_DB_MAX_MEMORY_BYTES } from './constants/index.js';

/**
 * Position in source code
 */
export interface Position {
    line: number;
    character: number;
}

/**
 * Compiled program information for a document
 */
export interface CompiledProgramInfo {
    /** Document URI */
    uri: string;
    /** Document version */
    version: number;
    /** All symbols from introspection */
    symbols: Map<string, IntrospectedSymbol>;
    /** Functions only */
    functions: Map<string, IntrospectedSymbol>;
    /** Variables only */
    variables: Map<string, IntrospectedSymbol>;
    /** Classes only */
    classes: Map<string, IntrospectedSymbol>;
    /** Inheritance information */
    inherits: InheritanceInfo[];
    /** Imported modules */
    imports: Set<string>;
    /** Compilation timestamp */
    compiledAt: number;
    /** Estimated memory size in bytes */
    sizeBytes: number;
}

/**
 * Symbol location reference
 */
export interface SymbolLocation {
    uri: string;
    symbol: IntrospectedSymbol;
    line?: number;
}

/**
 * Type inference context
 */
export interface InferenceContext {
    uri: string;
    position: Position;
    scope: 'local' | 'class' | 'global';
}

/**
 * Type Database - Central storage for all type information
 */
export class TypeDatabase {
    /** Compiled program cache: URI -> Program Info */
    private programs = new Map<string, CompiledProgramInfo>();

    /** Global symbol index: Symbol Name -> Locations */
    private globalSymbols = new Map<string, SymbolLocation[]>();

    /** Inheritance graph: Class Name -> Parent Classes */
    private inheritanceGraph = new Map<string, Set<string>>();

    /** Type inference cache: Expression Key -> Type */
    private typeInferences = new Map<string, IntrospectedSymbol>();

    /** Memory budget tracking */
    private totalMemoryBytes = 0;
    private readonly maxMemoryBytes = TYPE_DB_MAX_MEMORY_BYTES;

    /**
     * Add or update compiled program information
     */
    setProgram(info: CompiledProgramInfo): void {
        // Remove old version if exists
        const existing = this.programs.get(info.uri);
        if (existing) {
            this.removeProgram(info.uri);
        }

        // Add new program
        this.programs.set(info.uri, info);
        this.totalMemoryBytes += info.sizeBytes;

        // Update global symbol index
        for (const [name, symbol] of info.symbols) {
            if (!this.globalSymbols.has(name)) {
                this.globalSymbols.set(name, []);
            }
            this.globalSymbols.get(name)!.push({
                uri: info.uri,
                symbol,
            });
        }

        // Update inheritance graph
        this.updateInheritanceGraph(info);

        // Enforce memory budget
        this.enforceMemoryBudget();
    }

    /**
     * Get compiled program information
     */
    getProgram(uri: string): CompiledProgramInfo | undefined {
        return this.programs.get(uri);
    }

    /**
     * Remove program from database
     */
    removeProgram(uri: string): void {
        const info = this.programs.get(uri);
        if (!info) return;

        // Remove from memory tracking
        this.totalMemoryBytes -= info.sizeBytes;

        // Remove from global symbol index
        for (const [name, locations] of this.globalSymbols) {
            const filtered = locations.filter(loc => loc.uri !== uri);
            if (filtered.length === 0) {
                this.globalSymbols.delete(name);
            } else {
                this.globalSymbols.set(name, filtered);
            }
        }

        // Remove from programs
        this.programs.delete(uri);

        // Clear related type inferences
        this.clearInferencesForUri(uri);
    }

    /**
     * Get symbol by name across all programs
     */
    findSymbol(name: string): SymbolLocation[] {
        return this.globalSymbols.get(name) || [];
    }

    /**
     * Get symbol in specific document
     */
    findSymbolInDocument(uri: string, name: string): IntrospectedSymbol | undefined {
        const program = this.programs.get(uri);
        return program?.symbols.get(name);
    }

    /**
     * Get all symbols in a document
     */
    getDocumentSymbols(uri: string): IntrospectedSymbol[] {
        const program = this.programs.get(uri);
        if (!program) return [];
        return Array.from(program.symbols.values());
    }

    /**
     * Get inherited members for a class
     */
    getInheritedMembers(className: string): IntrospectedSymbol[] {
        const parents = this.inheritanceGraph.get(className);
        if (!parents || parents.size === 0) return [];

        const members: IntrospectedSymbol[] = [];

        for (const parentName of parents) {
            // Find parent class definition
            const parentLocations = this.findSymbol(parentName);
            for (const loc of parentLocations) {
                if (loc.symbol.kind === 'class') {
                    const parentProgram = this.programs.get(loc.uri);
                    if (parentProgram) {
                        members.push(...parentProgram.symbols.values());
                    }
                }
            }

            // Recursively get ancestors
            const ancestorMembers = this.getInheritedMembers(parentName);
            members.push(...ancestorMembers);
        }

        return members;
    }

    /**
     * Cache type inference
     */
    setInference(key: string, symbol: IntrospectedSymbol): void {
        this.typeInferences.set(key, symbol);
    }

    /**
     * Get cached type inference
     */
    getInference(key: string): IntrospectedSymbol | undefined {
        return this.typeInferences.get(key);
    }

    /**
     * Build inference key from context
     */
    static buildInferenceKey(uri: string, expression: string): string {
        return `${uri}:${expression}`;
    }

    /**
     * Get memory usage statistics
     */
    getMemoryStats(): {
        programCount: number;
        symbolCount: number;
        totalBytes: number;
        maxBytes: number;
        utilizationPercent: number;
    } {
        let symbolCount = 0;
        for (const program of this.programs.values()) {
            symbolCount += program.symbols.size;
        }

        return {
            programCount: this.programs.size,
            symbolCount,
            totalBytes: this.totalMemoryBytes,
            maxBytes: this.maxMemoryBytes,
            utilizationPercent: (this.totalMemoryBytes / this.maxMemoryBytes) * 100,
        };
    }

    /**
     * Clear all data
     */
    clear(): void {
        this.programs.clear();
        this.globalSymbols.clear();
        this.inheritanceGraph.clear();
        this.typeInferences.clear();
        this.totalMemoryBytes = 0;
    }

    /**
     * Update inheritance graph from program info
     */
    private updateInheritanceGraph(info: CompiledProgramInfo): void {
        // For each class in the program
        for (const className of info.classes.keys()) {
            if (!this.inheritanceGraph.has(className)) {
                this.inheritanceGraph.set(className, new Set());
            }

            // Add parent classes from inheritance info
            for (const inherit of info.inherits) {
                // Extract class name from path if needed
                const parentName = this.extractClassName(inherit.path);
                if (parentName) {
                    this.inheritanceGraph.get(className)!.add(parentName);
                }
            }
        }
    }

    /**
     * Extract class name from file path
     */
    private extractClassName(path: string | undefined): string | null {
        if (!path) return null;

        // Extract filename without extension
        const parts = path.split('/');
        const filename = parts[parts.length - 1];
        if (!filename) return null;

        const name = filename.replace(/\.(pike|pmod)$/, '');

        return name;
    }

    /**
     * Clear type inferences for a specific URI
     */
    private clearInferencesForUri(uri: string): void {
        const keysToDelete: string[] = [];

        for (const key of this.typeInferences.keys()) {
            if (key.startsWith(uri + ':')) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            this.typeInferences.delete(key);
        }
    }

    /**
     * Enforce memory budget by evicting oldest programs
     */
    private enforceMemoryBudget(): void {
        if (this.totalMemoryBytes <= this.maxMemoryBytes) return;

        // Sort programs by compilation time (oldest first)
        const programsByAge = Array.from(this.programs.values())
            .sort((a, b) => a.compiledAt - b.compiledAt);

        // Evict oldest until under budget
        for (const program of programsByAge) {
            if (this.totalMemoryBytes <= this.maxMemoryBytes) break;
            this.removeProgram(program.uri);
        }
    }

    /**
     * Estimate memory size of a program
     */
    static estimateProgramSize(
        symbols: Map<string, IntrospectedSymbol>,
        inherits: InheritanceInfo[]
    ): number {
        // Rough estimate:
        // - 1KB per symbol
        // - 512 bytes per inheritance entry
        const symbolBytes = symbols.size * 1024;
        const inheritBytes = inherits.length * 512;

        return symbolBytes + inheritBytes;
    }
}
