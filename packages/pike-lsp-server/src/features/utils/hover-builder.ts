/**
 * Hover Content Builder Utilities
 *
 * Shared functions for building markdown hover content across multiple features.
 */

import type { PikeSymbol, PikeFunctionType } from '@pike-lsp/pike-bridge';
import { formatPikeType } from './pike-type-formatter.js';

/**
 * Process block-level tags like @mapping, @ul, @decl, @dl, @multiset, @ol
 */
function processBlockTags(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    let olCounter = 0; // Track ordered list counter

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;
        const trimmed = line.trim();

        if (trimmed.startsWith('@decl ')) {
            const decl = trimmed.substring(6);
            result.push('```pike');
            result.push(decl);
            result.push('```');
            continue;
        }

        if (trimmed === '@mapping') {
            result.push('**Mapping:**');
            continue;
        }

        if (trimmed === '@endmapping' || trimmed === '@endul' || trimmed === '@endint' ||
            trimmed === '@endarray' || trimmed === '@enddl' || trimmed === '@endmultiset' ||
            trimmed === '@endstring' || trimmed === '@endmixed' || trimmed === '@endol') {
            // Reset ordered list counter when ending @ol
            if (trimmed === '@endol') {
                olCounter = 0;
            }
            continue;
        }

        if (trimmed.startsWith('@member ')) {
            // Check for description on next line
            let nextLineDesc = '';
            if (i + 1 < lines.length) {
                const nextLine = lines[i + 1];
                const nextTrimmed = nextLine ? nextLine.trim() : '';
                if (nextTrimmed && !nextTrimmed.startsWith('@')) {
                    nextLineDesc = nextTrimmed;
                    i++; // Skip next line
                }
            }

            // @member type "name" [description]
            const match = trimmed.match(/^@member\s+(.+?)\s+"([^"]+)"(?:\s+(.*))?$/);
            if (match) {
                const type = match[1];
                const name = match[2];
                const desc = match[3] || nextLineDesc;
                let newLine = `- \`"${name}"\` (\`${type}\`)`;
                if (desc) newLine += `: ${desc}`;
                result.push(newLine);
                continue;
            }

            // @member type name [description] (no quotes)
            const match2 = trimmed.match(/^@member\s+(.+?)\s+(\w+)(?:\s+(.*))?$/);
            if (match2) {
                 const type = match2[1];
                 const name = match2[2];
                 const desc = match2[3] || nextLineDesc;
                 let newLine = `- \`${name}\` (\`${type}\`)`;
                 if (desc) newLine += `: ${desc}`;
                 result.push(newLine);
                 continue;
            }

            // If match failed but we consumed a line, back up (unlikely if regex matches standard format)
             if (nextLineDesc) i--;
        }

        if (trimmed === '@ul') {
            continue;
        }

        if (trimmed === '@ol') {
            olCounter = 1;
            continue;
        }

        if (trimmed.startsWith('@item ')) {
            const itemText = trimmed.substring(6);
            // Use numbered list if inside @ol, otherwise bullet
            if (olCounter > 0) {
                result.push(`${olCounter}. ${itemText}`);
                olCounter++;
            } else {
                result.push(`- ${itemText}`);
            }
            continue;
        }

        if (trimmed === '@int' || trimmed === '@array' || trimmed === '@multiset' ||
            trimmed === '@string' || trimmed === '@mixed' || trimmed === '@ol' ||
            trimmed === '@dl') {
            continue;
        }

        if (trimmed.startsWith('@value ')) {
            const val = trimmed.substring(7);
            let desc = '';
            if (i + 1 < lines.length) {
                const nextLine = lines[i + 1];
                const nextTrimmed = nextLine ? nextLine.trim() : '';
                if (nextTrimmed && !nextTrimmed.startsWith('@')) {
                    desc = nextTrimmed;
                    i++;
                }
            }

            if (desc) result.push(`- \`${val}\`: ${desc}`);
            else result.push(`- \`${val}\``);
            continue;
        }

        if (trimmed.startsWith('@index ')) {
            // @index is used in @multiset blocks (similar to @value)
            const val = trimmed.substring(7);
            let desc = '';
            if (i + 1 < lines.length) {
                const nextLine = lines[i + 1];
                const nextTrimmed = nextLine ? nextLine.trim() : '';
                if (nextTrimmed && !nextTrimmed.startsWith('@')) {
                    desc = nextTrimmed;
                    i++;
                }
            }

            if (desc) result.push(`- \`${val}\`: ${desc}`);
            else result.push(`- \`${val}\``);
            continue;
        }

        if (trimmed.startsWith('@type ')) {
            // @type is used in @mixed blocks
            const rest = trimmed.substring(6);
            let desc = '';
            if (i + 1 < lines.length) {
                const nextLine = lines[i + 1];
                const nextTrimmed = nextLine ? nextLine.trim() : '';
                if (nextTrimmed && !nextTrimmed.startsWith('@')) {
                    desc = nextTrimmed;
                    i++;
                }
            }

            if (desc) result.push(`- **${rest}**: ${desc}`);
            else result.push(`- **${rest}**`);
            continue;
        }

        if (trimmed.startsWith('@elem ')) {
            // @elem type index [description] or description on next line
            const rest = trimmed.substring(6).trim();

            // Try to parse: @elem type index
            const parts = rest.split(/\s+/);
            let type = '';
            let index = '';
            let inlineDesc = '';

            if (parts.length >= 2) {
                type = parts[0] || '';
                index = parts[1] || '';
                // Anything after the first two parts is inline description
                if (parts.length > 2) {
                    inlineDesc = parts.slice(2).join(' ');
                }
            }

            // Check for description on next line
            let nextLineDesc = '';
            if (i + 1 < lines.length) {
                const nextLine = lines[i + 1];
                const nextTrimmed = nextLine ? nextLine.trim() : '';
                if (nextTrimmed && !nextTrimmed.startsWith('@')) {
                    nextLineDesc = nextTrimmed;
                    i++;
                }
            }

            const desc = inlineDesc || nextLineDesc;
            const itemDisplay = type && index ? `${index} (${type})` : rest;

            if (desc) result.push(`- \`${itemDisplay}\`: ${desc}`);
            else result.push(`- \`${itemDisplay}\``);
            continue;
        }

        if (trimmed.startsWith('@dt ')) {
            // Definition term in @dl block
            const term = trimmed.substring(4);
            result.push(`- **${term}**`);
            continue;
        }

        if (trimmed.startsWith('@dd ')) {
            // Definition description in @dl block (indented)
            const desc = trimmed.substring(4);
            result.push(`  ${desc}`);
            continue;
        }

        result.push(line);
    }
    return result.join('\n');
}

