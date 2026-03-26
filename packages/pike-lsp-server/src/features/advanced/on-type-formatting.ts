/**
 * On-Type Formatting Handler
 *
 * Provides automatic formatting while typing.
 * Triggers on specific characters like Enter, semicolon, closing brace.
 *
 * Issue #182: Add on-type formatting support
 */

import { Connection, TextEdit, TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';

type OnTypeFormattingRequest = {
  textDocument: { uri: string };
  position: { line: number };
  ch: string;
  options: {
    tabSize?: number;
    insertSpaces?: boolean;
  };
};

type OnTypeFormattingCapableConnection = Connection & {
  languages: Connection['languages'] & {
    onTypeFormatting?: (
      handler: (params: OnTypeFormattingRequest) => Promise<TextEdit[]>,
      triggerCharacters: string[]
    ) => void;
  };
};

/**
 * Register on-type formatting handler.
 */
export function registerOnTypeFormattingHandler(
  connection: Connection,
  _services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const onTypeFormattingConnection = connection as OnTypeFormattingCapableConnection;
  const log = new Logger('OnTypeFormatting');

  // Check if the connection supports on-type formatting
  if (typeof onTypeFormattingConnection.languages.onTypeFormatting !== 'function') {
    log.debug('On-type formatting support not available in this LSP connection version');
    return;
  }

  // Characters that trigger formatting
  const triggerCharacters = ['\n', ';', '}'];

  // Register the handler
  onTypeFormattingConnection.languages.onTypeFormatting(async (params): Promise<TextEdit[]> => {
    log.debug('On-type format request', {
      uri: params.textDocument.uri,
      trigger: params.ch[0],
    });

    const uri = params.textDocument.uri;
    const document = documents.get(uri);

    if (!document) {
      return [];
    }

    const text = document.getText();
    const edits: TextEdit[] = [];
    const line = params.position.line;
    const ch = params.ch;

    // Format on newline (Enter key)
    if (ch === '\n') {
      const lineText = document.getText({
        start: { line: line - 1, character: 0 },
        end: { line: line, character: 0 },
      });

      const tabSize = Math.max(1, params.options.tabSize ?? 4);
      const insertSpaces = params.options.insertSpaces ?? true;
      const indentUnit = insertSpaces ? ' '.repeat(tabSize) : '\t';

      // Calculate indentation for the new line
      const indentColumns = calculateIndentation(lineText, text, line - 1, tabSize);
      const newIndent = toIndentText(indentColumns, indentUnit, tabSize, insertSpaces);

      // Replace any existing leading whitespace on the new line (e.g. from VS Code
      // auto-indent) so we don't stack indentation on top of it.
      const newLineText = text.split('\n')[line] ?? '';
      const existingIndentLen = (newLineText.match(/^(\s*)/)?.[1] ?? '').length;

      edits.push({
        range: {
          start: { line, character: 0 },
          end: { line, character: existingIndentLen },
        },
        newText: newIndent,
      });
    }

    // Format on closing brace - align with opening brace
    if (ch === '}') {
      const lineText = document.getText().split('\n')[line] ?? '';

      // Find matching opening brace
      const openingBraceLine = findMatchingOpeningBrace(text, line);
      if (openingBraceLine !== null) {
        const openingLineText = text.split('\n')[openingBraceLine] ?? '';
        const openingIndent = openingLineText.search(/\S|$/);

        const currentIndent = lineText.search(/\S|$/);
        if (currentIndent !== openingIndent) {
          edits.push({
            range: {
              start: { line, character: 0 },
              end: { line, character: currentIndent },
            },
            newText: ' '.repeat(openingIndent),
          });
        }
      }
    }

    log.debug('On-type format edits', { count: edits.length });
    return edits;
  }, triggerCharacters);
}

function toIndentText(
  indentColumns: number,
  indentUnit: string,
  tabSize: number,
  insertSpaces: boolean
): string {
  if (indentColumns <= 0) {
    return '';
  }

  if (insertSpaces) {
    return ' '.repeat(indentColumns);
  }

  const tabs = Math.floor(indentColumns / Math.max(1, tabSize));
  return indentUnit.repeat(Math.max(0, tabs));
}

/**
 * Calculate indentation for a new line based on the previous line.
 *
 * Rules (in order):
 *  1. Line ends with `{`                          → indent + 1 level
 *  2. Line is a braceless control statement        → indent + 1 level
 *     (if/else/while/for/foreach ending with `)`,
 *      or bare "else" / "} else")
 *  3. Otherwise                                    → keep current indent
 */
export function calculateIndentation(
  lineText: string,
  _fullText: string,
  _lineNum: number,
  tabSize: number = 2
): number {
  const trimmed = lineText.trim();
  const currentIndent = getIndentColumns(lineText, tabSize);

  // Opening brace at end of line → indent body
  if (trimmed.endsWith('{')) {
    return currentIndent + tabSize;
  }

  // Braceless control statement (if/else/while/for/foreach without {})
  if (isBracelessControlStatement(trimmed)) {
    return currentIndent + tabSize;
  }

  // Continuation indent: line ends with unbalanced open parens (e.g. function call split
  // across lines). Count only parens on the current line — not across the whole file.
  const netParens = (lineText.match(/\(/g) || []).length - (lineText.match(/\)/g) || []).length;
  if (netParens > 0) {
    return currentIndent + tabSize * 2;
  }

  return currentIndent;
}

/**
 * Returns true when a (trimmed) line is a braceless control statement that
 * should cause the next line to be indented one extra level.
 *
 * Matches:
 *   if (...)          } else if (...)
 *   else              } else
 *   while (...)       for (...)   foreach (...)
 */
function isBracelessControlStatement(trimmed: string): boolean {
  // Lines that already open / close a block are not braceless
  if (trimmed.endsWith('{') || trimmed.endsWith('}') || trimmed.endsWith(';')) {
    return false;
  }
  // Plain "else" or closing-brace variant "} else"
  if (trimmed === 'else' || /^\}\s*else$/.test(trimmed)) {
    return true;
  }
  // Control keywords followed by a parenthesised expression
  return /^(}\s*)?(if|else\s+if|while|for|foreach|do)\b.*\)$/.test(trimmed);
}

function getIndentColumns(lineText: string, tabSize: number): number {
  let columns = 0;
  for (const ch of lineText) {
    if (ch === ' ') {
      columns++;
      continue;
    }
    if (ch === '\t') {
      columns += tabSize;
      continue;
    }
    break;
  }
  return columns;
}

/**
 * Find the line containing the matching opening brace.
 */
export function findMatchingOpeningBrace(text: string, closingBraceLine: number): number | null {
  const lines = text.split('\n');

  // Start at 0 - we'll find the first } and increment from there
  let braceCount = 0;

  // Search backwards from the closing brace line
  for (let i = closingBraceLine; i >= 0; i--) {
    const line = lines[i] ?? '';

    // Process line in reverse to find } before {
    for (let j = line.length - 1; j >= 0; j--) {
      const char = line[j]!;
      if (char === '}') {
        braceCount++;
      } else if (char === '{') {
        braceCount--;
        if (braceCount === 0) {
          return i;
        }
      }
    }
  }

  return null;
}
