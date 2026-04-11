/**
 * Extract Method Refactoring
 *
 * Provides 'Extract Method' refactoring for Pike code.
 * Takes selected code and extracts it into a new method.
 */

import { CodeAction, CodeActionKind, Range, TextEdit } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol, PikeMethod } from '@pike-lsp/pike-bridge';

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
  onlyKinds: string[] | undefined,
  symbols: PikeSymbol[] = []
): CodeAction | null {
  // Validate selection range
  if (!isValidSelection(range, fullText)) {
    return null;
  }

  // Filter check - return null if filter excludes refactor.extract
  if (onlyKinds && onlyKinds.length > 0) {
    const matches = onlyKinds.some(only => {
      return (
        CodeActionKind.RefactorExtract === only ||
        CodeActionKind.RefactorExtract.startsWith(only + '.') ||
        only.startsWith(CodeActionKind.Refactor + '.')
      );
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
  const analysis = analyzeSelectedCode(selectedCode, symbols);

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
    newText: replacement,
  });

  // Edit 2: Insert new function (after current function/class ends)
  const insertPosition = findInsertPosition(document, range.end.line);
  const insertText = '\n\n' + indent + newFunction;

  edits.push({
    range: {
      start: insertPosition,
      end: insertPosition,
    },
    newText: insertText,
  });

  // Return the code action
  return {
    title: `Extract Method '${functionName}'`,
    kind: CodeActionKind.RefactorExtract,
    edit: {
      changes: {
        [uri]: edits,
      },
    },
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
  symbols: PikeSymbol[]
): { parameters: string[]; returnType: string; returnValue: string | null } {
  const parameters: string[] = [];
  let returnType = 'void';
  let returnValue: string | null = null;

  // Collect variable names from the symbol table
  const definedVars = collectVariableNames(symbols);

  // Check which symbol-table variables are referenced in the selection.
  // For each known variable, test whether it appears as a standalone
  // identifier in the selected code. This avoids scanning every word in the
  // text (which would match inside strings/comments) and avoids treating
  // Pike keywords as variable candidates.
  const usedVars = new Set<string>();
  for (const varName of definedVars) {
    if (isIdentPresent(selectedCode, varName)) {
      usedVars.add(varName);
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
 * Test whether `ident` appears as a standalone identifier in `code`.
 * Uses a word-boundary check scoped to a single known name rather than
 * scanning every token in the text — avoids false matches inside strings
 * or comments for identifiers that are not in the symbol table.
 */
function isIdentPresent(code: string, ident: string): boolean {
  // Reject identifiers that would produce an invalid regex pattern
  if (ident.length === 0) return false;
  const escaped = ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}\\b`);
  return pattern.test(code);
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
  const paramList = parameters.length > 0 ? parameters.map(p => `mixed ${p}`).join(', ') : '';

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
    end: { line, character: 1000 },
  });
  const match = lineText.match(/^(\s*)/);
  return match?.[1] ?? '';
}

/**
 * Find where to insert the new function
 * We'll insert after the current line (simplified approach)
 */
function findInsertPosition(
  document: TextDocument,
  afterLine: number
): { line: number; character: number } {
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

/**
 * Recursively collect all variable names from the symbol table.
 * Replaces regex-based variable declaration parsing with symbol-table lookups.
 */
function collectVariableNames(symbols: PikeSymbol[]): Set<string> {
  const names = new Set<string>();

  for (const sym of symbols) {
    if (sym.kind === 'variable' && sym.name) {
      names.add(sym.name);
    }
    // Method parameters are local variables in scope
    if (sym.kind === 'method' && 'argNames' in sym) {
      const method = sym as PikeMethod;
      for (const argName of method.argNames) {
        if (argName) {
          names.add(argName);
        }
      }
    }
    // Recurse into children (class members, nested scopes)
    if (sym.children) {
      const childNames = collectVariableNames(sym.children);
      for (const name of childNames) {
        names.add(name);
      }
    }
  }

  return names;
}
