
import { CompletionItem, CompletionItemKind, InsertTextFormat, Position, Range, TextEdit } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * AutoDoc trigger sequence: //!
 *
 * When the user types the second '!', we should trigger the autodoc
 * completion that generates documentation based on the function signature
 * on the following line.
 */
export function getAutoDocCompletion(document: TextDocument, position: Position): CompletionItem[] {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Get the current line's text
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineEnd = text.indexOf('\n', offset);
    const currentLine = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);

    // Get text before cursor on current line
    const lineTextBeforeCursor = text.slice(lineStart, offset);

    // Trigger condition: The line should be `//!` or `//!!`
    // - When typing the second `!`, lineTextBeforeCursor is `//!`
    // - When done typing the second `!`, lineTextBeforeCursor is `//!!`
    const trimmedLine = lineTextBeforeCursor.trim();

    // Trigger if we have `//!` (just typed second !) or `//!!` (cursor after)
    const isTrigger = trimmedLine === '//!' || trimmedLine.startsWith('//!!');

    if (!isTrigger) {
        return [];
    }

    // Find the next line with the function signature
    let funcSignature: string | null = null;
    let nextLineIdx = position.line + 1;
    const lineCount = document.lineCount;

    while (nextLineIdx < lineCount) {
        const lineContent = document.getText({
            start: { line: nextLineIdx, character: 0 },
            end: { line: nextLineIdx + 1, character: 0 }
        });

        const trimmedLine = lineContent.trim();

        // Skip empty lines and comment lines
        if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
            nextLineIdx++;
            continue;
        }

        // Check if this looks like a function/method signature
        // Must have parentheses and not be a control structure
        const controlKeywords = ['if', 'while', 'for', 'foreach', 'switch', 'catch', 'do', 'else', 'class', 'enum', 'typedef'];
        const firstWord = trimmedLine.split(/\s+/)[0] || '';

        if (trimmedLine.includes('(') && !controlKeywords.includes(firstWord)) {
            funcSignature = trimmedLine;
        }
        break;
    }

    if (!funcSignature) {
        return [];
    }

    // Parse the function signature to extract name, return type, and parameters
    const parsed = parseFunctionSignature(funcSignature);
    if (!parsed) {
        return [];
    }

    // Build the AutoDoc template
    const template = buildAutoDocTemplate(parsed);

    // Find the //!! position for the replace range
    const bangBangIndex = currentLine.indexOf('//!!');
    if (bangBangIndex === -1) {
        return [];
    }

    // Replace from start of //!! to the end of the line
    // This ensures we replace all of //!! even if cursor is mid-way
    const replaceRange: Range = {
        start: { line: position.line, character: bangBangIndex },
        end: { line: position.line, character: currentLine.length }
    };

    return [{
        label: '//!! AutoDoc Template',
        kind: CompletionItemKind.Snippet,
        detail: `${parsed.name}(${parsed.args.join(', ')})`,
        insertText: template,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: TextEdit.replace(replaceRange, template),
        // Force sort to top
        sortText: '0!!',
        // Preselect so it's automatically selected
        preselect: true,
        // Accept with common characters for quick insertion
        commitCharacters: [' ', '\t', ';'],
    }];
}

/**
 * Parse a Pike function signature to extract components
 */
interface ParsedSignature {
    name: string;
    returnType: string;
    args: string[];
    hasVoidReturn: boolean;
}

