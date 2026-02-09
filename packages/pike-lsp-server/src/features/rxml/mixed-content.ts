/**
 * Mixed Pike + RXML Content Detection Strategy
 *
 * Phase 4 Design: Detect and parse RXML content embedded in Pike multiline strings
 *
 * Per ADR-001: Use Parser.Pike.split() for all Pike code parsing
 * Per ADR-002: Target Pike 8.0.1116 - use String.trim_all_whites()
 *
 * DESIGN SUMMARY:
 * ---------------
 * This module provides utilities to:
 * 1. Detect RXML string literals in Pike code (multiline #"..."...)
 * 2. Extract position ranges of RXML strings
 * 3. Apply RXML parsing only within those ranges
 * 4. Merge Pike and RXML symbols into combined tree
 *
 * ARCHITECTURE:
 * -------------
 * TypeScript Layer (this file):
 * - Position mapping between document offsets and Pike parser offsets
 * - Symbol tree merging (Pike symbols + RXML symbols)
 * - Context-aware completion routing (Pike vs RXML based on cursor position)
 *
 * Pike Layer (LSP.pmod/Roxen.pmod/MixedContent.pike):
 * - Extract multiline string literals using Parser.Pike.split()
 * - Identify RXML content heuristics (<roxen>, <set>, <emit>, etc.)
 * - Return string ranges with position information
 *
 * BRIDGE LAYER:
 * - New method: bridge.roxenExtractRXMLStrings(code, uri)
 * - Returns: Array<{content, range}> where range is {start, end} in LSP Position format
 *
 * ============================================================================
 */

import type {
    Position,
    Range,
    DocumentSymbol,
    // @ts-ignore - SymbolKind imported but not used yet (Phase 4)
    SymbolKind
} from 'vscode-languageserver/node.js';
// @ts-ignore - PikeSymbol imported but not used yet (Phase 4)
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

/**
 * RXML string literal found in Pike code
 *
 * Represents a multiline string literal that may contain RXML content.
 * Positions are in LSP format (0-indexed lines, 0-indexed characters).
 */
export interface RXMLStringLiteral {
    /** The RXML content extracted from the string literal */
    content: string;

    /** Range of the string literal content (excluding quotes) in the document */
    range: Range;

    /** Range including the opening #" and closing " quotes */
    fullRange: Range;

    /** Confidence score (0-1) that this contains RXML */
    confidence: number;

    /** Detected RXML markers found in content */
    markers: RXMLMarker[];
}

/**
 * RXML marker pattern detected in string content
 */
export interface RXMLMarker {
    /** Marker type */
    type: 'tag' | 'entity' | 'directive';

    /** Marker name (e.g., "roxen", "set", "emit") */
    name: string;

    /** Position of marker within the RXML string content */
    position: Position;
}

/**
 * Result of RXML string detection
 */
export interface RXMLDetectionResult {
    /** All detected RXML string literals */
    strings: RXMLStringLiteral[];

    /** Combined symbol tree (Pike + RXML symbols) */
    symbols: DocumentSymbol[];

    /** RXML-specific diagnostics */
    diagnostics: RXMLDiagnostic[];
}

/**
 * RXML diagnostic (error/warning in RXML content)
 */
export interface RXMLDiagnostic {
    severity: 'error' | 'warning' | 'info';
    message: string;
    range: Range;
    code?: string;
}

/**
 * Position mapping between document and extracted content
 *
 * When we extract RXML strings, we need to map positions back to the original
 * document for diagnostics, symbols, and completions.
 */
export interface PositionMapping {
    /** Original document range */
    documentRange: Range;

    /** Offset within the extracted RXML string */
    contentOffset: number;

    /** Line offset (document line - content line) */
    lineOffset: number;

    /** Character offset within the first line */
    characterOffset: number;
}