/**
 * Convert Pike Autodoc markup to Markdown.
 * Handles inline tags like @b{}, @i{}, @tt{}, @pre{}, @u{}, @sub{}, @sup{}, @ref{}, @[...].
 * Also handles @url{}, @rfc{}, @xml{}, @fixme{}, @expr{}, @code{}, @image{}.
 */
export function convertPikeDocToMarkdown(text: string): string {
    if (!text) return '';

    // First process block-level tags
    text = processBlockTags(text);

    // Buffer stack approach to handle nested tags
    interface StackFrame {
        tag: string;
        content: string;
    }

    const stack: StackFrame[] = [];
    let currentContent = '';

    let i = 0;
    while (i < text.length) {
        if (text[i] === '@') {
            if (i + 1 < text.length) {
                const next = text[i + 1];

                if (next === '@') {
                    // @@ -> @
                    currentContent += '@';
                    i += 2;
                    continue;
                }

                if (next === '}') {
                    // Closing tag @}
                    if (stack.length > 0) {
                        const frame = stack.pop()!;
                        const innerContent = currentContent;
                        currentContent = frame.content; // restore outer content

                        // Apply markup to innerContent
                        const tag = frame.tag;
                        if (tag === 'b') currentContent += `**${innerContent}**`;
                        else if (tag === 'i') currentContent += `*${innerContent}*`;
                        else if (tag === 'tt' || tag === 'code' || tag === 'expr') currentContent += `\`${innerContent}\``;
                        else if (tag === 'ref') currentContent += `\`${innerContent}\``;
                        else if (tag === 'url') currentContent += `<${innerContent}>`;
                        else if (tag === 'rfc') currentContent += `[RFC ${innerContent}](https://tools.ietf.org/html/rfc${innerContent})`;
                        else if (tag === 'xml') currentContent += innerContent;
                        else if (tag === 'fixme') currentContent += `**FIXME** ${innerContent}`;
                        else if (tag === 'pre') currentContent += `\`\`\`pike\n${innerContent}\n\`\`\``;
                        else if (tag === 'u') currentContent += `<u>${innerContent}</u>`;
                        else if (tag === 'sub') currentContent += `<sub>${innerContent}</sub>`;
                        else if (tag === 'sup') currentContent += `<sup>${innerContent}</sup>`;
                        else if (tag === 'image') currentContent += `[Image: ${innerContent}]`;
                        else currentContent += innerContent; // Unknown tag, just keep content (stripping the tag wrapper)
                    } else {
                        currentContent += '@}';
                    }
                    i += 2;
                    continue;
                }

                if (next === '[') {
                    // @[ ... ] shorthand for ref
                    // We treat this as a special tag 'bracket_ref'
                    stack.push({ tag: 'bracket_ref', content: currentContent });
                    currentContent = '';
                    i += 2;
                    continue;
                }

                // Check for start tag @keyword{
                // Look ahead for {
                // We limit lookahead to avoid performance issues on long strings without tags
                const braceIdx = text.indexOf('{', i + 1);
                if (braceIdx !== -1 && braceIdx < i + 20) {
                    const tagCandidate = text.substring(i + 1, braceIdx);
                    // Tags are usually simple alpha strings
                    if (/^[a-zA-Z]+$/.test(tagCandidate)) {
                        stack.push({ tag: tagCandidate, content: currentContent });
                        currentContent = '';
                        i = braceIdx + 1;
                        continue;
                    }
                }
            }
        } else if (text[i] === ']') {
            // potential end of @[ ... ]
            if (stack.length > 0 && stack[stack.length - 1]!.tag === 'bracket_ref') {
                const frame = stack.pop()!;
                const innerContent = currentContent;
                currentContent = frame.content;
                currentContent += `\`${innerContent}\``;
                i++;
                continue;
            }
        }

        currentContent += text[i];
        i++;
    }

    // Handle any unclosed tags
    while (stack.length > 0) {
        const frame = stack.pop()!;
        const tag = frame.tag;
        const innerContent = currentContent;
        currentContent = frame.content;

        // Reconstruct unclosed tag as raw text to avoid swallowing content
        if (tag === 'bracket_ref') {
            currentContent += `@[${innerContent}`;
        } else {
            currentContent += `@${tag}{${innerContent}`;
        }
    }

    return currentContent;
}

