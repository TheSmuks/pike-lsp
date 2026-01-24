
import { CompletionItem, CompletionItemKind, InsertTextFormat, Position, TextEdit } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Generate AutoDoc completion items based on the following function definition.
 */
export function getAutoDocCompletion(document: TextDocument, position: Position): CompletionItem[] {
    const offset = document.offsetAt(position);

    // Get text before cursor on current line
    const text = document.getText();
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineTextBeforeCursor = text.slice(lineStart, offset);

    // Check if we are triggered by //!!
    if (!lineTextBeforeCursor.trim().endsWith('//!!')) {
        return [];
    }

    // Find next function declaration
    let funcSignature: string | null = null;
    let nextLineIdx = position.line + 1;
    const lineCount = document.lineCount;

    while (nextLineIdx < lineCount) {
        const line = document.getText({
            start: { line: nextLineIdx, character: 0 },
            end: { line: nextLineIdx + 1, character: 0 }
        }).trim();

        if (line && !line.startsWith('//') && !line.startsWith('/*')) {
            // Check for potential function signature
            // Heuristic: Must have parentheses and not be a control structure
            const controlKeywords = ['if', 'while', 'for', 'foreach', 'switch', 'catch'];
            const firstWord = line.split(/\s+/)[0];

            if (line.includes('(') && !controlKeywords.includes(firstWord ?? '')) {
                funcSignature = line;
            }
            break;
        }
        nextLineIdx++;
    }

    if (!funcSignature) {
        return [];
    }

    // Parse signature
    // Remove known modifiers
    const modifiers = new Set(['public', 'private', 'protected', 'static', 'final', 'inline', 'nomask', 'variant', 'optional', 'local']);

    // Find the parameter list. It should be the last balanced group of parentheses before the body start.
    // Clean up the line first: remove trailing `{`, `;` and whitespace
    let cleanSignature = funcSignature.trim();
    if (cleanSignature.endsWith('{')) cleanSignature = cleanSignature.slice(0, -1).trim();
    if (cleanSignature.endsWith(';')) cleanSignature = cleanSignature.slice(0, -1).trim();

    // Find the last ')'
    const lastParenIndex = cleanSignature.lastIndexOf(')');
    if (lastParenIndex === -1) return [];

    // Find the matching '('
    let parenDepth = 0;
    let openParenIndex = -1;

    // Scan backwards from lastParenIndex
    for (let i = lastParenIndex; i >= 0; i--) {
        const char = cleanSignature[i];
        if (char === ')') parenDepth++;
        else if (char === '(') parenDepth--;

        if (parenDepth === 0) {
            openParenIndex = i;
            break;
        }
    }

    if (openParenIndex === -1) return [];

    const beforeParen = cleanSignature.substring(0, openParenIndex).trim();
    const argsContent = cleanSignature.substring(openParenIndex + 1, lastParenIndex);

    // Extract name from beforeParen
    // It should be the last word
    // e.g. "mapping(string:int) process_data" -> "process_data"
    // e.g. "void main" -> "main"

    // We also need to filter out modifiers from the beginning?
    // Or just look at the last token.

    // Split by whitespace to find tokens
    // But be careful with types that don't have spaces like "array(int)foo" (bad style but valid?)
    // Assuming standard style with space before name.

    // Let's use regex to find the last identifier
    const nameMatch = beforeParen.match(/([a-zA-Z0-9_]+)$/);
    if (!nameMatch) return [];

    const name = nameMatch[1] as string; // Assert string because we checked !nameMatch

    // Return type is everything before name
    let returnType = beforeParen.substring(0, beforeParen.length - name.length).trim();

    // Clean up modifiers from return type
    const returnTypeParts = returnType.split(/\s+/);
    const cleanReturnTypeParts = returnTypeParts.filter(p => !modifiers.has(p));
    returnType = cleanReturnTypeParts.join(' ');
    if (!returnType) returnType = 'void';

    // Parse arguments
    const args: string[] = [];
    if (argsContent.trim()) {
        // Split by comma, but respect nested parens/angles
        // Simple heuristic: split by comma if not nested
        let currentArg = '';
        let depth = 0;

        for (const char of argsContent) {
            if (char === '(' || char === '<' || char === '{' || char === '[') depth++;
            else if (char === ')' || char === '>' || char === '}' || char === ']') depth--;

            if (char === ',' && depth === 0) {
                // End of arg
                parseArg(currentArg, args);
                currentArg = '';
            } else {
                currentArg += char;
            }
        }
        parseArg(currentArg, args);
    }

    // Build Doc
    const docLines: string[] = [];

    // We want to replace `//!!` with `//!` plus the rest
    // The user typed `//!!`. The completion should replace this.
    // However, VS Code completion replace range usually works on the word being typed.
    // Here we are replacing a symbol.

    // Template content
    // We use snippets for tabstops
    // ${1:description}

    docLines.push(`//! ${name}`);
    docLines.push('//!');
    docLines.push('//! ${1:Description}');
    docLines.push('//!');

    let tabIndex = 2;
    for (const arg of args) {
        docLines.push(`//! @param ${arg}`);
        docLines.push(`//!   \${${tabIndex++}:Description for ${arg}}`);
    }

    if (returnType && returnType !== 'void') {
        docLines.push('//! @returns');
        docLines.push(`//!   \${${tabIndex++}:Description for return value}`);
    }

    const template = docLines.join('\n');

    // Calculate the range to replace: the `//!!` characters before cursor
    // lineTextBeforeCursor ends with `//!!`
    // We want to replace `//!!` with the template.
    // The start character is `offset - 4`. (Wait, offset is global)
    // Character is `position.character - 4`.

    const replaceRange = {
        start: { line: position.line, character: position.character - 4 },
        end: position
    };

    return [{
        label: 'Generate AutoDoc Template',
        kind: CompletionItemKind.Snippet,
        detail: `Auto-generate documentation for ${name}`,
        insertText: template,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: TextEdit.replace(replaceRange, template),
        // Force sort to top
        sortText: '!'
    }];
}

function parseArg(argStr: string, argsList: string[]) {
    const trimmed = argStr.trim();
    if (!trimmed) return;

    // Last token is name
    // int x
    // array(string) y
    // object z
    // function(int:void) callback

    // Split by space, but careful about types with spaces?
    // Actually, we just want the last identifier.
    // Regex for last identifier: /([a-zA-Z0-9_]+)\s*$/

    const match = trimmed.match(/([a-zA-Z0-9_]+)\s*$/);
    if (match && match[1]) {
        // If it's "..." (varargs), handle it?
        // Pike varargs: `mixed ... args`
        argsList.push(match[1]);
    }
}
