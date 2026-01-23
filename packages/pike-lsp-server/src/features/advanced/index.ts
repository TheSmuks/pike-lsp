/**
 * Advanced Feature Handlers
 *
 * Groups advanced LSP feature handlers:
 * - Folding Range: code folding regions
 * - Semantic Tokens: rich syntax highlighting
 * - Inlay Hints: parameter names and type hints
 * - Selection Ranges: smart selection expansion
 * - Code Actions: quick fixes and refactorings
 * - Document Formatting: code formatting
 * - Document Links: clickable file paths
 * - Code Lens: reference counts and quick actions
 *
 * Each handler includes try/catch with logging fallback (SRV-12).
 */

import {
    Connection,
    TextDocuments,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import type { PikeSettings } from '../../core/types.js';

export { registerFoldingRangeHandler } from './folding.js';
export { registerSemanticTokensHandler } from './semantic-tokens.js';
export { registerInlayHintsHandler } from './inlay-hints.js';
export { registerSelectionRangesHandler } from './selection-ranges.js';
export { registerCodeActionsHandler } from './code-actions.js';
export { registerFormattingHandlers } from './formatting.js';
export { registerDocumentLinksHandler } from './document-links.js';
export { registerCodeLensHandlers } from './code-lens.js';

/**
 * Register all advanced feature handlers with the LSP connection.
 *
 * @param connection - LSP connection
 * @param services - Bundle of server services
 * @param documents - TextDocuments manager for LSP document synchronization
 * @param globalSettings - Current global settings (mutable)
 * @param includePaths - Include paths for module resolution (mutable)
 */
export function registerAdvancedHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>,
    _globalSettings: PikeSettings,
    includePaths: string[]
): void {
    const { registerFoldingRangeHandler } = require('./folding.js');
    const { registerSemanticTokensHandler } = require('./semantic-tokens.js');
    const { registerInlayHintsHandler } = require('./inlay-hints.js');
    const { registerSelectionRangesHandler } = require('./selection-ranges.js');
    const { registerCodeActionsHandler } = require('./code-actions.js');
    const { registerFormattingHandlers } = require('./formatting.js');
    const { registerDocumentLinksHandler } = require('./document-links.js');
    const { registerCodeLensHandlers } = require('./code-lens.js');

    registerFoldingRangeHandler(connection, services, documents);
    registerSemanticTokensHandler(connection, services, documents);
    registerInlayHintsHandler(connection, services, documents);
    registerSelectionRangesHandler(connection, services, documents);
    registerCodeActionsHandler(connection, services, documents);
    registerFormattingHandlers(connection, services, documents);
    registerDocumentLinksHandler(connection, services, documents, _globalSettings, includePaths);
    registerCodeLensHandlers(connection, services, documents);
}