/**
 * Detect RXML string literals in Pike code
 *
 * This is a TypeScript-side helper that calls the Pike bridge to do the
 * actual parsing (per ADR-001: Parser.Pike.split() must be used).
 *
 * @param code - Full Pike source code
 * @param uri - Document URI
 * @param bridge - Pike bridge instance
 * @returns Promise<RXMLStringLiteral[]> - Detected RXML strings
 */
export async function detectRXMLStrings(
    code: string,
    uri: string,
    bridge: unknown // TODO: Type as PikeBridge when implemented
): Promise<RXMLStringLiteral[]> {
    // Call Pike-side method: roxenExtractRXMLStrings()
    // This uses Parser.Pike.split() to find multiline string literals

    const result = await (bridge as any).roxenExtractRXMLStrings(code, uri);

    if (!result || !result.strings) {
        return [];
    }

    // Transform Pike-side results to TypeScript types
    return result.strings.map((s: any) => ({
        content: s.content,
        range: {
            start: {
                line: s.range.start.line - 1, // Convert 1-indexed to 0-indexed
                character: s.range.start.column - 1
            },
            end: {
                line: s.range.end.line - 1,
                character: s.range.end.column - 1
            }
        },
        fullRange: {
            start: {
                line: s.fullRange.start.line - 1,
                character: s.fullRange.start.column - 1
            },
            end: {
                line: s.fullRange.end.line - 1,
                character: s.fullRange.end.column - 1
            }
        },
        confidence: s.confidence || 0,
        markers: s.markers || []
    }));
}

/**
 * Calculate confidence score for RXML content
 *
 * Higher confidence if:
 * - Contains <roxen> tags
 * - Contains standard RXML tags (<set>, <emit>, <if>, <elseif>, <else>)
 * - Contains RXML entities (&roxen.*, &form.*, etc.)
 * - Has proper XML structure
 *
 * @param content - String literal content
 * @returns number - Confidence score (0-1)
 */
export function calculateRXMLConfidence(content: string): number {
    let confidence = 0;

    const lower = content.toLowerCase();

    // Strong indicators
    if (lower.includes('<roxen')) confidence += 0.4;
    if (lower.includes('<set ')) confidence += 0.2;
    if (lower.includes('<emit ')) confidence += 0.2;
    if (lower.includes('<if ') || lower.includes('<elseif ') || lower.includes('<else>')) {
        confidence += 0.15;
    }

    // RXML entities
    if (/\&(roxen|form|cache|config|usr)\./.test(content)) {
        confidence += 0.2;
    }

    // XML structure
    if (/<(\w+)[^>]*>.*?<\/\1>/.test(content)) {
        confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
}

/**
 * Detect RXML markers in content
 *
 * Finds tags, entities, and directives that indicate RXML content.
 *
 * @param content - RXML string content
 * @returns RXMLMarker[] - Detected markers with positions
 */
export function detectRXMLMarkers(content: string): RXMLMarker[] {
    const markers: RXMLMarker[] = [];
    const lines = content.split('\n');

    // Known RXML tags
    const rxmlTags = new Set([
        'roxen', 'set', 'emit', 'if', 'elseif', 'else', 'then', 'elseif',
        'case', 'for', 'foreach', 'apre', 'locale', 'cset', 'config',
        'cache', 'header', 'redirect', 'timeout', 'abort', 'insert',
        'doc', 'help', 'box', 'navigation', 'tablist', 'tabs', 'tab',
        'frame', 'frameset', 'noprint', 'ssl', 'crypt', 'user'
    ]);

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        if (!line) continue;

        // Detect opening tags: <tagname or </tagname
        const tagRegex = /<\/?([a-z][a-z0-9_]*)/gi;
        let match;

        while ((match = tagRegex.exec(line)) !== null) {
            if (!match[1] || match.index === undefined) continue;
            const tagName: string = match[1].toLowerCase();

            if (rxmlTags.has(tagName)) {
                markers.push({
                    type: 'tag',
                    name: tagName,
                    position: {
                        line: lineNum,
                        character: match.index
                    }
                });
            }
        }

        // Detect RXML entities: &roxen.*, &form.*, etc.
        const entityRegex = /\&([a-z][a-z0-9_]*)\./gi;

        while ((match = entityRegex.exec(line)) !== null) {
            if (!match[1] || match.index === undefined) continue;
            const entityPrefix: string = match[1].toLowerCase();

            if (['roxen', 'form', 'cache', 'config', 'usr', 'page', 'client'].includes(entityPrefix)) {
                markers.push({
                    type: 'entity',
                    name: entityPrefix,
                    position: {
                        line: lineNum,
                        character: match.index
                    }
                });
            }
        }
    }

    return markers;
}

