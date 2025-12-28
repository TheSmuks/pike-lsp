/**
 * Pike Symbol Table
 * 
 * Builds and manages symbol tables from Pike's output.
 */

import type { PikeSymbol, PikePosition } from '@pike-lsp/pike-bridge';

/**
 * Symbol table for a Pike document
 */
export class SymbolTable {
    private symbols = new Map<string, PikeSymbol>();
    private byPosition = new Map<string, PikeSymbol>();

    /**
     * Add a symbol to the table
     */
    addSymbol(symbol: PikeSymbol): void {
        this.symbols.set(symbol.name, symbol);
        if (symbol.position) {
            const key = this.positionKey(symbol.position);
            this.byPosition.set(key, symbol);
        }
    }

    /**
     * Get symbol by name
     */
    getSymbol(name: string): PikeSymbol | undefined {
        return this.symbols.get(name);
    }

    /**
     * Get symbol at position
     */
    getSymbolAtPosition(position: PikePosition): PikeSymbol | undefined {
        const key = this.positionKey(position);
        return this.byPosition.get(key);
    }

    /**
     * Get all symbols
     */
    getAllSymbols(): PikeSymbol[] {
        return Array.from(this.symbols.values());
    }

    /**
     * Clear the symbol table
     */
    clear(): void {
        this.symbols.clear();
        this.byPosition.clear();
    }

    private positionKey(pos: PikePosition): string {
        return `${pos.file}:${pos.line}:${pos.column ?? 0}`;
    }
}
