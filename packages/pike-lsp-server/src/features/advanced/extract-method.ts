/**
 * Extract Method Refactoring
 *
 * Provides 'Extract Method' refactoring for Pike code.
 * Takes selected code and extracts it into a new method.
 */

import {
    CodeAction,
    CodeActionKind,
    Range,
    TextEdit,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Extract Method Result
 */
export interface ExtractMethodResult {
    selectedCode: string;
    functionName: string;
    parameters: string[];
    returnType: string;
    returnValue: string | null;
}

/**
 * Get extract method code action
 *
 * @param document - The text document
 * @param uri - The document URI
 * @param range - The selected range
 * @param fullText - Full document text
 * @param onlyKinds - Optional filter for context.only
 * @returns CodeAction or null if selection is invalid
 */
export function getExtractMethodAction(
    document: TextDocument,
    uri: string,
    range: Range,
    fullText: string,
    onlyKinds?: string[]
): CodeAction | null {
    // Validate selection range
    if (!isValidSelection(range, fullText)) {
        return null;
    }

    // Filter check - return null if filter excludes refactor.extract
    if (onlyKinds && onlyKinds.length > 0) {
        const matches = onlyKinds.some((only) => {
            return CodeActionKind.RefactorExtract === only ||
                   CodeActionKind.RefactorExtract.startsWith(only + '.') ||
                   only.startsWith(CodeActionKind.Refactor + '.');
        });
        if (!matches) {
            return null;
        }
    }

    // Get selected code
    const selectedCode = getSelectedCode(document, range);
    if (!selectedCode || selectedCode.trim().length === 0) {
        return null;
    }

    // Analyze selected code to determine parameters and return value
    const analysis = analyzeSelectedCode(selectedCode, fullText, range);

    // Generate new function name
    const functionName = generateFunctionName(document, range);

    // Build the new function
    const newFunction = buildExtractedFunction(functionName, analysis, selectedCode);

    // Build the replacement call
    const replacement = buildMethodCall(functionName, analysis);

    // Get the indentation of the original code
    const indent = getLineIndent(document, range.start.line);

    // Create text edits
    const edits: TextEdit[] = [];

    // Edit 1: Replace selected code with method call
    edits.push({
        range: range,
        newText: replacement
    });

    // Edit 2: Insert new function (after current function/class ends)
    const insertPosition = findInsertPosition(document, range.end.line);
    const insertText = '\n\n' + indent + newFunction;

    edits.push({
        range: {
            start: insertPosition,
            end: insertPosition
        },
        newText: insertText
    });

    // Return the code action
    return {
        title: `Extract Method '${functionName}'`,
        kind: CodeActionKind.RefactorExtract,
        edit: {
            changes: {
                [uri]: edits
            }
        }
    };
}

/**
 * Validate the selection range
 */
function isValidSelection(range: Range, fullText: string): boolean {
    const lines = fullText.split('\n');

    // Check bounds
    if (range.start.line < 0 || range.start.line >= lines.length) {
        return false;
    }
    if (range.end.line < 0 || range.end.line >= lines.length) {
        return false;
    }

    // End must be after start
    if (range.end.line < range.start.line) {
        return false;
    }
    if (range.end.line === range.start.line && range.end.character <= range.start.character) {
        return false;
    }

    return true;
}

/**
 * Get the selected code from the document
 */
function getSelectedCode(document: TextDocument, range: Range): string {
    return document.getText(range);
}

/**
 * Analyze selected code to determine parameters and return value
 */
function analyzeSelectedCode(
    selectedCode: string,
    fullText: string,
    range: Range
): { parameters: string[]; returnType: string; returnValue: string | null } {
    const parameters: string[] = [];
    let returnType = 'void';
    let returnValue: string | null = null;

    // Simple analysis: look for local variables used in the selection
    // that are defined before the selection

    // Get all lines before the selection
    const linesBefore = fullText.split('\n').slice(0, range.start.line);

    // Find variable declarations before selection
    const varPattern = /\b(int|string|float|array|mapping|program|function|mixed|object)\s+(\w+)\s*=/g;
    const definedVars = new Set<string>();

    for (const line of linesBefore) {
        let match;
        while ((match = varPattern.exec(line)) !== null) {
            definedVars.add(match[2]!);
        }
    }

    // Check which defined variables are used in the selection
    const usedVars = new Set<string>();
    const wordPattern = /\b[a-zA-Z_]\w*\b/g;
    let match;
    while ((match = wordPattern.exec(selectedCode)) !== null) {
        const word = match[0]!;
        // Skip keywords and built-ins
        const keywords = ['int', 'string', 'float', 'array', 'mapping', 'program',
                        'function', 'mixed', 'object', 'void', 'return', 'if', 'else',
                        'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
                        'sizeof', 'array_sizeof', 'm_sizeof', 'this', 'this_program',
                        'true', 'false', 'null'];
        if (!keywords.includes(word) && definedVars.has(word)) {
            usedVars.add(word);
        }
    }

    // Add used variables as parameters
    parameters.push(...usedVars);

    // Determine return type and value
    // Check if selection has a return statement
    if (selectedCode.includes('return')) {
        const returnMatch = selectedCode.match(/return\s+([^;]+);/);
        if (returnMatch) {
            returnValue = returnMatch[1]!.trim();

            // Try to infer type from the return value
            if (returnValue.match(/^\d+$/)) {
                returnType = 'int';
            } else if (returnValue.match(/^["']/)) {
                returnType = 'string';
            } else if (returnValue === '0' || returnValue === '1') {
                returnType = 'int';
            } else if (definedVars.has(returnValue)) {
                // Variable used from outer scope - use its type if we can determine
                returnType = 'mixed';
            } else {
                returnType = 'mixed';
            }
        }
    }

    // If there's no return but assignment to a variable, we return void
    return { parameters, returnType, returnValue };
}

/**
 * Generate a unique function name
 */
function generateFunctionName(_document: TextDocument, _range: Range): string {
    // Try to infer a good name from context
    // For now, use a generic name
    return 'extracted_function';
}

/**
 * Build the extracted function code
 */
function buildExtractedFunction(
    functionName: string,
    analysis: { parameters: string[]; returnType: string; returnValue: string | null },
    selectedCode: string
): string {
    const { parameters, returnType, returnValue } = analysis;

    // Build parameter list
    const paramList = parameters.length > 0
        ? parameters.map(p => `mixed ${p}`).join(', ')
        : '';

    // Format the function body - add proper indentation
    const bodyLines = selectedCode.split('\n');
    const indentedBody = bodyLines.map(line => '    ' + line).join('\n');

    let functionCode = `${returnType} ${functionName}(${paramList}) {\n${indentedBody}\n}`;

    // If there's a return value, we need to wrap it properly
    if (returnValue && !selectedCode.includes('return')) {
        functionCode = `${returnType} ${functionName}(${paramList}) {\n${indentedBody}\n    return ${returnValue};\n}`;
    }

    return functionCode;
}

/**
 * Build the method call to replace the selected code
 */
function buildMethodCall(
    functionName: string,
    analysis: { parameters: string[]; returnType: string; returnValue: string | null }
): string {
    const { parameters, returnValue } = analysis;

    const argList = parameters.length > 0 ? parameters.join(', ') : '';

    if (returnValue) {
        return `${returnValue} = ${functionName}(${argList});`;
    }

    return `${functionName}(${argList});`;
}

/**
 * Get the indentation of a line
 */
function getLineIndent(document: TextDocument, line: number): string {
    const lineText = document.getText({
        start: { line, character: 0 },
        end: { line, character: 1000 }
    });
    const match = lineText.match(/^(\s*)/);
    return match?.[1] ?? '';
}

/**
 * Find where to insert the new function
 * We'll insert after the current line (simplified approach)
 */
function findInsertPosition(document: TextDocument, afterLine: number): { line: number; character: number } {
    const fullText = document.getText();
    const lines = fullText.split('\n');

    // Find the end of the current function or class
    // Simple approach: insert at the end of the current line's containing block
    let insertLine = afterLine;

    // Look for the next line that starts at the same or lower indentation
    for (let i = afterLine + 1; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.trim().length > 0) {
            // Found next statement - insert before it
            insertLine = i;
            break;
        }
    }

    // If we didn't find a better spot, add at end of document
    if (insertLine === afterLine) {
        insertLine = lines.length;
    }

    return { line: insertLine, character: 0 };
}
