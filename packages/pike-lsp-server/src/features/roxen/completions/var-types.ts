/**
 * Roxen TYPE_* constant completions for defvar()
 */

import { CompletionItemKind } from 'vscode-languageserver/node.js';
import type { CompletionItem } from 'vscode-languageserver/node.js';

/**
 * Get completions for Roxen TYPE_* constants
 * Used in: defvar("name", "Name String", TYPE_*, ...)
 */
export function getVarTypeCompletions(): CompletionItem[] {
    return [
        {
            label: 'TYPE_STRING',
            kind: CompletionItemKind.Constant,
            detail: '0 - String text value',
            documentation: 'Single-line text string input',
        },
        {
            label: 'TYPE_FILE',
            kind: CompletionItemKind.Constant,
            detail: '1 - File path',
            documentation: 'File system path selector',
        },
        {
            label: 'TYPE_INT',
            kind: CompletionItemKind.Constant,
            detail: '2 - Integer',
            documentation: 'Numeric integer value',
        },
        {
            label: 'TYPE_DIR',
            kind: CompletionItemKind.Constant,
            detail: '3 - Directory',
            documentation: 'Directory path selector',
        },
        {
            label: 'TYPE_FLAG',
            kind: CompletionItemKind.Constant,
            detail: '8 - Boolean flag',
            documentation: 'Boolean toggle (yes/no, true/false)',
        },
        {
            label: 'TYPE_TEXT',
            kind: CompletionItemKind.Constant,
            detail: '14 - Multi-line text',
            documentation: 'Multi-line text input field',
        },
        {
            label: 'TYPE_STRING_LIST',
            kind: CompletionItemKind.Constant,
            detail: '4 - String array',
            documentation: 'List of string values',
        },
        {
            label: 'TYPE_LOCATION',
            kind: CompletionItemKind.Constant,
            detail: '12 - URL location',
            documentation: 'URL path location (e.g., /path/)',
        },
        {
            label: 'TYPE_CUSTOM',
            kind: CompletionItemKind.Constant,
            detail: '19 - Custom type',
            documentation: 'Custom variable type with special handling',
        },
    ];
}
