/**
 * Extract Method Refactoring
 *
 * Provides 'Extract Method' refactoring for Pike code.
 * Takes selected code and extracts it into a new method.
 *
 * Uses DocumentCacheEntry (symbol table + type data) instead of regex
 * for variable detection and return type inference.
 */

import { CodeAction, CodeActionKind, Range, TextEdit } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol, PikeMethod, PikeVariable, PikeType } from '@pike-lsp/pike-bridge';
import {
  stripCodeContent,
  isIdentPresent,
  isIntegerLiteral,
  isFloatLiteral,
  getLeadingWhitespace,
  tokenizeCode,
} from './extract-method-utils.js';
import type { CodeToken } from './extract-method-utils.js';
import type { DocumentCacheEntry } from '../../core/types.js';

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
 * @param cached - Document cache entry with symbol and type data
 * @returns CodeAction or null if selection is invalid
 */
export function getExtractMethodAction(
  document: TextDocument,
  uri: string,
  range: Range,
  fullText: string,
  onlyKinds: string[] | undefined,
  cached: DocumentCacheEntry
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
  const analysis = analyzeSelectedCode(selectedCode, cached);

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
 * Analyze selected code to determine parameters and return value.
 * Uses symbol-table variable names, type data, and token-based scanning
 * to avoid false matches inside comments and string literals.
 */
function analyzeSelectedCode(
  selectedCode: string,
  cached: DocumentCacheEntry
): { parameters: string[]; returnType: string; returnValue: string | null } {
  const parameters: string[] = [];
  let returnType = 'void';
  let returnValue: string | null = null;

  // Collect variable names and types from the symbol table
  const varTypes = collectVariableTypes(cached.symbols);

  // Strip comments and string literals to avoid false identifier matches
  const strippedCode = stripCodeContent(selectedCode);

  // Check which symbol-table variables are referenced in actual code
  const usedVars = new Set<string>();
  for (const varName of varTypes.keys()) {
    if (isIdentPresent(strippedCode, varName)) {
      usedVars.add(varName);
    }
  }

  // Add used variables as parameters
  parameters.push(...usedVars);

  // Detect return statements using token-based AST walk.
  const tokens = tokenizeCode(selectedCode);
  const returnInfo = detectReturnStatement(selectedCode, tokens);
  if (returnInfo) {
    returnValue = returnInfo.value;
    returnType = inferReturnType(returnInfo.firstExprToken, returnValue, varTypes, cached);
  }

  return { parameters, returnType, returnValue };
}

/**
 * Detect a return statement by walking tokens from the lightweight lexer.
 * Finds a `return` keyword token that is NOT inside a comment or string
 * (the tokenizer already separates those), then collects expression tokens
 * until a semicolon.
 *
 * @param code   - The raw selected code.
 * @param tokens - Tokens produced by `tokenizeCode(code)`.
 */
function detectReturnStatement(
  code: string,
  tokens: CodeToken[]
): { value: string; firstExprToken: CodeToken | null } | null {
  // Find the first 'return' keyword token
  const returnIdx = tokens.findIndex(t => t.kind === 'keyword' && t.text === 'return');
  if (returnIdx === -1) return null;

  // Collect expression tokens after 'return' until ';'
  const exprStart = returnIdx + 1;
  const exprTokens: CodeToken[] = [];
  let semiIdx = -1;

  for (let j = exprStart; j < tokens.length; j++) {
    const tok = tokens[j]!;
    if (tok.kind === 'punctuation' && tok.text === ';') {
      semiIdx = j;
      break;
    }
    // Skip whitespace and comments — they are not part of the expression
    if (tok.kind === 'whitespace' || tok.kind === 'comment') continue;
    exprTokens.push(tok);
  }

  if (semiIdx === -1) return null;

  // Use token offsets to extract the exact text from the original code.
  // This preserves original formatting within the expression span.
  if (exprTokens.length === 0) return null;

  const firstExpr = exprTokens[0]!;
  const lastExpr = exprTokens[exprTokens.length - 1]!;
  const value = code.substring(firstExpr.start, lastExpr.end).trim();
  if (value.length === 0) return null;

  return { value, firstExprToken: firstExpr };
}

/**
 * Infer the return type from a return value expression.
 * Uses token kind for literal detection, the symbol table for variable
 * type lookups, and PikeType data from the cache.
 *
 * @param firstExprToken - First non-whitespace/non-comment token in the return expression.
 * @param returnValue    - The return expression text.
 * @param varTypes       - Map of variable names to their PikeType.
 * @param cached         - Document cache entry with symbol data.
 */
function inferReturnType(
  firstExprToken: CodeToken | null,
  returnValue: string,
  varTypes: Map<string, PikeType | undefined>,
  cached: DocumentCacheEntry
): string {
  // Check if the return value is a known variable with type info
  const varType = varTypes.get(returnValue);
  if (varType) {
    return pikeTypeToString(varType);
  }

  // Try to look up in the symbol name index for any typed symbol
  const sym = cached.symbolNames.get(returnValue);
  if (sym?.type) {
    return pikeTypeToString(sym.type);
  }

  // Use token kind for literal detection — no character-level inspection
  if (firstExprToken) {
    if (firstExprToken.kind === 'string') return 'string';
    if (firstExprToken.kind === 'number') {
      // Distinguish float vs int by checking the token text
      const numText = firstExprToken.text;
      if (numText.includes('.') || numText.includes('e') || numText.includes('E')) {
        return 'float';
      }
      return 'int';
    }
  }

  // Fallback literal checks for compound expressions or negative literals
  if (isIntegerLiteral(returnValue)) return 'int';
  if (isFloatLiteral(returnValue)) return 'float';

  return 'mixed';
}

/**
 * Convert a PikeType to a human-readable type string.
 */
function pikeTypeToString(t: PikeType): string {
  return t.kind;
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
  return getLeadingWhitespace(lineText);
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
 * Recursively collect all variable names with their PikeType from the symbol table.
 * Includes method parameters (which are local variables in scope).
 */
function collectVariableTypes(symbols: PikeSymbol[]): Map<string, PikeType | undefined> {
  const types = new Map<string, PikeType | undefined>();

  for (const sym of symbols) {
    if (sym.kind === 'variable' && sym.name) {
      const variable = sym as PikeVariable;
      types.set(sym.name, variable.type);
    }
    // Method parameters are local variables in scope
    if (sym.kind === 'method' && 'argNames' in sym) {
      const method = sym as PikeMethod;
      for (let i = 0; i < method.argNames.length; i++) {
        const argName = method.argNames[i];
        if (argName) {
          const argType = method.argTypes[i] ?? undefined;
          types.set(argName, argType ?? undefined);
        }
      }
    }
    // Recurse into children (class members, nested scopes)
    if (sym.children) {
      const childTypes = collectVariableTypes(sym.children);
      for (const [name, type] of childTypes) {
        types.set(name, type);
      }
    }
  }

  return types;
}
