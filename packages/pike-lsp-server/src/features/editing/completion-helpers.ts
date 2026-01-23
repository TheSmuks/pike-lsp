/**
 * Completion Helper Functions
 *
 * Utility functions for building completion items.
 */

import {
    CompletionItem,
    CompletionItemKind,
    CompletionItemTag,
    InsertTextFormat,
} from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { formatPikeType } from '../utils/pike-type-formatter.js';

/**
 * Convert Pike symbol kind to LSP completion kind
 */
export function convertCompletionKind(kind?: string): CompletionItemKind {
    switch (kind) {
        case 'class': return CompletionItemKind.Class;
        case 'method': case 'function': return CompletionItemKind.Function;
        case 'variable': return CompletionItemKind.Variable;
        case 'constant': return CompletionItemKind.Constant;
        case 'module': return CompletionItemKind.Module;
        case 'inherit': return CompletionItemKind.Reference;
        default: return CompletionItemKind.Text;
    }
}

/**
 * Extract a class/module name from a Pike type object
 */
export function extractTypeName(typeObj: unknown): string | null {
    if (!typeObj || typeof typeObj !== 'object') {
        return null;
    }

    const t = typeObj as Record<string, unknown>;
    const name = t['name'] as string | undefined;

    if (!name) {
        return null;
    }

    // Direct object type
    if (name === 'object' && t['className']) {
        return t['className'] as string;
    }

    // Function return type
    if (t['kind'] === 'function' && t['returnType']) {
        return extractTypeName(t['returnType']);
    }

    // Object with name that's a class reference
    if (/^[A-Z][a-zA-Z0-9_]*/.test(name)) {
        return name;
    }

    return null;
}

/**
 * Find symbol by name in an array of symbols
 */
export function findSymbolByName(symbols: PikeSymbol[], name: string): PikeSymbol | null {
    for (const symbol of symbols) {
        if (symbol.name === name) {
            return symbol;
        }
    }
    return null;
}

/**
 * Build a method snippet string for completion
 */
export function buildMethodSnippet(
    name: string,
    typeObj: unknown,
    argNames?: (string | null)[],
    argTypes?: unknown[]
): { snippet: string; isSnippet: boolean } {
    if (argNames && argNames.length > 0) {
        const placeholders: string[] = [];
        for (let i = 0; i < argNames.length; i++) {
            const argName = argNames[i] ?? `arg${i + 1}`;
            const safeName = argName.replace(/[$}\\]/g, '\\$&');
            placeholders.push(`\${${i + 1}:${safeName}}`);
        }
        return {
            snippet: `${name}(${placeholders.join(', ')})`,
            isSnippet: true
        };
    }

    if (!typeObj || typeof typeObj !== 'object') {
        return { snippet: name, isSnippet: false };
    }

    const t = typeObj as Record<string, unknown>;

    if (t['kind'] !== 'function') {
        return { snippet: name, isSnippet: false };
    }

    const args = t['arguments'] as unknown[] | undefined;
    if (args && args.length > 0) {
        const placeholders: string[] = [];
        for (let i = 0; i < args.length; i++) {
            const arg = args[i] as Record<string, unknown> | undefined;
            const argName = arg?.['name'] as string | undefined ?? `arg${i + 1}`;
            const safeName = argName.replace(/[$}\\]/g, '\\$&');
            placeholders.push(`\${${i + 1}:${safeName}}`);
        }
        return {
            snippet: `${name}(${placeholders.join(', ')})`,
            isSnippet: true
        };
    }

    const effectiveArgTypes = argTypes ?? (t['argTypes'] as unknown[] | undefined);
    if (effectiveArgTypes && effectiveArgTypes.length > 0) {
        const placeholders: string[] = [];
        for (let i = 0; i < effectiveArgTypes.length; i++) {
            placeholders.push(`\${${i + 1}:arg${i + 1}}`);
        }
        return {
            snippet: `${name}(${placeholders.join(', ')})`,
            isSnippet: true
        };
    }

    return {
        snippet: `${name}(\${1})`,
        isSnippet: true
    };
}

/**
 * Build a completion item with optional snippet support
 */
