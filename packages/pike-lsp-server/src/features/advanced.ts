/**
 * Advanced Feature Handlers
 *
 * Groups advanced LSP feature handlers:
 * - Folding Range: code folding regions
 * - Semantic Tokens: rich syntax highlighting
 * - Inlay Hints: parameter names and type hints
 * - Selection Ranges: smart selection expansion
 * - Code Actions: quick fixes and refactorings
 * - Document Formatting: code formatting
 * - Document Links: clickable file paths
 * - Code Lens: reference counts and quick actions
 *
 * Each handler includes try/catch with logging fallback (SRV-12).
 */

import {
    Connection,
    FoldingRange,
    FoldingRangeKind,
    SemanticTokensBuilder,
    InlayHint,
    InlayHintKind,
    SelectionRange,
    CodeAction,
    CodeActionKind,
    TextEdit,
    Position,
    DocumentLink,
    CodeLens,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import * as path from 'path';
import * as fsSync from 'fs';

import type { Services } from '../services/index.js';
import { INDENT_PATTERNS, PatternHelpers } from '../utils/regex-patterns.js';
import { buildCodeLensCommand } from '../utils/code-lens.js';
import { Logger } from '@pike-lsp/core';
import type { PikeSettings } from '../core/types.js';
import type { DocumentCache } from '../services/document-cache.js';

// Semantic tokens legend (shared with server.ts, will be refactored later)
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
 * Register all advanced feature handlers with the LSP connection.
 *
 * @param connection - LSP connection
 * @param services - Bundle of server services
 * @param documents - TextDocuments manager for LSP document synchronization
 * @param globalSettings - Current global settings (mutable)
 * @param includePaths - Include paths for module resolution (mutable)
 */
export function registerAdvancedHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>,
    _globalSettings: PikeSettings,
    includePaths: string[]
): void {
    const { documentCache } = services;
    const log = new Logger('Advanced');

    // Code lens cache: URI -> { version, lenses }
    // Prevents regenerating lenses when switching tabs if document hasn't changed
    const codeLensCache = new Map<string, { version: number; lenses: CodeLens[] }>();

    /**
     * Folding Range - provide collapsible regions
     */
    connection.onFoldingRanges((params): FoldingRange[] | null => {
        log.debug('Folding ranges request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const document = documents.get(uri);

            if (!document) {
                return null;
            }

            const text = document.getText();
            const lines = text.split('\n');
            const foldingRanges: FoldingRange[] = [];

            const braceStack: { line: number; kind: FoldingRangeKind | undefined }[] = [];
            let commentStart: number | null = null;
            let inBlockComment = false;

            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum] ?? '';
                const trimmed = line.trim();

                if (!inBlockComment && trimmed.startsWith('/*')) {
                    commentStart = lineNum;
                    inBlockComment = true;
                }
                if (inBlockComment && trimmed.includes('*/')) {
                    if (commentStart !== null && lineNum > commentStart) {
                        foldingRanges.push({
                            startLine: commentStart,
                            endLine: lineNum,
                            kind: FoldingRangeKind.Comment,
                        });
                    }
                    inBlockComment = false;
                    commentStart = null;
                }

                if (trimmed.startsWith('//!')) {
                    if (commentStart === null) {
                        commentStart = lineNum;
                    }
                } else if (commentStart !== null && !trimmed.startsWith('//!') && !inBlockComment) {
                    if (lineNum - 1 > commentStart) {
                        foldingRanges.push({
                            startLine: commentStart,
                            endLine: lineNum - 1,
                            kind: FoldingRangeKind.Comment,
                        });
                    }
                    commentStart = null;
                }

                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '{') {
                        let kind: FoldingRangeKind | undefined;
                        if (trimmed.startsWith('class ') || trimmed.startsWith('inherit ')) {
                            kind = FoldingRangeKind.Region;
                        }
                        braceStack.push({ line: lineNum, kind });
                    } else if (char === '}') {
                        const start = braceStack.pop();
                        if (start && lineNum > start.line) {
                            const range: FoldingRange = {
                                startLine: start.line,
                                endLine: lineNum,
                            };
                            if (start.kind) {
                                range.kind = start.kind;
                            }
                            foldingRanges.push(range);
                        }
                    }
                }
            }

            return foldingRanges.length > 0 ? foldingRanges : null;
        } catch (err) {
            log.error('Folding ranges failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });

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

            for (const symbol of cached.symbols) {
                if (!symbol.name) continue;

                let tokenType = tokenTypes.indexOf('variable');
                let declModifiers = declarationBit;

                const isStatic = symbol.modifiers && symbol.modifiers.includes('static');
                if (isStatic) {
                    declModifiers |= staticBit;
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
                    default:
                        continue;
                }

                const symbolRegex = PatternHelpers.wholeWordPattern(symbol.name);

                for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                    const line = lines[lineNum];
                    if (!line) continue;

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

    /**
     * Inlay Hints - show parameter names and type hints
     */
    connection.languages.inlayHint.on((params): InlayHint[] | null => {
        log.debug('Inlay hints request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                return null;
            }

            const hints: InlayHint[] = [];
            const text = document.getText();

            const methods = cached.symbols.filter(s => s.kind === 'method');

            for (const method of methods) {
                const methodRec = method as unknown as Record<string, unknown>;
                const argNames = methodRec['argNames'] as string[] | undefined;
                if (!argNames || argNames.length === 0) continue;

                const callPattern = PatternHelpers.functionCallPattern(method.name);
                let match;

                while ((match = callPattern.exec(text)) !== null) {
                    const callStart = match.index + match[0].length;

                    let parenDepth = 1;
                    let argIndex = 0;
                    let currentArgStart = callStart;

                    for (let i = callStart; i < text.length && parenDepth > 0; i++) {
                        const char = text[i];

                        if (char === '(') {
                            parenDepth++;
                        } else if (char === ')') {
                            parenDepth--;
                            if (parenDepth === 0) {
                                const argText = text.slice(currentArgStart, i).trim();
                                if (argText && argIndex < argNames.length) {
                                    const argPos = document.positionAt(currentArgStart);
                                    hints.push({
                                        position: argPos,
                                        label: `${argNames[argIndex]}:`,
                                        kind: InlayHintKind.Parameter,
                                        paddingRight: true,
                                    });
                                }
                            }
                        } else if (char === ',' && parenDepth === 1) {
                            const argText = text.slice(currentArgStart, i).trim();
                            if (argText && argIndex < argNames.length) {
                                const argPos = document.positionAt(currentArgStart);
                                hints.push({
                                    position: argPos,
                                    label: `${argNames[argIndex]}:`,
                                    kind: InlayHintKind.Parameter,
                                    paddingRight: true,
                                });
                            }
                            argIndex++;
                            currentArgStart = i + 1;
                        }
                    }
                }
            }

            return hints.length > 0 ? hints : null;
        } catch (err) {
            log.error('Inlay hints failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });

    /**
     * Selection Range - smart selection expansion
     */
    connection.onSelectionRanges((params): SelectionRange[] | null => {
        log.debug('Selection ranges request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const document = documents.get(uri);

            if (!document) {
                return null;
            }

            const text = document.getText();
            const results: SelectionRange[] = [];

            for (const position of params.positions) {
                const offset = document.offsetAt(position);

                let wordStart = offset;
                let wordEnd = offset;
                while (wordStart > 0 && /\w/.test(text[wordStart - 1] ?? '')) {
                    wordStart--;
                }
                while (wordEnd < text.length && /\w/.test(text[wordEnd] ?? '')) {
                    wordEnd++;
                }

                let lineStart = offset;
                while (lineStart > 0 && text[lineStart - 1] !== '\n') {
                    lineStart--;
                }
                let lineEnd = offset;
                while (lineEnd < text.length && text[lineEnd] !== '\n') {
                    lineEnd++;
                }

                const wordRange: SelectionRange = {
                    range: {
                        start: document.positionAt(wordStart),
                        end: document.positionAt(wordEnd),
                    },
                };

                const lineRange: SelectionRange = {
                    range: {
                        start: document.positionAt(lineStart),
                        end: document.positionAt(lineEnd),
                    },
                    parent: wordRange,
                };

                const docRange: SelectionRange = {
                    range: {
                        start: { line: 0, character: 0 },
                        end: document.positionAt(text.length),
                    },
                    parent: lineRange,
                };

                wordRange.parent = lineRange;
                lineRange.parent = docRange;

                results.push(wordRange);
            }

            return results.length > 0 ? results : null;
        } catch (err) {
            log.error('Selection ranges failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });

    /**
     * Code Action handler - provide quick fixes and refactorings
     */
    connection.onCodeAction((params): CodeAction[] => {
        log.debug('Code action request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const document = documents.get(uri);
            const cached = documentCache.get(uri);

            if (!document || !cached) {
                return [];
            }

            const actions: CodeAction[] = [];
            const text = document.getText();
            const lines = text.split('\n');

            const startLine = params.range.start.line;
            const lineText = lines[startLine] ?? '';
            const trimmed = lineText.trim();

            if (trimmed.startsWith('inherit') || trimmed.startsWith('import') ||
                trimmed.startsWith('#include')) {

                const importLines: { line: number; text: string; type: string }[] = [];
                for (let i = 0; i < lines.length; i++) {
                    const lt = (lines[i] ?? '').trim();
                    if (lt.startsWith('inherit ')) {
                        importLines.push({ line: i, text: lines[i] ?? '', type: 'inherit' });
                    } else if (lt.startsWith('import ')) {
                        importLines.push({ line: i, text: lines[i] ?? '', type: 'import' });
                    } else if (lt.startsWith('#include ')) {
                        importLines.push({ line: i, text: lines[i] ?? '', type: 'include' });
                    }
                }

                if (importLines.length > 1) {
                    const sorted = [...importLines].sort((a, b) => {
                        const typeOrder = { include: 0, import: 1, inherit: 2 };
                        const typeA = typeOrder[a.type as keyof typeof typeOrder] ?? 3;
                        const typeB = typeOrder[b.type as keyof typeof typeOrder] ?? 3;
                        if (typeA !== typeB) return typeA - typeB;
                        return a.text.localeCompare(b.text);
                    });

                    const needsSort = importLines.some((item, i) => item.text !== sorted[i]?.text);

                    if (needsSort) {
                        const edits: TextEdit[] = [];
                        for (let i = 0; i < importLines.length; i++) {
                            const original = importLines[i];
                            const replacement = sorted[i];
                            if (original && replacement && original.text !== replacement.text) {
                                edits.push({
                                    range: {
                                        start: { line: original.line, character: 0 },
                                        end: { line: original.line, character: original.text.length }
                                    },
                                    newText: replacement.text
                                });
                            }
                        }

                        if (edits.length > 0) {
                            actions.push({
                                title: 'Organize Imports',
                                kind: CodeActionKind.SourceOrganizeImports,
                                edit: {
                                    changes: {
                                        [uri]: edits
                                    }
                                }
                            });
                        }
                    }
                }
            }

            for (const diag of params.context.diagnostics) {
                if (diag.message.includes('syntax error') || diag.message.includes('expected')) {
                    const diagLine = lines[diag.range.start.line] ?? '';
                    if (!diagLine.trim().endsWith(';') && !diagLine.trim().endsWith('{') &&
                        !diagLine.trim().endsWith('}')) {
                        actions.push({
                            title: 'Add missing semicolon',
                            kind: CodeActionKind.QuickFix,
                            diagnostics: [diag],
                            edit: {
                                changes: {
                                    [uri]: [{
                                        range: {
                                            start: { line: diag.range.start.line, character: diagLine.length },
                                            end: { line: diag.range.start.line, character: diagLine.length }
                                        },
                                        newText: ';'
                                    }]
                                }
                            }
                        });
                    }
                }
            }

            return actions;
        } catch (err) {
            log.error('Code action failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * Document Formatting handler - format entire document
     */
    connection.onDocumentFormatting((params): TextEdit[] => {
        log.debug('Document formatting request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const document = documents.get(uri);

            if (!document) {
                return [];
            }

            const text = document.getText();
            const options = params.options;
            const tabSize = options.tabSize ?? 4;
            const insertSpaces = options.insertSpaces ?? true;
            const indent = insertSpaces ? ' '.repeat(tabSize) : '\t';

            return formatPikeCode(text, indent);
        } catch (err) {
            log.error('Document formatting failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * Range Formatting handler - format selected range
     */
    connection.onDocumentRangeFormatting((params): TextEdit[] => {
        log.debug('Range formatting request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const document = documents.get(uri);

            if (!document) {
                return [];
            }

            const text = document.getText();
            const options = params.options;
            const tabSize = options.tabSize ?? 4;
            const insertSpaces = options.insertSpaces ?? true;
            const indent = insertSpaces ? ' '.repeat(tabSize) : '\t';

            const lines = text.split('\n');
            const startLine = params.range.start.line;
            const endLine = params.range.end.line;

            const rangeText = lines.slice(startLine, endLine + 1).join('\n');
            const formattedEdits = formatPikeCode(rangeText, indent, startLine);

            return formattedEdits;
        } catch (err) {
            log.error('Range formatting failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * Document Links handler - find clickable file paths
     */
    connection.onDocumentLinks((params): DocumentLink[] => {
        log.debug('Document links request', { uri: params.textDocument.uri });
        try {
            const document = documents.get(params.textDocument.uri);
            if (!document) {
                return [];
            }

            const links: DocumentLink[] = [];
            const text = document.getText();
            const lines = text.split('\n');
            const documentDir = _getDocumentDirectory(params.textDocument.uri);

            const inheritRegex = /inherit\s+([A-Z][\w.]*)/g;
            const includeRegex = /#include\s+"([^"]+)"/g;
            const docLinkRegex = /\/\/[!/]?\s*@(?:file|see|link):\s*([^\s]+)/g;

            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum] ?? '';

                let inheritMatch: RegExpExecArray | null;
                while ((inheritMatch = inheritRegex.exec(line)) !== null) {
                    const index = inheritMatch.index;
                    const modulePath = inheritMatch[1];
                    if (index !== undefined && modulePath) {
                        const link = resolveModulePath(modulePath, documentDir, documentCache);
                        if (link) {
                            links.push({
                                range: {
                                    start: { line: lineNum, character: index },
                                    end: { line: lineNum, character: index + modulePath.length }
                                },
                                target: link.target,
                                tooltip: link.tooltip
                            });
                        }
                    }
                }
                inheritRegex.lastIndex = 0;

                let includeMatch: RegExpExecArray | null;
                while ((includeMatch = includeRegex.exec(line)) !== null) {
                    const index = includeMatch.index;
                    const filePath = includeMatch[1];
                    if (index !== undefined && filePath) {
                        const link = resolveIncludePath(filePath, documentDir, includePaths);
                        if (link) {
                            links.push({
                                range: {
                                    start: { line: lineNum, character: index },
                                    end: { line: lineNum, character: index + filePath.length + 2 }
                                },
                                target: link.target,
                                tooltip: link.tooltip
                            });
                        }
                    }
                }
                includeRegex.lastIndex = 0;

                let docMatch: RegExpExecArray | null;
                while ((docMatch = docLinkRegex.exec(line)) !== null) {
                    const index = docMatch.index;
                    const filePath = docMatch[1];
                    if (index !== undefined && filePath) {
                        if (filePath.includes('/') || filePath.includes('.')) {
                            const link = resolveIncludePath(filePath, documentDir, includePaths);
                            if (link) {
                                links.push({
                                    range: {
                                        start: { line: lineNum, character: index },
                                        end: { line: lineNum, character: index + filePath.length }
                                    },
                                    target: link.target,
                                    tooltip: link.tooltip
                                });
                            }
                        }
                    }
                }
                docLinkRegex.lastIndex = 0;
            }

            connection.console.log(`[DOC_LINKS] Found ${links.length} links`);
            return links;
        } catch (err) {
            log.error('Document links failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * Code Lens handler - provide inline annotations
     */
    connection.onCodeLens((params): CodeLens[] => {
        log.debug('Code lens request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cache = documentCache.get(uri);

            if (!cache) {
                return [];
            }

            // Check if we have cached lenses for this document version
            const cached = codeLensCache.get(uri);
            if (cached && cached.version === cache.version) {
                log.debug('Code lens cache hit', { uri, version: cache.version });
                return cached.lenses;
            }

            const lenses: CodeLens[] = [];

            for (const symbol of cache.symbols) {
                if (symbol.kind === 'method' || symbol.kind === 'class') {
                    const line = Math.max(0, (symbol.position?.line ?? 1) - 1);
                    const char = Math.max(0, (symbol.position?.column ?? 1) - 1);
                    const symbolName = symbol.name ?? '';

                    const position: Position = { line, character: char };

                    lenses.push({
                        range: {
                            start: { line, character: char },
                            end: { line, character: char + symbolName.length }
                        },
                        data: {
                            uri,
                            symbolName,
                            kind: symbol.kind,
                            position
                        }
                    });
                }
            }

            // Cache the lenses for this document version
            codeLensCache.set(uri, { version: cache.version, lenses });

            connection.console.log(`[CODE_LENS] Generated ${lenses.length} lenses (cached for v${cache.version})`);
            return lenses;
        } catch (err) {
            log.error('Code lens failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * Code Lens resolve handler - compute reference counts
     */
    connection.onCodeLensResolve((lens): CodeLens => {
        try {
            const data = lens.data as { uri: string; symbolName: string; kind: string; position: Position };

            if (!data) {
                return lens;
            }

            let refCount = 0;

            const currentCache = documentCache.get(data.uri);
            if (currentCache && currentCache.symbolPositions) {
                const positions = currentCache.symbolPositions.get(data.symbolName);
                refCount = positions?.length ?? 0;
            }

            const entries = Array.from(documentCache.entries());
            for (const [uri, cache] of entries) {
                if (uri !== data.uri && cache.symbolPositions) {
                    const positions = cache.symbolPositions.get(data.symbolName);
                    if (positions) {
                        refCount += positions.length;
                    }
                }
            }

            lens.command = buildCodeLensCommand(refCount, data.uri, data.position);

            connection.console.log(`[CODE_LENS] Resolved lens for "${data.symbolName}": ${refCount} refs`);
            return lens;
        } catch (err) {
            log.error('Code lens resolve failed', { error: err instanceof Error ? err.message : String(err) });
            return lens;
        }
    });
}

/**
 * Format Pike code with Pike-style indentation
 */
function formatPikeCode(text: string, indent: string, startLine: number = 0): TextEdit[] {
    const lines = text.split('\n');
    const edits: TextEdit[] = [];
    let indentLevel = 0;
    let pendingIndent = false;
    let inMultilineComment = false;

    const controlKeywords = ['if', 'else', 'while', 'for', 'foreach', 'do'];

    for (let i = 0; i < lines.length; i++) {
        const originalLine = lines[i] ?? '';
        const trimmed = originalLine.trim();

        if (trimmed.length === 0) {
            if (pendingIndent) {
                pendingIndent = false;
            }
            continue;
        }

        if (trimmed.startsWith('/*')) {
            inMultilineComment = true;
        }
        if (trimmed.endsWith('*/') || trimmed.includes('*/')) {
            inMultilineComment = false;
        }

        if (inMultilineComment || trimmed.startsWith('//') || trimmed.startsWith('*')) {
            const expectedIndent = indent.repeat(indentLevel + (pendingIndent ? 1 : 0));
            const currentIndent = originalLine.match(INDENT_PATTERNS.LEADING_WHITESPACE)?.[1] ?? '';

            if (currentIndent !== expectedIndent && !trimmed.startsWith('//!')) {
                edits.push({
                    range: {
                        start: { line: startLine + i, character: 0 },
                        end: { line: startLine + i, character: currentIndent.length }
                    },
                    newText: expectedIndent
                });
            }
            continue;
        }

        let extraIndent = 0;
        if (pendingIndent) {
            extraIndent = 1;
            pendingIndent = false;
        }

        if (trimmed.startsWith('}') || trimmed.startsWith(')')) {
            indentLevel = Math.max(0, indentLevel - 1);
        }

        const expectedIndent = indent.repeat(indentLevel + extraIndent);
        const currentIndent = originalLine.match(INDENT_PATTERNS.LEADING_WHITESPACE)?.[1] ?? '';

        if (currentIndent !== expectedIndent) {
            edits.push({
                range: {
                    start: { line: startLine + i, character: 0 },
                    end: { line: startLine + i, character: currentIndent.length }
                },
                newText: expectedIndent
            });
        }

        if (trimmed.endsWith('{')) {
            indentLevel++;
        } else if (trimmed.endsWith('(')) {
            indentLevel++;
        }

        const isBracelessControl = controlKeywords.some(keyword => {
            const pattern = new RegExp(`^(}\\s*)?${keyword}\\b.*\\)$`);
            return pattern.test(trimmed) && !trimmed.endsWith('{');
        });

        if (isBracelessControl || (trimmed === 'else' || trimmed === '} else')) {
            pendingIndent = true;
        }

        const openBraces = (trimmed.match(INDENT_PATTERNS.OPEN_BRACE) ?? []).length;
        const closeBraces = (trimmed.match(INDENT_PATTERNS.CLOSE_BRACE) ?? []).length;
        const netBraces = openBraces - closeBraces;

        if (netBraces < 0 && !trimmed.startsWith('}')) {
            indentLevel = Math.max(0, indentLevel + netBraces);
        }
    }

    return edits;
}

/**
 * Resolve a module path from inherit statement to a file URI
 */
function resolveModulePath(
    modulePath: string,
    _documentDir: string,
    documentCache: DocumentCache
): { target: string; tooltip: string } | null {
    // Iterate through document cache entries
    const entries = Array.from(documentCache.keys());
    for (const uri of entries) {
        if (uri.includes(modulePath) || uri.endsWith(modulePath + '.pike') || uri.endsWith(modulePath + '.pmod')) {
            return {
                target: uri,
                tooltip: `Navigate to ${modulePath}`
            };
        }
    }
    return null;
}

/**
 * Resolve an include path to a file URI
 */
function resolveIncludePath(
    filePath: string,
    documentDir: string,
    includePaths: string[]
): { target: string; tooltip: string } | null {
    if (filePath.startsWith('/')) {
        return {
            target: `file://${filePath}`,
            tooltip: filePath
        };
    }

    const candidates = [
        path.resolve(documentDir, filePath),
        ...includePaths.map((includePath) => path.resolve(includePath, filePath))
    ];

    for (const candidate of candidates) {
        if (fsSync.existsSync(candidate)) {
            return {
                target: `file://${candidate}`,
                tooltip: filePath
            };
        }
    }

    const resolvedPath = path.resolve(documentDir, filePath);
    return {
        target: `file://${resolvedPath}`,
        tooltip: filePath
    };
}

/**
 * Get the directory path from a file URI
 */
function _getDocumentDirectory(uri: string): string {
    const filePath = uri.replace(/^file:\/\/\/?/, '');
    const lastSlash = filePath.lastIndexOf('/');
    return lastSlash >= 0 ? filePath.substring(0, lastSlash) : filePath;
}
