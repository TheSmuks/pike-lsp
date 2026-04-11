/**
 * Roxen completions provider
 */

import { CompletionItemKind } from 'vscode-languageserver/node.js';
import type { CompletionItem } from 'vscode-languageserver/node.js';
import type { Position } from 'vscode-languageserver-textdocument';
import { MODULE_CONSTANTS, TYPE_CONSTANTS, VAR_FLAGS } from './constants.js';

// Re-export request-id completions (keep separate - useful)
export { getRequestIDCompletions } from './completions/request-id.js';

/**
 * Get MODULE_* completions from constants.ts
 */
function getModuleTypeCompletions(): CompletionItem[] {
  return Object.entries(MODULE_CONSTANTS).map(([name, info]) => ({
    label: name,
    kind: CompletionItemKind.Constant,
    detail: `${info.value} - ${info.description}`,
    documentation: info.description,
  }));
}

/**
 * Get TYPE_* completions from constants.ts
 */
function getVarTypeCompletions(): CompletionItem[] {
  return Object.entries(TYPE_CONSTANTS).map(([name, info]) => ({
    label: name,
    kind: CompletionItemKind.Constant,
    detail: `${info.value} - ${info.description}`,
    documentation: info.description,
  }));
}

/**
 * Get VAR_* completions from constants.ts
 */
function getVarFlagCompletions(): CompletionItem[] {
  return Object.entries(VAR_FLAGS).map(([name, info]) => ({
    label: name,
    kind: CompletionItemKind.Constant,
    detail: `${info.value} - ${info.description}`,
    documentation: info.description,
  }));
}

/**
 * Check if `line` ends with `prefix` preceded by a word boundary.
 * Equivalent to /\b<prefix>\w*$/.test(line) but uses no regex.
 */
function endsWithWordPrefix(line: string, prefix: string): boolean {
  const idx = line.lastIndexOf(prefix);
  if (idx === -1) return false;
  // char before prefix must be non-word (or start of string)
  if (idx > 0) {
    const prev = line.charCodeAt(idx - 1);
    if (isWordChar(prev)) return false;
  }
  // everything after prefix must be word chars
  for (let i = idx + prefix.length; i < line.length; i++) {
    if (!isWordChar(line.charCodeAt(i))) return false;
  }
  return true;
}

function isWordChar(c: number): boolean {
  return (
    (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f
  );
}

/**
 * Check if line ends with `defvar` followed by optional whitespace and `(`.
 * Equivalent to /\bdefvar\s*\(\s*$/.test(line) but uses no regex.
 */
function endsWithDefvarOpenParen(line: string): boolean {
  const idx = line.lastIndexOf('defvar');
  if (idx === -1) return false;
  // char before must be non-word or start of string
  if (idx > 0 && isWordChar(line.charCodeAt(idx - 1))) return false;
  let j = idx + 6; // skip 'defvar'
  while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++;
  if (j >= line.length || line[j] !== '(') return false;
  j++;
  while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++;
  return j === line.length;
}
export function provideRoxenCompletions(
  line: string,
  _position: Position
): CompletionItem[] | null {
  // MODULE_* completions - trigger when cursor is immediately after MODULE_ prefix
  if (endsWithWordPrefix(line, 'MODULE_')) {
    return getModuleTypeCompletions();
  }

  // VAR_* completions - trigger on VAR_ prefix
  if (endsWithWordPrefix(line, 'VAR_')) {
    return getVarFlagCompletions();
  }

  // TYPE_* completions in defvar args - trigger on TYPE_ prefix
  if (endsWithWordPrefix(line, 'TYPE_')) {
    return getVarTypeCompletions();
  }

  // defvar snippet - trigger when typing "defvar" as a word
  if (endsWithDefvarOpenParen(line)) {
    return [
      {
        label: 'defvar',
        kind: CompletionItemKind.Snippet,
        insertTextFormat: 2,
        insertText:
          'defvar("${1:varname}", "${2:Name String}", TYPE_${3|STRING,FILE,INT,DIR,FLAG,TEXT|}, "${4:Documentation}", ${5:0});',
      },
    ];
  }

  return null;
}