/**
 * Generate a Pike documentation URL for a given path.
 * Adds predef_3A_3A prefix for top-level modules.
 */
function generatePikeDocsUrl(path: string): string {
    const cleanPath = path.replace(/`/g, '').trim();
    // Convert Pike path separators to URL format
    let urlPath = cleanPath.replace(/\./g, '/').replace(/->/g, '/');

    // If it starts with an uppercase letter, it's likely a top-level module/class
    // so we prepend the predef prefix
    if (/^[A-Z]/.test(urlPath)) {
        urlPath = `predef_3A_3A/${urlPath}`;
    }

    return `https://pike.lysator.liu.se/generated/manual/modref/ex/${urlPath}.html`;
}

/**
 * Build markdown content for hover.
 */
export function buildHoverContent(symbol: PikeSymbol, parentScope?: string): string | null {
    // Handle null/undefined symbols gracefully (edge case 1.7)
    if (!symbol) {
        return null;
    }

    const sym = symbol as unknown as Record<string, unknown>;
    const parts: string[] = [];

    // Link to official documentation if likely a stdlib symbol
    // We assume if parentScope is provided, or if it's a known top-level module, we link it.
    // Also check if the symbol itself looks like a stdlib thing (has documentation, maybe no source location?)
    // For now, rely on parentScope being passed by the caller (hover provider) when it resolves from stdlib.

    let docsLink = '';
    if (parentScope || (symbol.kind === 'module' && /^[A-Z]/.test(symbol.name))) {
        let path = symbol.name;
        if (parentScope) {
            path = `${parentScope}.${symbol.name}`;
        }
        const url = generatePikeDocsUrl(path);
        docsLink = `[Online Documentation](${url})`;
    }

    // Symbol kind badge
    const kindLabel = symbol.kind.charAt(0).toUpperCase() + symbol.kind.slice(1);

    // Build type signature using introspected type info if available
    if (symbol.kind === 'method') {
        // Try introspected type first
        const symRecord = symbol as unknown as Record<string, unknown>;

        // Check for test format: type: { kind: 'function', returnType: 'int' }, parameters: [...]
        if (symRecord['type'] && typeof symRecord['type'] === 'object') {
            const typeRecord = symRecord['type'] as Record<string, unknown>;
            if (typeRecord['kind'] === 'function' || typeRecord['kind'] === 'method') {
                const returnType = typeRecord['returnType']
                    ? formatPikeType(typeRecord['returnType'])
                    : (typeRecord['returnType'] ?? 'void');

                let argList = '';

                // Handle test format: parameters array
                if (symRecord['parameters'] && Array.isArray(symRecord['parameters'])) {
                    const params = symRecord['parameters'] as Array<{ name?: string; type?: string }>;
                    argList = params.map(p => {
                        const type = p.type ?? 'mixed';
                        const name = p.name ?? 'arg';
                        return `${type} ${name}`;
                    }).join(', ');
                }
                // Handle introspection format: argTypes or arguments
                else {
                    const args = (typeRecord['argTypes'] ?? typeRecord['arguments']) as unknown[] | undefined;
                    if (args && args.length > 0) {
                        argList = args.map((arg, i) => {
                            if (typeof arg === 'object' && arg !== null) {
                                const argObj = arg as Record<string, unknown>;
                                const type = formatPikeType(argObj['type'] ?? arg);
                                const name = (argObj['name'] as string) ?? `arg${i}`;
                                return `${type} ${name}`;
                            }
                            return `${formatPikeType(arg)} arg${i}`;
                        }).join(', ');
                    }
                }

                parts.push('```pike');
                parts.push(`${returnType} ${symbol.name}(${argList})`);
                parts.push('```');
            }
        } else if (symbol.type && symbol.type.kind === 'function') {
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
    } else if (symbol.kind === 'typedef') {
        // Handle typedef - show the typedef definition
        const type = symbol.type
            ? formatPikeType(symbol.type)
            : (sym['type'] as { name?: string })?.name ?? 'mixed';

        // Check for resolved type from type_to_json (contains nameAlias and resolvedType)
        const resolvedType = sym['resolvedType'] as string | undefined;
        const nameAlias = sym['nameAlias'] as string | undefined;

        parts.push('```pike');
        if (nameAlias && resolvedType) {
            parts.push(`typedef ${resolvedType} ${nameAlias}`);
        } else {
            parts.push(`typedef ${type} ${symbol.name}`);
        }
        parts.push('```');
    } else if (symbol.kind === 'class') {
        parts.push('```pike');
        parts.push(`class ${symbol.name}`);
        parts.push('```');
    } else {
        parts.push(`**${kindLabel}**: \`${symbol.name}\``);
    }

    if (docsLink) {
        parts.push(`\n${docsLink}`);
    }

    // Add inheritance info
    if (sym['inherited']) {
        const from = sym['inheritedFrom'] as string | undefined;
        if (from) {
            parts.push(`\n*Inherited from*: \`${from}\``);
        } else {
            parts.push(`\n*Inherited*`);
        }
    }

    // Add conditional compilation info if present
    // Pike returns: conditional: true | 1, condition: string, branch: number
    if (sym['conditional']) {
        const branch = sym['branch'] as number | undefined;
        const condition = sym['condition'] as string | undefined;
        const conditionPrefix = branch === 0 ? '#if' : '#elif';
        parts.push(`\n*Condition*: ${conditionPrefix} ${condition || ''}`);
    }

    // Add modifiers if present
    if (symbol.modifiers && symbol.modifiers.length > 0) {
        parts.push(`\n*Modifiers*: ${symbol.modifiers.join(', ')}`);
    }

    // Add documentation if present
    const doc = sym['documentation'] as {
        text?: string;
        params?: Record<string, string>;
        paramOrder?: string[];  // Preserves original param order from autodoc
        returns?: string;
        throws?: string;
        notes?: string[];
        bugs?: string[];
        deprecated?: string;
        obsolete?: string;
        examples?: string[];
        seealso?: string[];
        copyright?: string[];
        thanks?: string[];
        fixme?: string[];
        members?: Record<string, string>;
        constants?: Record<string, string>;
        items?: Array<{ label: string; text: string }>;
        indexes?: Array<{ label: string; text: string }>;
        types?: string[];
    } | undefined | string;

    if (doc) {
        // Handle string documentation (simple format or AutoDoc with //! prefix)
        if (typeof doc === 'string') {
            parts.push('\n---\n');
            // Strip //! prefixes if present
            const cleanDoc = doc.split('\n')
                .map(line => line.replace(/^\s*\/\/!\s*/, ''))
                .join('\n');
            parts.push(convertPikeDocToMarkdown(cleanDoc));
            parts.push('');
        } else if (typeof doc === 'object') {
        // Add separator between signature and documentation
        parts.push('\n---\n');

        // Deprecation warning (show first if present)
        if (doc.deprecated) {
            parts.push('**DEPRECATED**');
            parts.push('');
            parts.push(`> ${convertPikeDocToMarkdown(doc.deprecated)}`);
            parts.push('');
        }

        // Main description text
        if (doc.text) {
            parts.push(convertPikeDocToMarkdown(doc.text));
            parts.push('');
        }

        // Parameters
        if (doc.params && Object.keys(doc.params).length > 0) {
            parts.push('**Parameters:**');
            parts.push('');
            // Use paramOrder if available to preserve original order
            const paramOrder = (doc.paramOrder as string[] | undefined) ?? Object.keys(doc.params);
            for (const paramName of paramOrder) {
                const paramDesc = doc.params[paramName];
                if (paramDesc === undefined) continue;
                const converted = convertPikeDocToMarkdown(paramDesc);
                // Check if the converted description contains a nested list
                const hasNestedList = converted.includes('\n') && /^- /m.test(converted);
                if (hasNestedList) {
                    // Put parameter name on its own line, then indent the nested list
                    parts.push(`- \`${paramName}\`:`);
                    const indented = converted.split('\n').map(line => `  ${line}`).join('\n');
                    parts.push(indented);
                } else {
                    parts.push(`- \`${paramName}\`: ${converted}`);
                }
            }
            parts.push('');
        }

        // Return value
        if (doc.returns) {
            parts.push(`**Returns:** ${convertPikeDocToMarkdown(doc.returns)}`);
            parts.push('');
        }

        // Throws
        if (doc.throws) {
            parts.push(`**Throws:** ${convertPikeDocToMarkdown(doc.throws)}`);
            parts.push('');
        }

        // Notes
        if (doc.notes && doc.notes.length > 0) {
            for (const note of doc.notes) {
                parts.push(`**Note:** ${convertPikeDocToMarkdown(note)}`);
                parts.push('');
            }
        }

        // Bugs
        if (doc.bugs && doc.bugs.length > 0) {
            for (const bug of doc.bugs) {
                parts.push(`**Bug:** ${convertPikeDocToMarkdown(bug)}`);
                parts.push('');
            }
        }

        // Examples
        if (doc.examples && doc.examples.length > 0) {
            parts.push('**Example:**');
            for (const example of doc.examples) {
                parts.push('```pike');
                // Don't convert markup in examples as they are code
                parts.push(example);
                parts.push('```');
            }
            parts.push('');
        }

        // See also references (with Pike docs links for stdlib)
        if (doc.seealso && doc.seealso.length > 0) {
            const refs = doc.seealso.map(s => {
                const cleaned = s.replace(/`/g, '').trim();
                const docsUrl = generatePikeDocsUrl(cleaned);
                return `[\`${cleaned}\`](${docsUrl})`;
            }).join(', ');
            parts.push(`**See also:** ${refs}`);
        }

        // Obsolete warning (similar to deprecated but different)
        if (doc.obsolete) {
            parts.push('**⚠️ OBSOLETE**');
            parts.push('');
            parts.push(`> ${convertPikeDocToMarkdown(doc.obsolete)}`);
            parts.push('');
        }

        // Copyright notices
        if (doc.copyright && doc.copyright.length > 0) {
            for (const notice of doc.copyright) {
                parts.push(`**© Copyright** ${convertPikeDocToMarkdown(notice)}`);
                parts.push('');
            }
        }

        // Thanks/acknowledgments
        if (doc.thanks && doc.thanks.length > 0) {
            for (const thanks of doc.thanks) {
                parts.push(`**🙏 Thanks** ${convertPikeDocToMarkdown(thanks)}`);
                parts.push('');
            }
        }

        // FIXME notes (similar to notes but for known issues)
        if (doc.fixme && doc.fixme.length > 0) {
            for (const fixme of doc.fixme) {
                parts.push(`**🔧 FIXME** ${convertPikeDocToMarkdown(fixme)}`);
                parts.push('');
            }
        }

        // Constants (enum members)
        if (doc.constants && Object.keys(doc.constants).length > 0) {
            parts.push('**Constants:**');
            parts.push('');
            for (const [name, type] of Object.entries(doc.constants)) {
                parts.push(`- \`${name}\`: \`${type}\``);
            }
            parts.push('');
        }

        // Indexes (for @multiset)
        if (doc.indexes && doc.indexes.length > 0) {
            parts.push('**Indexes:**');
            parts.push('');
            for (const idx of doc.indexes) {
                const label = idx.label || '';
                const text = idx.text || '';
                if (text) {
                    parts.push(`- \`${label}\`: ${convertPikeDocToMarkdown(text)}`);
                } else {
                    parts.push(`- \`${label}\``);
                }
            }
            parts.push('');
        }

        // Types (for @mixed containers)
        if (doc.types && doc.types.length > 0) {
            parts.push('**Types:**');
            parts.push('');
            for (const type of doc.types) {
                parts.push(`- ${convertPikeDocToMarkdown(type)}`);
            }
            parts.push('');
        }
        }
    }

    return parts.join('\n');
}
