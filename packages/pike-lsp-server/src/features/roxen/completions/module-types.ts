/**
 * Roxen MODULE_* constant completions
 */

import { CompletionItemKind } from 'vscode-languageserver/node.js';
import type { CompletionItem } from 'vscode-languageserver/node.js';

/**
 * Get completions for Roxen MODULE_* constants
 * Used in: constant module_type = MODULE_*
 */
export function getModuleTypeCompletions(): CompletionItem[] {
    return [
        {
            label: 'MODULE_LOCATION',
            kind: CompletionItemKind.Constant,
            detail: '2 - File serving',
            documentation: 'Module that serves files from the filesystem',
        },
        {
            label: 'MODULE_TAG',
            kind: CompletionItemKind.Constant,
            detail: '5 - RXML tags',
            documentation: 'Module that provides RXML tags (simpletag_*/container_*)',
        },
        {
            label: 'MODULE_PARSER',
            kind: CompletionItemKind.Constant,
            detail: '6 - Content parser',
            documentation: 'Module that parses content types (e.g., HTML parsing)',
        },
        {
            label: 'MODULE_FILTER',
            kind: CompletionItemKind.Constant,
            detail: '15 - Filter',
            documentation: 'Module that filters request/response data',
        },
        {
            label: 'MODULE_LOGGER',
            kind: CompletionItemKind.Constant,
            detail: '14 - Logging',
            documentation: 'Module that provides logging functionality',
        },
        {
            label: 'MODULE_AUTH',
            kind: CompletionItemKind.Constant,
            detail: '9 - Authentication',
            documentation: 'Module that handles user authentication',
        },
        {
            label: 'MODULE_URL',
            kind: CompletionItemKind.Constant,
            detail: '3 - URL module',
            documentation: 'Module that handles URL mapping/redirection',
        },
        {
            label: 'MODULE_PROXY',
            kind: CompletionItemKind.Constant,
            detail: '13 - Proxy',
            documentation: 'Module that acts as a proxy',
        },
        {
            label: 'MODULE_PROVIDER',
            kind: CompletionItemKind.Constant,
            detail: '16 - Provider',
            documentation: 'Module that provides services to other modules',
        },
        {
            label: 'MODULE_DIRECTORIES',
            kind: CompletionItemKind.Constant,
            detail: '12 - Directories',
            documentation: 'Module for directory listing/indexing',
        },
    ];
}
