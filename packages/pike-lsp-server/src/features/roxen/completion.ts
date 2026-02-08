/**
 * Roxen completions provider
 */

import { CompletionItemKind } from 'vscode-languageserver/node.js';
import type { CompletionItem } from 'vscode-languageserver/node.js';
import type { Position } from 'vscode-languageserver-textdocument';
import type { DocumentCacheEntry } from '../../core/types.js';
import { MODULE_CONSTANTS, TYPE_CONSTANTS, VAR_FLAGS } from './constants.js';

// Re-export request-id completions (keep separate - useful)
export { getRequestIDCompletions } from './completions/request-id.js';

/**
 * Check if a document cache entry represents a Roxen module
 * by checking inherit paths for "module" or "roxen" keywords
 */
export function isRoxenModule(cache: DocumentCacheEntry | undefined): boolean {
  if (!cache || !cache.inherits) {
    return false;
  }

  return cache.inherits.some((inh: any) =>
    inh.path?.toLowerCase().includes('module') ||
    inh.path?.toLowerCase().includes('roxen')
  );
}

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

export function provideRoxenCompletions(
  line: string,
  _position: Position
): CompletionItem[] | null {
  // MODULE_* completions - trigger when cursor is immediately after MODULE_ prefix
  // Pattern: "MODULE_" with no word characters after it (cursor position)
  if (/\bMODULE_\w*$/.test(line)) {
    return getModuleTypeCompletions();
  }

  // TYPE_* completions in defvar args - trigger on TYPE_ prefix
  if (/\bTYPE_\w*$/.test(line)) {
    return getVarTypeCompletions();
  }

  // VAR_* completions - trigger on VAR_ prefix
  if (/\bVAR_\w*$/.test(line)) {
    return getVarFlagCompletions();
  }

  // defvar snippet - trigger when typing "defvar" as a word
  if (/\bdefvar\s*\(\s*$/.test(line)) {
    return [{
      label: 'defvar',
      kind: CompletionItemKind.Snippet,
      insertTextFormat: 2,
      insertText: 'defvar("${1:varname}", "${2:Name String}", TYPE_${3|STRING,FILE,INT,DIR,FLAG,TEXT|}, "${4:Documentation}", ${5:0});',
    }];
  }

  return null;
}
