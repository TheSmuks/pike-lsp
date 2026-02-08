/**
 * Roxen RequestID member completions
 */

import { CompletionItemKind } from 'vscode-languageserver/node.js';
import type { CompletionItem } from 'vscode-languageserver/node.js';

/**
 * Get completions for RequestID object members
 * Used in: Roxen module callback functions (void parse(RequestID id))
 */
export function getRequestIDCompletions(): CompletionItem[] {
    return [
        // Properties
        {
            label: 'conf',
            kind: CompletionItemKind.Property,
            detail: 'Configuration - Current server configuration object',
            documentation: 'Access to server configuration and global settings',
        },
        {
            label: 'variables',
            kind: CompletionItemKind.Property,
            detail: 'FakedVariables - Request variables (CGI-style)',
            documentation: 'Multi-value mapping of request variables (form data, query params)',
        },
        {
            label: 'real_variables',
            kind: CompletionItemKind.Property,
            detail: 'multi-value mapping - Raw request variables',
            documentation: 'Access to raw multi-value request variables without decoding',
        },
        {
            label: 'not_query',
            kind: CompletionItemKind.Property,
            detail: 'string - Path without query string',
            documentation: 'Request path with query string removed',
        },
        {
            label: 'query',
            kind: CompletionItemKind.Property,
            detail: 'string - Query string only',
            documentation: 'Query string portion of the URL (after ?)',
        },
        {
            label: 'raw_url',
            kind: CompletionItemKind.Property,
            detail: 'string - Full raw URL',
            documentation: 'Complete unprocessed URL string',
        },
        {
            label: 'request_headers',
            kind: CompletionItemKind.Property,
            detail: 'mapping - HTTP request headers',
            documentation: 'Mapping of incoming HTTP request headers',
        },
        {
            label: 'response_headers',
            kind: CompletionItemKind.Property,
            detail: 'mapping - HTTP response headers',
            documentation: 'Mapping of outgoing HTTP response headers',
        },
        {
            label: 'misc',
            kind: CompletionItemKind.Property,
            detail: 'mapping - Miscellaneous data',
            documentation: 'Generic storage for module-specific data',
        },
        {
            label: 'user',
            kind: CompletionItemKind.Property,
            detail: 'User - Authenticated user',
            documentation: 'Authenticated user object (if authenticated)',
        },
        {
            label: 'prestate',
            kind: CompletionItemKind.Property,
            detail: 'array - Prestate conditions',
            documentation: 'Array of prestate matching conditions',
        },
        {
            label: 'cookies',
            kind: CompletionItemKind.Property,
            detail: 'mapping - HTTP cookies',
            documentation: 'Mapping of cookie name/value pairs',
        },
        {
            label: 'remoteaddr',
            kind: CompletionItemKind.Property,
            detail: 'string - Client IP address',
            documentation: 'IP address of the requesting client',
        },
        {
            label: 'supports',
            kind: CompletionItemKind.Property,
            detail: 'mapping - Client capabilities',
            documentation: 'Information about client capabilities (browser features)',
        },
        {
            label: 'client_var',
            kind: CompletionItemKind.Property,
            detail: 'mapping - Client variables',
            documentation: 'Client-specific variables from Roxen',
        },
        {
            label: 'time',
            kind: CompletionItemKind.Property,
            detail: 'int - Request timestamp',
            documentation: 'Unix timestamp of when the request was received',
        },
        {
            label: 'method',
            kind: CompletionItemKind.Property,
            detail: 'string - HTTP method',
            documentation: 'HTTP request method (GET, POST, etc.)',
        },
        {
            label: 'protocol',
            kind: CompletionItemKind.Property,
            detail: 'string - HTTP protocol version',
            documentation: 'HTTP protocol version (e.g., "HTTP/1.1")',
        },
        {
            label: 'body',
            kind: CompletionItemKind.Property,
            detail: 'string - Request body',
            documentation: 'Raw request body content',
        },
        // Methods
        {
            label: 'set_max_cache()',
            kind: CompletionItemKind.Method,
            detail: 'void set_max_cache(int bytes) - Set cache size',
            documentation: 'Set the maximum cache size for this request',
        },
        {
            label: 'lower_max_cache()',
            kind: CompletionItemKind.Method,
            detail: 'void lower_max_cache(int bytes) - Reduce cache size',
            documentation: 'Decrease the maximum cache size for this request',
        },
        {
            label: 'raise_max_cache()',
            kind: CompletionItemKind.Method,
            detail: 'void raise_max_cache(int bytes) - Increase cache size',
            documentation: 'Increase the maximum cache size for this request',
        },
        {
            label: 'url_base()',
            kind: CompletionItemKind.Method,
            detail: 'string url_base() - Get base URL',
            documentation: 'Get the base URL for this request',
        },
    ];
}
