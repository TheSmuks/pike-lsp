/**
 * Roxen Module Support Feature
 *
 * Provides LSP enhancements for Roxen WebServer module development:
 * - Module detection (3-layer: fast scan, cache, Pike confirmation)
 * - Symbol enhancement (defvar, RXML tags, lifecycle callbacks)
 * - Diagnostics (missing callbacks, validation errors)
 * - Completion (MODULE_*, TYPE_*, RequestID members, RXML tags)
 *
 * This feature does NOT register separate LSP providers. Instead, it provides
 * helper functions that the main providers call for Roxen-specific enhancements.
 */

import type { Connection } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { TextDocuments } from 'vscode-languageserver';
import type { Services } from '../../services/index.js';
import { invalidateCache } from './detector.js';

/**
 * Register Roxen feature handlers.
 *
 * The Roxen feature integrates with existing LSP providers rather than
 * creating separate ones. This function sets up:
 *
 * 1. Document cache invalidation on document changes
 * 2. Integration hooks for diagnostics, symbols, and completion
 *
 * @param connection - LSP connection
 * @param services - Server services bundle
 * @param documents - Text document manager
 */
export function registerRoxenHandlers(
  _connection: Connection,
  _services: Services,
  documents: TextDocuments<TextDocument>
): void {
  // Invalidate Roxen detection cache when documents change
  documents.onDidChangeContent((change) => {
    invalidateCache(change.document.uri);
  });

  documents.onDidClose((event) => {
    invalidateCache(event.document.uri);
  });

  // Note: The actual Roxen-specific enhancements are applied by:
  // - Diagnostics provider: calls provideRoxenDiagnostics() for Roxen modules
  // - Document symbols provider: calls enhanceRoxenSymbols() for Roxen modules
  // - Completion provider: calls provideRoxenCompletions() in Roxen contexts
  //
  // These providers detect Roxen modules by calling detectRoxenModule()
  // and then apply Roxen-specific logic.
}

// Re-export helper functions for use by other features
export { detectRoxenModule, invalidateCache } from './detector.js';
export { enhanceRoxenSymbols } from './symbols.js';

// Re-export completion helpers
export { provideRoxenCompletions, isRoxenModule } from './completion.js';
export { getRequestIDCompletions } from './completion.js';

// Re-export diagnostics helper
export { provideRoxenDiagnostics } from './diagnostics.js';

// Re-export config helpers
export {
    parseRoxenConfig,
    validateRoxenConfig,
    getRoxenConfigCompletions,
    getDefvarCompletions,
    isInDefvarContext,
    type DefvarDeclaration,
    type RoxenConfig,
    type ConfigError
} from './config.js';

// Re-export types
export * from './types.js';
