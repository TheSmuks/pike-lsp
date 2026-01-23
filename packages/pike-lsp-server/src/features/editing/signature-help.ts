/**
 * Signature Help Handler
 *
 * Provides function parameter hints for Pike code.
 */

import {
    Connection,
    ParameterInformation,
    SignatureHelp,
    SignatureInformation,
    TextDocuments,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs/promises';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from '../../services/index.js';
import { formatPikeType } from '../utils/pike-type-formatter.js';

/**
 * Register signature help handler.
 */
export function registerSignatureHelpHandler(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { logger, documentCache, stdlibIndex } = services;

    /**
     * Signature help handler - show function parameters
     */
    connection.onSignatureHelp(async (params): Promise<SignatureHelp | null> => {
        const bridge = services.bridge;
        const uri = params.textDocument.uri;
        const document = documents.get(uri);
        const cached = documentCache.get(uri);

        if (!document || !cached) {
            return null;
        }

        const text = document.getText();
        const offset = document.offsetAt(params.position);

        // Find the function call context
        let parenDepth = 0;
        let funcStart = offset;
        let paramIndex = 0;

        for (let i = offset - 1; i >= 0; i--) {
            const char = text[i];
            if (char === ')') {
                parenDepth++;
            } else if (char === '(') {
                if (parenDepth === 0) {
                    funcStart = i;
                    break;
                }
                parenDepth--;
            } else if (char === ',' && parenDepth === 0) {
                paramIndex++;
            } else if (char === ';' || char === '{' || char === '}') {
                return null;
            }
        }

        // Get the function name before the paren
        const textBefore = text.slice(0, funcStart);
        const qualifiedMatch = textBefore.match(/([\w.]+)\s*$/);
        if (!qualifiedMatch) {
            return null;
        }

        const funcName = qualifiedMatch[1]!;
        let funcSymbol: PikeSymbol | null = null;

        // Check if this is a qualified stdlib symbol
        if (funcName.includes('.') && stdlibIndex) {
            const lastDotIndex = funcName.lastIndexOf('.');
            const modulePath = funcName.substring(0, lastDotIndex);
            const symbolName = funcName.substring(lastDotIndex + 1);

            logger.debug('Signature help for qualified symbol', { modulePath, symbolName });

            try {
                const currentFile = decodeURIComponent(uri.replace(new RegExp('^file://', ''), ''));
                const module = await stdlibIndex.getModule(modulePath);

                if (module?.symbols && module.symbols.has(symbolName)) {
                    const targetPath = module.resolvedPath
                        ? module.resolvedPath
                        : bridge ? await bridge.resolveModule(modulePath, currentFile) : null;

                    if (targetPath) {
                        const cleanPath = targetPath.split(':')[0] ?? targetPath;
                        const targetUri = `file://${cleanPath}`;

                        const targetCached = documentCache.get(targetUri);
                        if (targetCached) {
                            funcSymbol = findSymbolByName(targetCached.symbols, symbolName) ?? null;
                        }

                        if (!funcSymbol && bridge) {
                            try {
                                const code = await fs.readFile(cleanPath, 'utf-8');
                                const parseResult = await bridge.parse(code, cleanPath);
                                funcSymbol = findSymbolByName(parseResult.symbols, symbolName) ?? null;
                            } catch (parseErr) {
                                logger.debug('Failed to parse for signature', { error: parseErr instanceof Error ? parseErr.message : String(parseErr) });
                            }
                        }
                    }
                }
            } catch (err) {
                logger.debug('Error resolving stdlib symbol', { error: err instanceof Error ? err.message : String(err) });
            }
        }

        // Fallback: search in current document
        if (!funcSymbol) {
            funcSymbol = cached.symbols.find(s => s.name === funcName && s.kind === 'method') ?? null;
        }

        if (!funcSymbol) {
            return null;
        }

        // Build signature
        const params_list: ParameterInformation[] = [];
        const symbolAny = funcSymbol as any;
        const argNames: string[] = symbolAny.argNames ?? [];
        const argTypes: unknown[] = symbolAny.argTypes ?? [];

        const returnType = formatPikeType(symbolAny.returnType);
        let signatureLabel = `${returnType} ${funcName}(`;

        for (let i = 0; i < argNames.length; i++) {
            const typeName = formatPikeType(argTypes[i]);
            const paramStr = `${typeName} ${argNames[i]}`;

            const startOffset = signatureLabel.length;
            signatureLabel += paramStr;
            const endOffset = signatureLabel.length;

            params_list.push({
                label: [startOffset, endOffset],
            });

            if (i < argNames.length - 1) {
                signatureLabel += ', ';
            }
        }
        signatureLabel += ')';

        const signature: SignatureInformation = {
            label: signatureLabel,
            parameters: params_list,
        };

        logger.debug('Signature help', { func: funcName, paramIndex, paramsCount: params_list.length });

        return {
            signatures: [signature],
            activeSignature: 0,
            activeParameter: Math.min(paramIndex, params_list.length - 1),
        };
    });
}

/**
 * Find symbol by name in an array of symbols
 */
function findSymbolByName(symbols: PikeSymbol[], name: string): PikeSymbol | null {
    for (const symbol of symbols) {
        if (symbol.name === name) {
            return symbol;
        }
    }
    return null;
}
