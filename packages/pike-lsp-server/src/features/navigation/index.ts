/**
 * Navigation Feature Handlers
 *
 * Groups "what is this symbol?" handlers:
 * - Hover: type info and documentation
 * - Definition: go to symbol definition
 * - Declaration: navigate to declaration
 * - TypeDefinition: navigate to type definition
 * - Implementation: find implementations/usages
 * - References: find all symbol references
 * - DocumentHighlight: highlight occurrences
 *
 * Each handler includes try/catch with logging fallback (SRV-12).
 */

import {
    Connection,
} from 'vscode-languageserver/node.js';
import { TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';

export { registerHoverHandler } from './hover.js';
export { registerDefinitionHandlers } from './definition.js';
export { registerReferencesHandlers } from './references.js';

/**
 * Register all navigation handlers with the LSP connection.
 *
 * @param connection - LSP connection
 * @param services - Bundle of server services
 * @param documents - TextDocuments manager for LSP document synchronization
 */
export function registerNavigationHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { registerHoverHandler } = require('./hover.js');
    const { registerDefinitionHandlers } = require('./definition.js');
    const { registerReferencesHandlers } = require('./references.js');

    registerHoverHandler(connection, services, documents);
    registerDefinitionHandlers(connection, services, documents);
    registerReferencesHandlers(connection, services, documents);
}