/**
 * Map position from RXML content to document position
 *
 * When we have a position within the extracted RXML string, we need to
 * map it back to the original document position for diagnostics, symbols, etc.
 *
 * @param position - Position within RXML content
 * @param mapping - Position mapping info
 * @returns Position - Position in original document
 */
export function mapContentToDocumentPosition(
    position: Position,
    mapping: PositionMapping
): Position {
    return {
        line: position.line + mapping.lineOffset,
        character: position.line === 0
            ? position.character + mapping.characterOffset
            : position.character
    };
}

/**
 * Map position from document to RXML content position
 *
 * @param position - Position in document
 * @param rxmlString - RXML string literal info
 * @returns Position | null - Position within RXML content, or null if outside
 */
export function mapDocumentToContentPosition(
    position: Position,
    rxmlString: RXMLStringLiteral
): Position | null {
    const { range } = rxmlString;

    // Check if position is within the RXML string range
    if (
        position.line < range.start.line ||
        position.line > range.end.line ||
        (position.line === range.start.line && position.character < range.start.character) ||
        (position.line === range.end.line && position.character > range.end.character)
    ) {
        return null;
    }

    // Calculate offset within the content
    const lineOffset = position.line - range.start.line;

    return {
        line: lineOffset,
        character: lineOffset === 0
            ? position.character - range.start.character
            : position.character
    };
}

/**
 * Merge Pike and RXML symbol trees
 *
 * Creates a unified symbol tree that includes both Pike symbols and
 * RXML symbols extracted from string literals. RXML symbols are nested
 * under their parent string literal location.
 *
 * @param pikeSymbols - Symbols from Pike parsing
 * @param rxmlStrings - Detected RXML strings with their symbols
 * @returns DocumentSymbol[] - Merged symbol tree
 */
export function mergeSymbolTrees(
    pikeSymbols: DocumentSymbol[],
    rxmlStrings: RXMLStringLiteral[]
): DocumentSymbol[] {
    const result: DocumentSymbol[] = [...pikeSymbols];

    // For each RXML string, add a container symbol
    for (const rxmlString of rxmlStrings) {
        if (rxmlString.confidence < 0.3) {
            continue; // Skip low-confidence strings
        }

        // Create a "RXML Content" symbol at the string literal location
        const rxmlSymbol: DocumentSymbol = {
            name: 'RXML Template',
            kind: 16, // SymbolKind.Namespace (container for RXML symbols)
            range: rxmlString.range,
            selectionRange: rxmlString.range,
            detail: `${rxmlString.markers.length} RXML markers`,
            children: []
        };

        // Add detected markers as children
        for (const marker of rxmlString.markers) {
            const markerSymbol: DocumentSymbol = {
                name: marker.name,
                kind: marker.type === 'tag' ? 5 : 13, // Tag = Method, Entity = Constant
                range: {
                    start: mapContentToDocumentPosition(marker.position, {
                        documentRange: rxmlString.range,
                        contentOffset: 0,
                        lineOffset: rxmlString.range.start.line,
                        characterOffset: rxmlString.range.start.character
                    }),
                    end: {
                        line: marker.position.line + rxmlString.range.start.line,
                        character: marker.position.character + marker.name.length + rxmlString.range.start.character
                    }
                },
                selectionRange: {
                    start: mapContentToDocumentPosition(marker.position, {
                        documentRange: rxmlString.range,
                        contentOffset: 0,
                        lineOffset: rxmlString.range.start.line,
                        characterOffset: rxmlString.range.start.character
                    }),
                    end: {
                        line: marker.position.line + rxmlString.range.start.line,
                        character: marker.position.character + marker.name.length + rxmlString.range.start.character
                    }
                },
                detail: marker.type
            };

            rxmlSymbol.children!.push(markerSymbol);
        }

        result.push(rxmlSymbol);
    }

    return result;
}