function parseFunctionSignature(signature: string): ParsedSignature | null {
    // Clean up: remove trailing {, ;, or whitespace
    let clean = signature.trim();
    if (clean.endsWith('{')) clean = clean.slice(0, -1).trim();
    if (clean.endsWith(';')) clean = clean.slice(0, -1).trim();

    // Find the parameter list: last balanced parentheses
    const lastParen = clean.lastIndexOf(')');
    if (lastParen === -1) return null;

    // Find matching opening paren
    let depth = 0;
    let openParen = -1;
    for (let i = lastParen; i >= 0; i--) {
        if (clean[i] === ')') depth++;
        else if (clean[i] === '(') depth--;
        if (depth === 0) {
            openParen = i;
            break;
        }
    }

    if (openParen === -1) return null;

    const beforeParen = clean.substring(0, openParen).trim();
    const argsContent = clean.substring(openParen + 1, lastParen);

    // Extract function name (last word before parentheses)
    // Handles: "void foo", "int bar(...)", "this_program baz", "mapping(string:int) qux"
    const nameMatch = beforeParen.match(/([a-zA-Z0-9_]+)\s*$/);
    if (!nameMatch || !nameMatch[1]) return null;
    const name: string = nameMatch[1];

    // Return type is everything before the name
    let returnType = beforeParen.substring(0, beforeParen.length - name.length).trim() || 'void';

    // Remove common modifiers from return type
    const modifiers = ['public', 'private', 'protected', 'static', 'final', 'inline', 'nomask', 'variant', 'optional', 'local', 'extern', 'this_program', 'final'];
    const typeParts = returnType.split(/\s+/).filter(p => !modifiers.includes(p));
    returnType = typeParts.join(' ') || 'void';

    // Parse arguments
    const args: string[] = [];
    if (argsContent.trim()) {
        const parsedArgs = parseArguments(argsContent);
        args.push(...parsedArgs);
    }

    return {
        name,
        returnType,
        args,
        hasVoidReturn: returnType === 'void' || returnType === '__EMPTY__'
    };
}

/**
 * Parse function arguments, handling complex types with nested structures
 */
function parseArguments(argsContent: string): string[] {
    const args: string[] = [];
    let current = '';
    let depth = 0;
    let parenDepth = 0; // Track nested parens separately

    for (let i = 0; i < argsContent.length; i++) {
        const char = argsContent[i];

        // Track nested structures but parentheses specially for union types like Gmp.mpz|int
        if (char === '<' || char === '{' || char === '[') depth++;
        else if (char === '>' || char === '}' || char === ']') depth--;
        else if (char === '(') parenDepth++;
        else if (char === ')') parenDepth--;

        if (char === ',' && depth === 0 && parenDepth === 0) {
            // End of argument
            const argName = extractArgumentName(current);
            if (argName) args.push(argName);
            current = '';
        } else {
            current += char;
        }
    }

    // Don't forget the last argument
    if (current.trim()) {
        const argName = extractArgumentName(current);
        if (argName) args.push(argName);
    }

    return args;
}

/**
 * Extract the argument name from a type+name string
 * Handles: "int foo", "Gmp.mpz|int bar", "array(string) baz", "mixed ... args"
 */
function extractArgumentName(argStr: string): string | null {
    const trimmed = argStr.trim();
    if (!trimmed) return null;

    // Handle varargs: "mixed ... args" -> "args"
    const varargsMatch = trimmed.match(/\.\.\s+([a-zA-Z0-9_]+)$/);
    if (varargsMatch && varargsMatch[1]) return varargsMatch[1];

    // For regular arguments, find the last identifier
    // This handles "int foo", "Gmp.mpz|int bar", "array(string) baz"
    const match = trimmed.match(/([a-zA-Z0-9_]+)\s*$/);
    return match && match[1] ? match[1] : null;
}

/**
 * Build the AutoDoc template with snippet placeholders
 */
function buildAutoDocTemplate(parsed: ParsedSignature): string {
    const lines: string[] = [];

    // Main description (first tab stop)
    lines.push('//! ${1:Description}');

    // Parameters
    let tabIndex = 2;
    for (const arg of parsed.args) {
        lines.push(`//! @param ${arg}`);
        lines.push(`//!   \${${tabIndex++}:Description for \`${arg}\`}`);
    }

    // Return value (skip for void functions)
    if (!parsed.hasVoidReturn) {
        lines.push('//! @returns');
        lines.push(`//!   \${${tabIndex++}:Description for return value}`);
    }

    return lines.join('\n');
}