export function buildCompletionItem(
    name: string,
    symbol: { kind?: string; type?: unknown; argNames?: (string | null)[]; argTypes?: unknown[] },
    source: string,
    allSymbols?: Array<{ name: string; kind?: string; argNames?: (string | null)[]; argTypes?: unknown[] }>,
    context: 'type' | 'expression' = 'type'
): CompletionItem {
    const isFunction = symbol.kind === 'method';
    const isClass = symbol.kind === 'class';
    const typeObj = symbol.type as Record<string, unknown> | undefined;
    const symbolAny = symbol as Record<string, unknown>;

    // For classes, try to find the 'create' constructor
    let constructorArgNames: (string | null)[] | undefined;
    let constructorArgTypes: unknown[] | undefined;
    if (isClass && allSymbols) {
        const classSymbol = symbol as Record<string, unknown>;
        const classLine = (classSymbol['position'] as { line?: number } | undefined)?.line ?? 0;

        const classPositions = allSymbols
            .filter(s => s.kind === 'class')
            .map(s => {
                const pos = (s as Record<string, unknown>)['position'] as { line?: number } | undefined;
                return pos?.line ?? 0;
            })
            .sort((a, b) => a - b);

        const nextClassLine = classPositions.find(line => line > classLine) ?? Infinity;

        const createMethod = allSymbols.find(s => {
            if (s.name !== 'create' || s.kind !== 'method') return false;
            const pos = (s as Record<string, unknown>)['position'] as { line?: number } | undefined;
            const createLine = pos?.line ?? 0;
            return createLine > classLine && createLine < nextClassLine;
        });

        if (createMethod) {
            const createMethodAny = createMethod as Record<string, unknown>;
            constructorArgNames = createMethodAny['argNames'] as (string | null)[] | undefined;
            constructorArgTypes = createMethodAny['argTypes'] as unknown[] | undefined;
        }
    }

    let detail = formatPikeType(symbol.type);
    if (isFunction) {
        if (typeObj?.['signature']) {
            detail = typeObj['signature'] as string;
        } else if (symbolAny['argNames'] && symbolAny['argTypes']) {
            const argNames = symbolAny['argNames'] as (string | null)[];
            const argTypes = symbolAny['argTypes'] as unknown[];
            const returnType = formatPikeType(symbolAny['returnType']);
            const params: string[] = [];
            for (let i = 0; i < argNames.length; i++) {
                const typeName = formatPikeType(argTypes[i]);
                const argName = argNames[i] ?? `arg${i}`;
                params.push(`${typeName} ${argName}`);
            }
            detail = `${returnType} ${name}(${params.join(', ')})`;
        }
    } else if (isClass && constructorArgNames && constructorArgNames.length > 0) {
        const params: string[] = [];
        for (let i = 0; i < constructorArgNames.length; i++) {
            const typeName = constructorArgTypes ? formatPikeType(constructorArgTypes[i]) : 'mixed';
            const argName = constructorArgNames[i] ?? `arg${i}`;
            params.push(`${typeName} ${argName}`);
        }
        detail = `${name}(${params.join(', ')})`;
    } else {
        detail = source;
    }

    const kind = convertCompletionKind(symbol.kind);

    const item: CompletionItem = {
        label: name,
        kind,
        detail,
    };

    // Add deprecated tag if applicable
    if ((symbolAny['deprecated'] as boolean) === true) {
        item.tags = [CompletionItemTag.Deprecated];
    }

    // Add snippet for methods in expression context
    if (isFunction && context === 'expression') {
        const snippetInfo = buildMethodSnippet(name, symbol.type, symbolAny['argNames'] as (string | null)[] | undefined, symbolAny['argTypes'] as unknown[] | undefined);
        if (snippetInfo.isSnippet) {
            item.insertText = snippetInfo.snippet;
            item.insertTextFormat = InsertTextFormat.Snippet;
        }
    }

    // Add snippet for classes in expression context
    if (isClass && context === 'expression' && constructorArgNames && constructorArgNames.length > 0) {
        const placeholders: string[] = [];
        for (let i = 0; i < constructorArgNames.length; i++) {
            const argName = constructorArgNames[i] ?? `arg${i + 1}`;
            const safeName = argName.replace(/[$}\\]/g, '\\$&');
            placeholders.push(`\${${i + 1}:${safeName}}`);
        }
        item.insertText = `${name}(${placeholders.join(', ')})`;
        item.insertTextFormat = InsertTextFormat.Snippet;
    }

    return item;
}
