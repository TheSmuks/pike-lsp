/**
 * Roxen completions provider
 */

import type { CompletionItem } from 'vscode-languageserver';
import type { Position } from 'vscode-languageserver-textdocument';
import type { DocumentCacheEntry } from '../../core/types.js';

// Re-export completion helpers for testing
export { getModuleTypeCompletions } from './completions/module-types.js';
export { getVarTypeCompletions } from './completions/var-types.js';
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

export function provideRoxenCompletions(
  line: string,
  _position: Position
): CompletionItem[] | null {
  // MODULE_* completions
  if (line.includes('MODULE_') && !line.match(/MODULE_\w+$/)) {
    return [
      { label: 'MODULE_LOCATION', kind: 12, detail: '2' },
      { label: 'MODULE_TAG', kind: 12, detail: '5' },
      { label: 'MODULE_PARSER', kind: 12, detail: '6' },
      { label: 'MODULE_FILTER', kind: 12, detail: '15' },
      { label: 'MODULE_LOGGER', kind: 12, detail: '14' },
      { label: 'MODULE_AUTH', kind: 12, detail: '9' },
      { label: 'MODULE_URL', kind: 12, detail: '3' },
      { label: 'MODULE_PROXY', kind: 12, detail: '13' },
      { label: 'MODULE_PROVIDER', kind: 12, detail: '16' },
      { label: 'MODULE_DIRECTORIES', kind: 12, detail: '12' },
    ];
  }

  // TYPE_* completions in defvar args
  if (/defvar\s*\(\s*"[^"]*",\s*[^,]*,\s*$/.test(line)) {
    return [
      { label: 'TYPE_STRING', kind: 12, detail: '0' },
      { label: 'TYPE_FILE', kind: 12, detail: '1' },
      { label: 'TYPE_INT', kind: 12, detail: '2' },
      { label: 'TYPE_DIR', kind: 12, detail: '3' },
      { label: 'TYPE_FLAG', kind: 12, detail: '8' },
      { label: 'TYPE_TEXT', kind: 12, detail: '14' },
    ];
  }

  // VAR_* completions
  if (line.includes('VAR_')) {
    return [
      { label: 'VAR_EXPERT', kind: 12, detail: '1 << 8' },
      { label: 'VAR_MORE', kind: 12, detail: '1 << 9' },
      { label: 'VAR_DEVELOPER', kind: 12, detail: '1 << 10' },
      { label: 'VAR_INITIAL', kind: 12, detail: '1 << 11' },
    ];
  }

  // defvar snippet
  if (line.match(/defvar\s*\($/)) {
    return [{
      label: 'defvar',
      kind: 15,
      insertTextFormat: 2,
      insertText: 'defvar("${1:varname}", "${2:Name String}", TYPE_${3|STRING,FILE,INT,DIR,FLAG,TEXT|}, "${4:Documentation}", ${5:0});',
    }];
  }

  return null;
}
