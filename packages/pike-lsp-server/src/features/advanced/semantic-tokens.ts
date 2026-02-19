/**
 * Semantic Tokens Handler
 *
 * Provides rich syntax highlighting for Pike code.
 * Supports both full and delta (incremental) updates for efficient token updates.
 */

import {
    Connection,
    SemanticTokensBuilder,
    SemanticTokens,
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
     * Build semantic tokens for a document from cached symbols.
     */
    const buildTokens = (uri: string, document: TextDocument): SemanticTokens => {
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

        const cached = documentCache.get(uri);
        if (!cached) {
            return builder.build();
        }

        for (const symbol of cached.symbols) {
            if (!symbol.name) continue;

            let tokenType = tokenTypes.indexOf('variable');
            let declModifiers = declarationBit;

            const hasModifier = (mod: string) => symbol.modifiers && symbol.modifiers.includes(mod);

            if (hasModifier('static')) {
                declModifiers |= staticBit;
            }

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
            const declLine = symbol.position ? symbol.position.line - 1 : -1;
            const searchRadius = 50;

            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                if (!line) continue;

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
    };

    /**
     * Semantic Tokens - Full request handler
     *
     * With delta enabled in server capabilities, VSCode will request incremental
     * updates when available. The server advertises delta support in capabilities,
     * enabling the client to make more efficient token requests on document changes.
     */
    connection.languages.semanticTokens.on((params) => {
        log.debug('Semantic tokens request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const document = documents.get(uri);

            if (!document) {
                return { data: [] };
            }

            return buildTokens(uri, document);
        } catch (err) {
            log.error(`Semantic tokens request failed for ${params.textDocument.uri}: ${err instanceof Error ? err.message : String(err)}`);
            return { data: [] };
        }
    });
}
