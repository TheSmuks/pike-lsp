/**
 * Inlay Hints Handler
 *
 * Provides parameter name and type hints in code.
 */

import {
    Connection,
    InlayHint,
    InlayHintKind,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { PatternHelpers } from '../../utils/regex-patterns.js';
import { Logger } from '@pike-lsp/core';

/**
 * Register inlay hints handler.
 */
export function registerInlayHintsHandler(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { documentCache } = services;
    const log = new Logger('Advanced');

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
}