/**
 * Determine if cursor position is within an RXML string
 *
 * Used for context-aware completion: if cursor is in RXML string,
 * provide RXML tag/attribute completions; otherwise provide Pike completions.
 *
 * @param position - Cursor position in document
 * @param rxmlStrings - Detected RXML strings
 * @returns RXMLStringLiteral | null - The RXML string containing position, or null
 */
export function findRXMLStringAtPosition(
    position: Position,
    rxmlStrings: RXMLStringLiteral[]
): RXMLStringLiteral | null {
    for (const rxmlString of rxmlStrings) {
        const { range } = rxmlString;

        if (
            position.line >= range.start.line &&
            position.line <= range.end.line &&
            (position.line > range.start.line || position.character >= range.start.character) &&
            (position.line < range.end.line || position.character <= range.end.character)
        ) {
            return rxmlString;
        }
    }

    return null;
}

/**
 * Create position mapping for an RXML string
 *
 * @param rxmlString - RXML string literal info
 * @returns PositionMapping - Mapping info
 */
export function createPositionMapping(
    rxmlString: RXMLStringLiteral
): PositionMapping {
    return {
        documentRange: rxmlString.range,
        contentOffset: 0,
        lineOffset: rxmlString.range.start.line,
        characterOffset: rxmlString.range.start.character
    };
}

// ============================================================================
// PIKE-SIDE INTEGRATION NOTES
// ============================================================================
//
// The following Pike-side methods need to be implemented in:
// pike-scripts/LSP.pmod/Roxen.pmod/MixedContent.pike
//
// mixed roxen_extract_rxml_strings(mapping params) {
//     string code = params->code || "";
//     string filename = params->filename || "input.pike";
//
//     array(mixed) tokens = Parser.Pike.split(code);
//     array(strings) results = ({});
//
//     // Look for multiline string literals: #"..."
//     // Pattern: #" followed by content until closing "
//     int in_string = 0;
//     int string_start = 0;
//     int string_start_line = 0;
//     int string_start_col = 0;
//     string current_string = "";
//
//     for (int i = 0; i < sizeof(tokens); i++) {
//         mixed token = tokens[i];
//
//         if (stringp(token)) {
//             if (token == #"") {
//                 // Start of multiline string
//                 in_string = 1;
//                 string_start = i;
//                 // Track position using find_token_position()
//             } else if (in_string && token == "\"") {
//                 // End of multiline string
//                 in_string = 0;
//
//                 // Calculate confidence
//                 int confidence = calculate_rxml_confidence(current_string);
//
//                 if (confidence > 0.3) {
//                     results += ({
//                         ([
//                             "content": current_string,
//                             "range": ([...]),
//                             "fullRange": ([...]),
//                             "confidence": confidence,
//                             "markers": detect_rxml_markers(current_string)
//                         ])
//                     });
//                 }
//
//                 current_string = "";
//             } else if (in_string) {
//                 current_string += token;
//             }
//         }
//     }
//
//     return (["result": (["strings": results])]);
// }
//
// PER ADR-001: Must use Parser.Pike.split() for tokenization
// PER ADR-002: Must use String.trim_all_whites() for whitespace
//
// ============================================================================
