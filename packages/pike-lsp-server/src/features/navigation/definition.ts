/**
 * Definition Handlers
 *
 * Provides go-to-definition, declaration, and type-definition navigation.
 * Supports module path resolution (Stdio.File) and member access (file->read).
 */

import {
    Connection,
    Location,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { DocumentCache } from '../../services/document-cache.js';
import { Logger } from '@pike-lsp/core';
import { extractExpressionAtPosition } from './expression-utils.js';
import type { ExpressionInfo, PikeSymbol } from '@pike-lsp/pike-bridge';

/**
 * Register definition handlers.
 */
export function registerDefinitionHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { documentCache } = services;
    const log = new Logger('Navigation');

    /**
     * Definition handler - go to symbol definition
     * Supports:
     * - Local symbol navigation
     * - Module path resolution (Stdio.File -> Pike stdlib)
     * - Member access navigation (file->read -> method definition)
     */
    connection.onDefinition(async (params): Promise<Location | Location[] | null> => {
        log.debug('Definition request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                return null;
            }

            // First, try to extract expression at cursor position
            const expr = extractExpressionAtPosition(document, params.position);
            if (expr) {
                log.debug('Definition: extracted expression', { expression: expr });

                // Try module path resolution first
                if (expr.isModulePath || expr.operator === '.') {
                    const moduleLocation = await resolveModulePath(services, expr, document, uri);
                    if (moduleLocation) {
                        return moduleLocation;
                    }
                }

                // Try member access resolution
                if (expr.member && expr.operator === '->') {
                    const memberLocation = await resolveMemberAccess(services, expr, cached, uri);
                    if (memberLocation) {
                        return memberLocation;
                    }
                }

                // Try module path with member (Stdio.File->read)
                if (expr.member && expr.operator === '.') {
                    const moduleMemberLocation = await resolveModuleMember(services, expr, document);
                    if (moduleMemberLocation) {
                        return moduleMemberLocation;
                    }
                }
            }

            // Fallback to local symbol lookup
            const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
            if (!symbol || !symbol.position) {
                return null;
            }

            // Check if we're clicking ON the definition itself
            // Pike uses 1-based lines, LSP uses 0-based
            const symbolLine = (symbol.position.line ?? 1) - 1;
            const isOnDefinition = symbolLine === params.position.line;

            if (isOnDefinition) {
                // If this is an import, include, or inherit, navigate to the target module/file
                if (symbol.kind === 'import' || symbol.kind === 'include' || symbol.kind === 'inherit') {
                    // Use classname if available (usually contains the module path), otherwise name
                    const modulePath = symbol.classname || symbol.name;
                    if (modulePath) {
                        log.debug('Definition: navigating to import/inherit target', { modulePath });

                        // Use introspection data for inherits if available
                        // This handles macros and complex resolutions performed by the Pike compiler
                        if (symbol.kind === 'inherit' && cached.inherits) {
                            const normalizedPath = modulePath.replace(/['"]/g, "");
                            const foundInherit = cached.inherits.find((h: any) => 
                                h.source_name === normalizedPath || 
                                h.path === normalizedPath ||
                                h.label === normalizedPath ||
                                (h.source_name && h.source_name.replace(/['"]/g, "") === normalizedPath)
                            );

                            if (foundInherit && foundInherit.path) {
                                log.debug('Definition: resolved inherit from introspection', { 
                                    modulePath, 
                                    resolvedPath: foundInherit.path 
                                });
                                
                                const targetUri = foundInherit.path.startsWith('file://')
                                    ? foundInherit.path
                                    : `file://${foundInherit.path}`;

                                return {
                                    uri: targetUri,
                                    range: {
                                        start: { line: 0, character: 0 },
                                        end: { line: 0, character: 0 },
                                    },
                                };
                            }
                        }

                        // Check if this is a #include statement by looking at the actual source code
                        // The parser strips quotes from the path, so we check the source line directly
                        const symbolLine = (symbol.position.line ?? 1) - 1;  // Convert to 0-based
                        const lineText = document.getText({
                            start: { line: symbolLine, character: 0 },
                            end: { line: symbolLine + 1, character: 0 }
                        }).trim();
                        const isIncludeDirective = lineText.startsWith('#include') ||
                                                   lineText.startsWith('#if') ||
                                                   lineText.startsWith('#else') ||
                                                   lineText.startsWith('#elif') ||
                                                   lineText.startsWith('#endif');

                        if (isIncludeDirective && services.bridge?.bridge) {
                            // Use resolveInclude for #include directives
                            try {
                                const includeResult = await services.bridge.bridge.resolveInclude(
                                    modulePath,
                                    uri
                                );

                                if (includeResult.exists && includeResult.path) {
                                    const targetUri = includeResult.path.startsWith('file://')
                                        ? includeResult.path
                                        : `file://${includeResult.path}`;

                                    log.debug('Definition: resolved include path', {
                                        originalPath: includeResult.originalPath,
                                        resolvedPath: includeResult.path,
                                    });

                                    return {
                                        uri: targetUri,
                                        range: {
                                            start: { line: 0, character: 0 },
                                            end: { line: 0, character: 0 },
                                        },
                                    };
                                }
                            } catch (err) {
                                log.debug('Definition: failed to resolve include path', {
                                    modulePath,
                                    error: err instanceof Error ? err.message : String(err),
                                });
                            }
                        }

                        // Handle relative import paths (starting with .)
                        if (modulePath.startsWith('.') && services.bridge?.bridge) {
                            try {
                                const relativeResult = await services.bridge.bridge.resolveInclude(
                                    modulePath,
                                    uri
                                );

                                if (relativeResult.exists && relativeResult.path) {
                                    const targetUri = relativeResult.path.startsWith('file://')
                                        ? relativeResult.path
                                        : `file://${relativeResult.path}`;

                                    log.debug('Definition: resolved relative import path', {
                                        modulePath,
                                        resolvedPath: relativeResult.path,
                                    });

                                    return {
                                        uri: targetUri,
                                        range: {
                                            start: { line: 0, character: 0 },
                                            end: { line: 0, character: 0 },
                                        },
                                    };
                                }
                            } catch (err) {
                                log.debug('Definition: failed to resolve relative path', {
                                    modulePath,
                                    error: err instanceof Error ? err.message : String(err),
                                });
                            }
                        }

                        // For inherit statements, try resolving with ALL import paths (order-independent)
                        if (symbol.kind === 'inherit') {
                            // Get ALL imports in the file, not just prior ones (fixes Gap 2)
                            const allImports = cached.symbols.filter((s: PikeSymbol) =>
                                s.kind === 'import'
                            );

                            for (const importSymbol of allImports) {
                                const importPath = importSymbol.classname || importSymbol.name;
                                if (importPath && importPath !== modulePath) {
                                    const qualifiedPath = `${importPath}.${modulePath}`;

                                    const moduleInfo = await services.stdlibIndex?.getModule(qualifiedPath);
                                    if (moduleInfo && moduleInfo.resolvedPath) {
                                        const targetUri = moduleInfo.resolvedPath.startsWith('file://')
                                            ? moduleInfo.resolvedPath
                                            : `file://${moduleInfo.resolvedPath}`;

                                        log.debug('Definition: resolved inherit via import', {
                                            qualifiedPath,
                                            resolvedPath: moduleInfo.resolvedPath,
                                        });

                                        return {
                                            uri: targetUri,
                                            range: {
                                                start: { line: 0, character: 0 },
                                                end: { line: 0, character: 0 },
                                            },
                                        };
                                    }

                                    if (services.bridge?.bridge) {
                                        try {
                                            const bridgeResult = await services.bridge.bridge.resolveInclude(
                                                qualifiedPath,
                                                uri
                                            );

                                            if (bridgeResult.exists && bridgeResult.path) {
                                                const targetUri = bridgeResult.path.startsWith('file://')
                                                    ? bridgeResult.path
                                                    : `file://${bridgeResult.path}`;

                                                log.debug('Definition: resolved inherit via bridge', {
                                                    qualifiedPath,
                                                    resolvedPath: bridgeResult.path,
                                                });

                                                return {
                                                    uri: targetUri,
                                                    range: {
                                                        start: { line: 0, character: 0 },
                                                        end: { line: 0, character: 0 },
                                                    },
                                                };
                                            }
                                        } catch (err) {
                                            log.debug('Definition: bridge resolve failed for inherit', {
                                                qualifiedPath,
                                                error: err instanceof Error ? err.message : String(err),
                                            });
                                        }
                                    }
                                }
                            }
                        }

                        // Fall back to stdlib index for import/inherit statements
                        const moduleInfo = await services.stdlibIndex?.getModule(modulePath);

                        if (moduleInfo && moduleInfo.resolvedPath) {
                            const targetUri = moduleInfo.resolvedPath.startsWith('file://')
                                ? moduleInfo.resolvedPath
                                : `file://${moduleInfo.resolvedPath}`;

                            return {
                                uri: targetUri,
                                range: {
                                    start: { line: 0, character: 0 },
                                    end: { line: 0, character: 0 },
                                },
                            };
                        }
                    }
                }

                // User clicked on a definition - show references instead
                log.debug('Definition: cursor on definition, returning references', { symbol: symbol.name });

                const references = findReferencesForSymbol(
                    symbol.name,
                    uri,
                    document,
                    cached,
                    documentCache,
                    documents
                );

                if (references.length > 0) {
                    return references;
                }
                // No references found, return null (nothing to show)
                return null;
            }

            // Normal case: return location of symbol definition
            const line = Math.max(0, symbolLine);
            return {
                uri,
                range: {
                    start: { line, character: 0 },
                    end: { line, character: (symbol.name || symbol.classname || "").length },
                },
            };
        } catch (err) {
            log.error('Definition failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });

    /**
     * Declaration handler - navigate to declaration (delegates to definition)
     * For Pike, declaration and definition are the same
     */
    connection.onDeclaration(async (params): Promise<Location | null> => {
        log.debug('Declaration request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                return null;
            }

            const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
            if (!symbol || !symbol.position) {
                return null;
            }

            const line = Math.max(0, (symbol.position.line ?? 1) - 1);
            return {
                uri,
                range: {
                    start: { line, character: 0 },
                    end: { line, character: (symbol.name || symbol.classname || "").length },
                },
            };
        } catch (err) {
            log.error('Declaration failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });

    /**
     * Type definition handler - navigate to type definition
     * For classes, navigates to the class definition
     */
    connection.onTypeDefinition(async (params): Promise<Location | null> => {
        log.debug('Type definition request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                return null;
            }

            const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
            if (!symbol) {
                return null;
            }

            // For classes, navigate to the class definition
            if (symbol.kind === 'class' && symbol.position) {
                const line = Math.max(0, (symbol.position.line ?? 1) - 1);
                return {
                    uri,
                    range: {
                        start: { line, character: 0 },
                        end: { line, character: (symbol.name || symbol.classname || "").length },
                    },
                };
            }

            // For variables/methods with type info, could navigate to type
            // For now, fall back to symbol position
            if (symbol.position) {
                const line = Math.max(0, (symbol.position.line ?? 1) - 1);
                return {
                    uri,
                    range: {
                        start: { line, character: 0 },
                        end: { line, character: (symbol.name || symbol.classname || "").length },
                    },
                };
            }

            return null;
        } catch (err) {
            log.error('Type definition failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });
}

/**
 * Find symbol at given position in document.
 */
function findSymbolAtPosition(
    symbols: any[],
    position: { line: number; character: number },
    document: TextDocument
): any | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Find word boundaries
    let start = offset;
    let end = offset;

    while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
        start--;
    }
    while (end < text.length && /\w/.test(text[end] ?? '')) {
        end++;
    }

    const word = text.slice(start, end);
    if (!word) {
        return null;
    }

    // Find symbol with matching name
    for (const symbol of symbols) {
        if (symbol.name === word) {
            return symbol;
        }

        // Match against classname for inherits, imports, and includes (stripping quotes)
        if (symbol.kind === "inherit" || symbol.kind === "import" || symbol.kind === "include") {
            const classname = symbol.classname?.replace(/['"]/g, "");
            // Check if classname matches word or part of it (e.g. Stdio in Stdio.File)
            if (classname === word || (classname && classname.includes(word))) {
                return symbol;
            }
        }
    }

    return null;
}

/**
 * Find all references to a symbol in the current and other open documents.
 * Excludes the definition itself from the results.
 */
function findReferencesForSymbol(
    symbolName: string,
    currentUri: string,
    currentDocument: TextDocument,
    cached: any,
    documentCache: DocumentCache,
    documents: TextDocuments<TextDocument>
): Location[] {
    const references: Location[] = [];
    const text = currentDocument.getText();

    // Use symbolPositions index if available (pre-computed positions)
    if (cached.symbolPositions) {
        const positions = cached.symbolPositions.get(symbolName);
        if (positions) {
            for (const pos of positions) {
                references.push({
                    uri: currentUri,
                    range: {
                        start: pos,
                        end: { line: pos.line, character: pos.character + symbolName.length },
                    },
                });
            }
        }
    }

    // Fallback: if symbolPositions didn't have results, do text-based search
    if (references.length === 0) {
        const lines = text.split('\n');
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            if (!line) continue;
            let searchStart = 0;
            let matchIndex: number;

            while ((matchIndex = line.indexOf(symbolName, searchStart)) !== -1) {
                const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                const afterChar = matchIndex + symbolName.length < line.length ? line[matchIndex + symbolName.length] : ' ';

                // Check word boundaries
                if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                    references.push({
                        uri: currentUri,
                        range: {
                            start: { line: lineNum, character: matchIndex },
                            end: { line: lineNum, character: matchIndex + symbolName.length },
                        },
                    });
                }
                searchStart = matchIndex + 1;
            }
        }
    }

    // Search in other open documents
    for (const [otherUri, otherCached] of Array.from(documentCache.entries())) {
        if (otherUri === currentUri) continue;

        // Use symbolPositions if available
        if (otherCached.symbolPositions) {
            const positions = otherCached.symbolPositions.get(symbolName);
            if (positions) {
                for (const pos of positions) {
                    references.push({
                        uri: otherUri,
                        range: {
                            start: pos,
                            end: { line: pos.line, character: pos.character + symbolName.length },
                        },
                    });
                }
            }
        } else {
            // Fallback text search for other documents without symbolPositions
            const otherDoc = documents.get(otherUri);
            if (otherDoc) {
                const otherText = otherDoc.getText();
                const otherLines = otherText.split('\n');
                for (let lineNum = 0; lineNum < otherLines.length; lineNum++) {
                    const line = otherLines[lineNum];
                    if (!line) continue;
                    let searchStart = 0;
                    let matchIndex: number;

                    while ((matchIndex = line.indexOf(symbolName, searchStart)) !== -1) {
                        const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                        const afterChar = matchIndex + symbolName.length < line.length ? line[matchIndex + symbolName.length] : ' ';

                        if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                            references.push({
                                uri: otherUri,
                                range: {
                                    start: { line: lineNum, character: matchIndex },
                                    end: { line: lineNum, character: matchIndex + symbolName.length },
                                },
                            });
                        }
                        searchStart = matchIndex + 1;
                    }
                }
            }
        }
    }

    return references;
}

/**
 * Resolve a module path to its file location.
 * Handles dotted module paths like "Stdio.File" or "Parser.Pike".
 */
async function resolveModulePath(
    services: Services,
    expr: ExpressionInfo,
    _document: TextDocument,
    _currentUri: string
): Promise<Location | null> {
    const { stdlibIndex, bridge } = services;

    if (!stdlibIndex || !bridge) {
        return null;
    }

    // Build the module path to resolve
    let modulePath = expr.base;
    if (expr.operator === '.' && !expr.isModulePath && expr.member) {
        // For simple dot access like "Stdio.File", use the full path
        modulePath = expr.fullPath;
    }

    try {
        const moduleInfo = await stdlibIndex.getModule(modulePath);
        if (!moduleInfo) {
            return null;
        }

        // Use filePath (without line number) for the URI, and line for the position
        const filePath = moduleInfo.filePath ?? moduleInfo.resolvedPath;
        if (!filePath) {
            return null;
        }

        // Convert file path to URI
        const uri = filePath.startsWith('file://')
            ? filePath
            : `file://${filePath}`;

        // Get the line number (0-based) from module info, default to 0
        const line = moduleInfo.line ?? 0;

        // Find the specific symbol within the module if a member was requested
        // Note: IntrospectedSymbol doesn't have position info, so we return the module file
        if (expr.member && moduleInfo.symbols) {
            const memberSymbol = moduleInfo.symbols.get(expr.member);
            if (memberSymbol) {
                // Return the module file location at the module's line
                return {
                    uri,
                    range: {
                        start: { line, character: 0 },
                        end: { line, character: 0 },
                    },
                };
            }
        }

        // Return the module file location at the parsed line number
        return {
            uri,
            range: {
                start: { line, character: 0 },
                end: { line, character: 0 },
            },
        };
    } catch (error) {
        const log = new Logger('Navigation');
        log.debug('Module path resolution failed', {
            modulePath,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

/**
 * Resolve member access (variable->member) to its definition.
 * First resolves the variable's type, then finds the member within that type.
 */
async function resolveMemberAccess(
    services: Services,
    expr: ExpressionInfo,
    cached: any,
    _currentUri: string
): Promise<Location | null> {
    const { stdlibIndex } = services;

    if (!stdlibIndex || !expr.base || !expr.member) {
        return null;
    }

    try {
        // Find the base variable in local symbols to get its type
        const baseSymbol = cached.symbols?.find((s: any) => s.name === expr.base);
        let typeName: string | null = null;

        if (baseSymbol) {
            // Try to get type from introspection result
            if (baseSymbol.type) {
                const type = baseSymbol.type;
                if (type.kind === 'object' && type.className) {
                    typeName = type.className;
                } else if (type.kind === 'program' && type.className) {
                    typeName = type.className;
                }
            }
        }

        // If no type from symbol, try extracting from the first use
        if (!typeName && baseSymbol?.position) {
            // Could add more sophisticated type inference here
            // For now, try to find type annotations in the code
        }

        if (!typeName) {
            return null;
        }

        // Resolve the type module
        const moduleInfo = await stdlibIndex.getModule(typeName);
        if (!moduleInfo || !moduleInfo.symbols) {
            return null;
        }

        // Find the member in the module
        const memberSymbol = moduleInfo.symbols.get(expr.member);
        if (!memberSymbol) {
            return null;
        }

        // Use filePath (without line number) for the URI
        const filePath = moduleInfo.filePath ?? moduleInfo.resolvedPath;
        if (!filePath) {
            return null;
        }

        // Build URI from module path
        const uri = filePath.startsWith('file://')
            ? filePath
            : `file://${filePath}`;

        // Use the module's line number (0-based) if available
        const line = moduleInfo.line ?? 0;
        return {
            uri,
            range: {
                start: { line, character: 0 },
                end: { line, character: expr.member.length },
            },
        };
    } catch (error) {
        const log = new Logger('Navigation');
        log.debug('Member access resolution failed', {
            base: expr.base,
            member: expr.member,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

/**
 * Resolve a module member (e.g., "Parser.Pike.split").
 * Resolves the base module, then finds the member within it.
 */
async function resolveModuleMember(
    services: Services,
    expr: ExpressionInfo,
    _document: TextDocument
): Promise<Location | null> {
    const { stdlibIndex } = services;

    if (!stdlibIndex || !expr.base || !expr.member) {
        return null;
    }

    try {
        // Resolve the base module
        const moduleInfo = await stdlibIndex.getModule(expr.base);
        if (!moduleInfo || !moduleInfo.symbols) {
            return null;
        }

        // Find the member in the module
        const memberSymbol = moduleInfo.symbols.get(expr.member);
        if (!memberSymbol) {
            return null;
        }

        // Use filePath (without line number) for the URI
        const filePath = moduleInfo.filePath ?? moduleInfo.resolvedPath;
        if (!filePath) {
            return null;
        }

        // Build URI from module path
        const uri = filePath.startsWith('file://')
            ? filePath
            : `file://${filePath}`;

        // Use the module's line number (0-based) if available
        const line = moduleInfo.line ?? 0;
        return {
            uri,
            range: {
                start: { line, character: 0 },
                end: { line, character: expr.member.length },
            },
        };
    } catch (error) {
        const log = new Logger('Navigation');
        log.debug('Module member resolution failed', {
            base: expr.base,
            member: expr.member,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
