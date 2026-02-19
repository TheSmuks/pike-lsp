/**
 * Inlay Hints Handler
 *
 * Provides parameter name and type hints in code.
 *
 * Features:
 * - Parameter names at call sites (e.g., `func(value)` → `func(x: value)`)
 * - Parameter types when available (e.g., `func(value)` → `func(x: int value)`)
 * - Configurable via inlayHints settings
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
import type { InlayHintsSettings } from '../../core/types.js';
import { Logger } from '@pike-lsp/core';

/**
 * Register inlay hints handler.
 */
export function registerInlayHintsHandler(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { documentCache, globalSettings } = services;
    const log = new Logger('Advanced');

    /**
     * Extract type information from argTypes array.
     * argTypes comes from Pike's symbol->argtypes and contains type strings.
     */
    function getParamType(argTypes: unknown[] | undefined, index: number): string | undefined {
        if (!argTypes || index >= argTypes.length) return undefined;

        const typeInfo = argTypes[index];
        if (typeof typeInfo === 'string') {
            return typeInfo;
        }
        if (typeof typeInfo === 'object' && typeInfo !== null) {
            const typeRec = typeInfo as Record<string, unknown>;
            return typeRec['type'] as string | undefined;
        }
        return undefined;
    }

    /**
     * Get parameter name from argNames array, handling undefined elements.
     */
    function getParamName(argNames: string[] | undefined, index: number): string {
        if (!argNames || index >= argNames.length) return `arg${index}`;
        const name = argNames[index];
        return name || `arg${index}`;
    }

    /**
     * Format inlay hint label with parameter name and optional type.
     * Examples:
     * - "x:" (parameter name only)
     * - "x: int" (parameter name with type)
     */
    function formatHintLabel(
        paramName: string,
        paramType: string | undefined,
        config?: InlayHintsSettings
    ): string {
        // Only include type if typeHints is enabled
        if (paramType && config?.typeHints) {
            return `${paramName}: ${paramType}`;
        }
        return `${paramName}:`;
    }

    /**
     * Inlay Hints - show parameter names and types at call sites.
     */
    connection.languages.inlayHint.on((params): InlayHint[] | null => {
        log.debug('Inlay hints request', { uri: params.textDocument.uri });
        try {
            // Check if inlay hints are enabled
            const config = globalSettings?.inlayHints;
            if (!config?.enabled) {
                return null;
            }

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
                const argTypes = methodRec['argTypes'] as unknown[] | undefined;

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
                                    const paramType = getParamType(argTypes, argIndex);
                                    hints.push({
                                        position: argPos,
                                        label: formatHintLabel(getParamName(argNames, argIndex), paramType, config),
                                        kind: InlayHintKind.Parameter,
                                        paddingRight: true,
                                    });
                                }
                            }
                        } else if (char === ',' && parenDepth === 1) {
                            const argText = text.slice(currentArgStart, i).trim();
                            if (argText && argIndex < argNames.length) {
                                const argPos = document.positionAt(currentArgStart);
                                const paramType = getParamType(argTypes, argIndex);
                                hints.push({
                                    position: argPos,
                                    label: formatHintLabel(getParamName(argNames, argIndex), paramType, config),
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
            log.error(`Inlay hints failed for ${params.textDocument.uri}: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    });

    /**
     * Inlay Hint resolve handler - can provide additional info lazily.
     * Currently not used, but kept for future enhancements (e.g., tooltips).
     */
    connection.languages.inlayHint.resolve?.((hint): InlayHint => {
        // Could add tooltip with full type info here
        return hint;
    });
}
