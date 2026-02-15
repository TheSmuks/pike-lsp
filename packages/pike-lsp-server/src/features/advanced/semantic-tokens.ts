/**
 * Semantic Tokens Handler
 *
 * Provides rich syntax highlighting for Pike code.
 */

import {
    Connection,
    SemanticTokensBuilder,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { PatternHelpers } from '../../utils/regex-patterns.js';
import { Logger } from '@pike-lsp/core';

// Semantic tokens legend (shared with server.ts)
const tokenTypes = [
    'namespace', 'type', 'class', 'enum', 'interface',
    'struct', 'typeParameter', 'parameter', 'variable', 'property',
    'enumMember', 'event', 'function', 'method', 'macro',
    'keyword', 'modifier', 'comment', 'string', 'number',
    'regexp', 'operator', 'decorator'
];
const tokenModifiers = [
    'declaration', 'definition', 'readonly', 'static',
    'deprecated', 'abstract', 'async', 'modification',
    'documentation', 'defaultLibrary'
];

/**
 * Register semantic tokens handler.
 */
export function registerSemanticTokensHandler(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { documentCache } = services;
    const log = new Logger('Advanced');

    /**
     * Semantic Tokens - provide rich syntax highlighting
     */
    connection.languages.semanticTokens.on((params) => {
        log.debug('Semantic tokens request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                return { data: [] };
            }

            const builder = new SemanticTokensBuilder();
            const text = document.getText();
            const lines = text.split('\n');

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

            const isInsideString = (line: string, charPos: number): boolean => {
                let inString = false;
                let escaped = false;
                for (let i = 0; i < charPos; i++) {
                    if (escaped) {
                        escaped = false;
                        continue;
                    }
                    if (line[i] === '\\') {
                        escaped = true;
                        continue;
                    }
                    if (line[i] === '"') {
                        inString = !inString;
                    }
                }
                return inString;
            };

            const declarationBit = 1 << tokenModifiers.indexOf('declaration');
            const readonlyBit = 1 << tokenModifiers.indexOf('readonly');
            const staticBit = 1 << tokenModifiers.indexOf('static');
            const deprecatedBit = 1 << tokenModifiers.indexOf('deprecated');

            for (const symbol of cached.symbols) {
                if (!symbol.name) continue;

                let tokenType = tokenTypes.indexOf('variable');
                let declModifiers = declarationBit;

                // PERF-104: Check modifiers array once
                const hasModifier = (mod: string) => symbol.modifiers && symbol.modifiers.includes(mod);

                if (hasModifier('static')) {
                    declModifiers |= staticBit;
                }

                // Issue #104: Add deprecated modifier support
                if (hasModifier('deprecated')) {
                    declModifiers |= deprecatedBit;
                }

                switch (symbol.kind) {
                    case 'class':
                        tokenType = tokenTypes.indexOf('class');
                        break;
                    case 'method':
                        tokenType = tokenTypes.indexOf('method');
                        break;
                    case 'variable':
                        tokenType = tokenTypes.indexOf('variable');
                        break;
                    case 'constant':
                        tokenType = tokenTypes.indexOf('property');
                        declModifiers |= readonlyBit;
                        break;
                    case 'enum':
                        tokenType = tokenTypes.indexOf('enum');
                        break;
                    case 'enum_constant':
                        tokenType = tokenTypes.indexOf('enumMember');
                        declModifiers |= readonlyBit;
                        break;
                    case 'typedef':
                        tokenType = tokenTypes.indexOf('type');
                        break;
                    case 'module':
                        tokenType = tokenTypes.indexOf('namespace');
                        break;
                    case 'import':
                        tokenType = tokenTypes.indexOf('namespace');
                        break;
                    case 'inherit':
                        tokenType = tokenTypes.indexOf('class');
                        break;
                    case 'include':
                        tokenType = tokenTypes.indexOf('namespace');
                        break;
                    default:
                        continue;
                }

                const symbolRegex = PatternHelpers.wholeWordPattern(symbol.name);

                // PERF-104: Limit search to lines near symbol declaration for better performance
                // Search all lines for global symbols, but only nearby lines for local declarations
                const declLine = symbol.position ? symbol.position.line - 1 : -1;
                const searchRadius = 50; // Search 50 lines before/after declaration

                for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                    const line = lines[lineNum];
                    if (!line) continue;

                    // PERF-104: Skip lines far from declaration for non-global symbols
                    // This reduces O(n*m) to O(n*k) where k is search radius
                    if (declLine >= 0 && Math.abs(lineNum - declLine) > searchRadius) {
                        continue;
                    }

                    let match: RegExpExecArray | null;
                    while ((match = symbolRegex.exec(line)) !== null) {
                        const matchIndex = match.index;

                        if (isInsideComment(line, matchIndex) || isInsideString(line, matchIndex)) {
                            continue;
                        }

                        const isDeclaration = symbol.position &&
                            (symbol.position.line - 1) === lineNum;

                        const modifiers = isDeclaration ? declModifiers : 0;

                        builder.push(lineNum, matchIndex, symbol.name.length, tokenType, modifiers);
                    }
                }
            }

            return builder.build();
        } catch (err) {
            log.error('Semantic tokens failed', { error: err instanceof Error ? err.message : String(err) });
            return { data: [] };
        }
    });
}
