/**
 * Symbol Position Index Building
 *
 * Provides functions for building symbol position indices used in diagnostics.
 * Extracted from diagnostics.ts for maintainability (Issue #136).
 */

import type { Position } from 'vscode-languageserver/node.js';
import type { PikeSymbol, PikeToken } from '@pike-lsp/pike-bridge';
import { PatternHelpers } from '../../utils/regex-patterns.js';
import { Logger } from '@pike-lsp/core';

const log = new Logger('symbol-index');

/**
 * Flatten nested symbol tree into a single-level array.
 * This ensures all class members are indexed at the document level.
 */
export function flattenSymbols(symbols: PikeSymbol[], parentName = ''): PikeSymbol[] {
    const flat: PikeSymbol[] = [];

    for (const sym of symbols) {
        // Add the symbol itself
        flat.push(sym);

        // Recursively flatten children with qualified names
        if (sym.children && sym.children.length > 0) {
            const qualifiedPrefix = parentName ? `${parentName}.${sym.name}` : sym.name;

            for (const child of sym.children) {
                // Create a copy with qualified name for easier lookup
                const childWithQualName = {
                    ...child,
                    // Store qualified name for namespaced lookup
                    qualifiedName: `${qualifiedPrefix}.${child.name}`
                };
                flat.push(childWithQualName);

                // Recursively handle nested children
                if (child.children && child.children.length > 0) {
                    flat.push(...flattenSymbols(child.children, qualifiedPrefix));
                }
            }
        }
    }

    return flat;
}

/**
 * Build symbol position index for O(1) lookups.
 * PERF-001: Uses Pike tokenization for accuracy and performance
 * PERF-004: Reuses tokens from analyze() to avoid separate findOccurrences() IPC call
 */
export async function buildSymbolPositionIndex(
    text: string,
    symbols: PikeSymbol[],
    tokens?: PikeToken[],
    bridge?: { isRunning: () => boolean; findOccurrences: (text: string) => Promise<{ occurrences: Array<{ text: string; line: number; character: number }> }> }
): Promise<Map<string, Position[]>> {
    const index = new Map<string, Position[]>();

    // Build set of symbol names we care about AND map to definition lines
    const symbolNames = new Set<string>();
    const definitionLines = new Map<string, number>(); // symbol name -> definition line

    for (const symbol of symbols) {
        if (symbol.name) {
            symbolNames.add(symbol.name);
            // Track definition line to exclude from reference count
            // Parse symbols have .line, introspection symbols have .position?.line
            const defLine = (symbol as { line?: number; position?: { line?: number } }).line ?? symbol.position?.line;
            if (defLine !== undefined) {
                definitionLines.set(symbol.name, defLine);
            }
        }
    }

    // PERF-004: Use tokens from analyze() when available (no additional IPC)
    // Tokens now include character positions (computed in Pike, faster than JS string search)
    if (tokens && tokens.length > 0) {
        const lines = text.split('\n');

        // Filter tokens for our symbols and build positions
        for (const token of tokens) {
            if (symbolNames.has(token.text)) {
                const lineIdx = token.line - 1; // Convert to 0-indexed

                // Skip if character position is not available (-1)
                if (token.character < 0) {
                    continue;
                }

                // Skip tokens at the definition line (don't count definition as reference)
                const defLine = definitionLines.get(token.text);
                if (defLine !== undefined && token.line === defLine) {
                    continue; // This is the definition, not a reference
                }

                if (lineIdx >= 0 && lineIdx < lines.length) {
                    const line = lines[lineIdx];
                    if (!line) continue;

                    // Verify word boundary (still needed for accuracy)
                    const beforeChar = token.character > 0 ? line[token.character - 1]! : ' ';
                    const afterChar = token.character + token.text.length < line.length
                        ? line[token.character + token.text.length]!
                        : ' ';

                    if (!/\w/.test(beforeChar) && !/\w/.test(afterChar)) {
                        const pos: Position = {
                            line: lineIdx,
                            character: token.character,
                        };

                        if (!index.has(token.text)) {
                            index.set(token.text, []);
                        }
                        index.get(token.text)!.push(pos);
                    }
                }
            }
        }

        if (index.size > 0) {
            return index;
        }
    }

    // PERF-001: Fallback to findOccurrences IPC call if tokens not available
    if (bridge?.isRunning()) {
        try {
            const result = await bridge.findOccurrences(text);

            // Group occurrences by symbol name
            for (const occ of result.occurrences) {
                if (symbolNames.has(occ.text)) {
                    // Skip definition line (don't count definition as reference)
                    const defLine = definitionLines.get(occ.text);
                    if (defLine !== undefined && occ.line === defLine) {
                        continue;
                    }

                    const pos: Position = {
                        line: occ.line - 1, // Convert 1-indexed to 0-indexed
                        character: occ.character,
                    };

                    if (!index.has(occ.text)) {
                        index.set(occ.text, []);
                    }
                    index.get(occ.text)!.push(pos);
                }
            }

            // If we found all our symbols, return early
            if (index.size === symbolNames.size) {
                return index;
            }
        } catch (err) {
            // Log error details before falling back to regex
            log.error('Token-based symbol position finding failed', { error: err instanceof Error ? err.message : String(err) });
        }
    }

    // Fallback: Regex-based search (original implementation)
    return buildSymbolPositionIndexRegex(text, symbols);
}

/**
 * Fallback regex-based symbol position finding.
 * Used when Pike tokenization is unavailable.
 */
export function buildSymbolPositionIndexRegex(text: string, symbols: PikeSymbol[]): Map<string, Position[]> {
    const index = new Map<string, Position[]>();
    const lines = text.split('\n');

    // Helper to check if position is inside comment
    const isInsideComment = (line: string, charPos: number): boolean => {
        const trimmed = line.trimStart();
        if (PatternHelpers.isCommentLine(trimmed)) {
            return true;
        }
        const lineCommentPos = line.indexOf('//');
        if (lineCommentPos >= 0 && lineCommentPos < charPos) {
            return true;
        }
        const blockOpenPos = line.lastIndexOf('/*', charPos);
        if (blockOpenPos >= 0) {
            const blockClosePos = line.indexOf('*/', blockOpenPos);
            if (blockClosePos < 0 || blockClosePos > charPos) {
                return true;
            }
        }
        return false;
    };

    // Index all symbol names and their positions
    for (const symbol of symbols) {
        // Skip symbols with null names (can occur with certain Pike constructs)
        if (!symbol.name) {
            continue;
        }

        const positions: Position[] = [];

        // Search for all occurrences of the symbol name
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            if (!line) continue;

            let searchStart = 0;
            let matchIndex: number;

            while ((matchIndex = line.indexOf(symbol.name, searchStart)) !== -1) {
                const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                const afterChar = matchIndex + symbol.name.length < line.length ?
                    line[matchIndex + symbol.name.length] : ' ';

                // Check for word boundary
                if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                    // Skip comments
                    if (!isInsideComment(line, matchIndex)) {
                        // Skip definition line (don't count definition as reference)
                        // Parse symbols have .line, introspection symbols have .position?.line
                        const defLine = (symbol as { line?: number; position?: { line?: number } }).line ?? symbol.position?.line;
                        if (defLine !== undefined && (lineNum + 1) === defLine) {
                            searchStart = matchIndex + 1;
                            continue;
                        }

                        positions.push({
                            line: lineNum,
                            character: matchIndex,
                        });
                    }
                }
                searchStart = matchIndex + 1;
            }
        }

        if (positions.length > 0) {
            index.set(symbol.name, positions);
        }
    }

    return index;
}
