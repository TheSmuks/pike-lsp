/**
 * Hover Content Builder Utilities
 *
 * Shared functions for building markdown hover content across multiple features.
 */

import type { PikeSymbol, PikeFunctionType } from '@pike-lsp/pike-bridge';
import { formatPikeType } from './pike-type-formatter.js';

/**
 * Build markdown content for hover.
 */
export function buildHoverContent(symbol: PikeSymbol): string | null {
    const sym = symbol as unknown as Record<string, unknown>;
    const parts: string[] = [];

    // Symbol kind badge
    const kindLabel = symbol.kind.charAt(0).toUpperCase() + symbol.kind.slice(1);

    // Build type signature using introspected type info if available
    if (symbol.kind === 'method') {
        // Try introspected type first
        if (symbol.type && symbol.type.kind === 'function') {
            const funcType = symbol.type as PikeFunctionType;
            const returnType = funcType.returnType ? formatPikeType(funcType.returnType) : 'void';

            let argList = '';
            // Handle both 'argTypes' (from types.ts interface) and 'arguments' (from introspection)
            const funcTypeRaw = symbol.type as unknown as Record<string, unknown>;
            const args = (funcType.argTypes ?? funcTypeRaw['arguments']) as unknown[] | undefined;
            if (args && args.length > 0) {
                argList = args.map((arg, i) => {
                    // Handle introspection format: {type: "string", name: "arg1"}
                    // or argTypes format: PikeType object
                    if (typeof arg === 'object' && arg !== null) {
                        const argObj = arg as Record<string, unknown>;
                        const type = formatPikeType(argObj['type'] ?? arg);
                        const name = (argObj['name'] as string) ?? `arg${i}`;
                        return `${type} ${name}`;
                    }
                    return `${formatPikeType(arg)} arg${i}`;
                }).join(', ');
            }

            parts.push('```pike');
            parts.push(`${returnType} ${symbol.name}(${argList})`);
            parts.push('```');
        } else {
            // Fallback to old parse format
            const returnType = formatPikeType(sym['returnType']);
            const argNames = sym['argNames'] as string[] | undefined;
            const argTypes = sym['argTypes'] as unknown[] | undefined;

            let argList = '';
            if (argTypes && argNames) {
                argList = argTypes.map((t, i) => {
                    const type = formatPikeType(t);
                    const name = argNames[i] ?? `arg${i}`;
                    return `${type} ${name}`;
                }).join(', ');
            }

            parts.push('```pike');
            parts.push(`${returnType} ${symbol.name}(${argList})`);
            parts.push('```');
        }
    } else if (symbol.kind === 'variable' || symbol.kind === 'constant') {
        // Try introspected type first
        const type = symbol.type
            ? formatPikeType(symbol.type)
            : (sym['type'] as { name?: string })?.name ?? 'mixed';

        parts.push('```pike');
        const modifier = symbol.kind === 'constant' ? 'constant ' : '';
        parts.push(`${modifier}${type} ${symbol.name}`);
        parts.push('```');
    } else if (symbol.kind === 'class') {
        parts.push('```pike');
        parts.push(`class ${symbol.name}`);
        parts.push('```');
    } else {
        parts.push(`**${kindLabel}**: \`${symbol.name}\``);
    }

    // Add modifiers if present
    if (symbol.modifiers && symbol.modifiers.length > 0) {
        parts.push(`\n*Modifiers*: ${symbol.modifiers.join(', ')}`);
    }

    // Add documentation if present
    const doc = sym['documentation'] as {
        text?: string;
        params?: Record<string, string>;
        returns?: string;
        throws?: string;
        notes?: string[];
        bugs?: string[];
        deprecated?: string;
        examples?: string[];
        seealso?: string[];
        members?: Record<string, string>;
        items?: Array<{ label: string; text: string }>;
    } | undefined;

    if (doc) {
        // Add separator between signature and documentation
        parts.push('\n---\n');

        // Deprecation warning (show first if present)
        if (doc.deprecated) {
            parts.push('**DEPRECATED**');
            parts.push('');
            parts.push(`> ${doc.deprecated}`);
            parts.push('');
        }

        // Main description text
        if (doc.text) {
            parts.push(doc.text);
            parts.push('');
        }

        // Parameters
        if (doc.params && Object.keys(doc.params).length > 0) {
            parts.push('**Parameters:**');
            for (const [paramName, paramDesc] of Object.entries(doc.params)) {
                parts.push(`- \`${paramName}\`: ${paramDesc}`);
            }
            parts.push('');
        }

        // Return value
        if (doc.returns) {
            parts.push(`**Returns:** ${doc.returns}`);
            parts.push('');
        }

        // Throws
        if (doc.throws) {
            parts.push(`**Throws:** ${doc.throws}`);
            parts.push('');
        }

        // Notes
        if (doc.notes && doc.notes.length > 0) {
            for (const note of doc.notes) {
                parts.push(`**Note:** ${note}`);
                parts.push('');
            }
        }

        // Examples
        if (doc.examples && doc.examples.length > 0) {
            parts.push('**Example:**');
            for (const example of doc.examples) {
                parts.push('```pike');
                parts.push(example);
                parts.push('```');
            }
            parts.push('');
        }

        // See also references (with Pike docs links for stdlib)
        if (doc.seealso && doc.seealso.length > 0) {
            const refs = doc.seealso.map(s => {
                // Clean up the reference (remove backticks if present)
                const cleaned = s.replace(/`/g, '').trim();
                // Convert Pike path separators to URL format
                // e.g., "Stdio.FILE" -> "Stdio/FILE"
                const urlPath = cleaned.replace(/\./g, '/').replace(/->/g, '/');
                // Create a link to Pike documentation
                const docsUrl = `https://pike.lysator.liu.se/generated/manual/modref/ex/${urlPath}.html`;
                return `[\`${cleaned}\`](${docsUrl})`;
            }).join(', ');
            parts.push(`**See also:** ${refs}`);
        }
    }

    return parts.join('\n');
}
