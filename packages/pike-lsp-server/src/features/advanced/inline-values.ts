/**
 * Inline Values Handler
 *
 * Provides computed values inline next to variables for debug mode.
 *
 * Features:
 * - Show computed values inline next to local variables
 * - Support basic types: string, number, int, float, array, mapping
 * - Toggle on/off via VSCode setting
 * - Performance: lazy evaluation (only evaluate when requested)
 */

import { Connection, InlineValue, InlineValueParams } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';

/**
 * Register inline values handler.
 */
export function registerInlineValuesHandler(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
  const log = new Logger('Advanced');

  /**
   * Format a value for inline display.
   * Handles basic types: string, number, int, float, array, mapping.
   */
  function formatValue(value: unknown, type?: string): string {
    if (type === 'string') {
      // Truncate long strings
      const str = String(value);
      if (str.length > 50) {
        return `"${str.slice(0, 47)}..."`;
      }
      return `"${str}"`;
    }
    if (type === 'int' || type === 'float') {
      return String(value);
    }
    if (type === 'array' && Array.isArray(value)) {
      const arr = value;
      if (arr.length > 5) {
        return `[${arr
          .slice(0, 4)
          .map(v => formatSimpleValue(v))
          .join(', ')}, ...]`;
      }
      return `[${arr.map(v => formatSimpleValue(v)).join(', ')}]`;
    }
    if (type === 'mapping' && typeof value === 'object' && value !== null) {
      const mapping = value as Record<string, unknown>;
      const entries = Object.entries(mapping);
      if (entries.length > 3) {
        const first = entries
          .slice(0, 2)
          .map(([k, v]) => `${k}: ${formatSimpleValue(v)}`)
          .join(', ');
        return `(${first}, ...)`;
      }
      return `(${entries.map(([k, v]) => `${k}: ${formatSimpleValue(v)}`).join(', ')})`;
    }
    if (type === 'multiset' && Array.isArray(value)) {
      const ms = value;
      return `(${ms.join(', ')})`;
    }
    if (value === null) {
      return 'NULL';
    }
    if (value === undefined) {
      return 'undefined';
    }
    return String(value);
  }

  /**
   * Format a simple value without type-aware formatting.
   */
  function formatSimpleValue(value: unknown): string {
    if (value === null) return 'NULL';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') {
      return value.length > 20 ? `"${value.slice(0, 17)}..."` : `"${value}"`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return `[${value.length}]`;
    }
    if (typeof value === 'object') {
      return '{...}';
    }
    return String(value);
  }

  /**
   * Find variable assignments in the document and evaluate them.
   * Returns inline values for local variables with known constant values.
   */
  connection.languages.inlineValue.on(
    async (params: InlineValueParams): Promise<InlineValue[] | null> => {
      log.debug('Inline values request', { uri: params.textDocument.uri });
      try {
        // Check if inline values are enabled
        const config = services.globalSettings?.inlineValues;
        if (!config?.enabled) {
          return null;
        }

        const uri = params.textDocument.uri;
        const cached = documentCache.get(uri);
        const document = documents.get(uri);

        if (!cached || !document) {
          return null;
        }

        const text = document.getText();
        const inlineValues: InlineValue[] = [];

        // Find variable symbols in the document
        const variables = cached.symbols.filter(s => s.kind === 'variable');

        // Also check for local variables in methods
        const methods = cached.symbols.filter(s => s.kind === 'method');
        for (const method of methods) {
          if (method.children) {
            const localVars = method.children.filter(c => c.kind === 'variable');
            variables.push(...localVars);
          }
        }

        // Need bridge for evaluation
        const bridge = services.bridge?.bridge;
        if (!bridge) return null;

        for (const variable of variables) {
          // Skip private variables
          if (variable.modifiers?.includes('private')) {
            continue;
          }

          // Get variable position
          if (!variable.range) {
            continue;
          }

          // Only show inline values for variables on visible lines
          const varLine = variable.range.start.line;
          if (varLine < params.range.start.line || varLine > params.range.end.line) {
            continue;
          }

          // Extract value expression using symbol ranges from parsed AST.
          // selectionRange covers the variable name; the value is everything
          // between the name end and the declaration end, minus = and ;.
          const selEnd = variable.selectionRange?.end;
          if (!selEnd) continue;

          const valueExpr = extractValueExpr(text, selEnd, variable.range.end);
          if (!valueExpr) continue;

          // Skip complex expressions that can't be evaluated
          if (valueExpr.includes('(') && !valueExpr.match(/^["'[\[{0-9]/)) {
            continue;
          }

          // Try to evaluate the constant expression
          try {
            const result = await bridge.evaluateConstant(valueExpr, document.uri);

            if (result.success && result.value !== undefined) {
              const formattedValue = formatValue(result.value, result.type);

              inlineValues.push({
                range: {
                  start: { line: varLine, character: variable.range!.end.character },
                  end: { line: varLine, character: variable.range!.end.character },
                },
                text: ` = ${formattedValue}`,
              });
            }
          } catch (error) {
            log.debug('Inline value evaluation skipped', {
              expression: valueExpr,
              uri: document.uri,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return inlineValues.length > 0 ? inlineValues : null;
      } catch (err) {
        log.error(
          `Inline values failed for ${params.textDocument.uri}: ${err instanceof Error ? err.message : String(err)}`
        );
        return null;
      }
    }
  );
}

/**
 * Extract the value expression from a Pike constant/variable declaration.
 * Uses the parsed symbol's selectionRange (name end) and range (declaration end)
 * to slice the source text, correctly handling semicolons in strings,
 * multi-line expressions, and nested structures.
 */
function extractValueExpr(
  text: string,
  nameEnd: { line: number; character: number },
  declEnd: { line: number; character: number }
): string | null {
  // nameEnd and declEnd are 0-indexed LSP positions
  const lines = text.split('\n');
  const startLine = nameEnd.line;
  const endLine = declEnd.line;
  if (startLine < 0 || endLine >= lines.length || startLine > endLine) return null;

  let raw = '';
  if (startLine === endLine) {
    raw = lines[startLine]!.slice(nameEnd.character, declEnd.character);
  } else {
    raw = lines[startLine]!.slice(nameEnd.character);
    for (let i = startLine + 1; i < endLine; i++) {
      raw += '\n' + lines[i]!;
    }
    raw += '\n' + lines[endLine]!.slice(0, declEnd.character);
  }

  // Strip leading whitespace, =, and trailing ; whitespace
  const trimmed = raw
    .replace(/^\s*=\s*/, '')
    .replace(/\s*;\s*$/, '')
    .trim();
  return trimmed.length > 0 ? trimmed : null;
}
