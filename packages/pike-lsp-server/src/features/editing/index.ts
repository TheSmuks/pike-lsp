/**
 * Editing Feature Handlers
 *
 * Handlers for code editing operations:
 * - Completion: code completion suggestions
 * - Completion resolve: documentation for selected completion
 * - Signature help: function parameter hints
 * - Prepare rename: validation for rename operations
 * - Rename: symbol renaming across files
 */

import {
    Connection,
    TextDocuments,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import { registerCompletionHandlers } from './completion.js';
import { registerSignatureHelpHandler } from './signature-help.js';
import { registerRenameHandlers } from './rename.js';

export { registerCompletionHandlers } from './completion.js';
export { registerSignatureHelpHandler } from './signature-help.js';
export { registerRenameHandlers } from './rename.js';

/**
 * Register all editing handlers with the LSP connection.
 *
 * @param connection - The LSP connection
 * @param services - The services bundle
 * @param documents - The text documents manager
 */
export function registerEditingHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    registerCompletionHandlers(connection, services, documents);
    registerSignatureHelpHandler(connection, services, documents);
    registerRenameHandlers(connection, services, documents);
}
