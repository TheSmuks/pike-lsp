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
import { registerHoverHandler } from './hover.js';
import { registerDefinitionHandlers } from './definition.js';
import { registerReferencesHandlers } from './references.js';
import { registerImplementationHandler } from './implementation.js';

export { registerHoverHandler } from './hover.js';
export { registerDefinitionHandlers } from './definition.js';
export { registerReferencesHandlers } from './references.js';
export { registerImplementationHandler } from './implementation.js';
export { extractExpressionAtPosition } from './expression-utils.js';

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
    registerHoverHandler(connection, services, documents);
    registerDefinitionHandlers(connection, services, documents);
    registerReferencesHandlers(connection, services, documents);
    registerImplementationHandler(connection, services, documents);
}
