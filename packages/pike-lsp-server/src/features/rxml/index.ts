/**
 * RXML feature module
 * Exports RXML diagnostics, completion, and symbol providers
 */

import type { Connection } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { TextDocuments } from 'vscode-languageserver';
import type { Services } from '../../services/index.js';
import { invalidateRXMLDefinitionCaches } from './definition-provider.js';
import { invalidateRXMLReferenceCaches } from './references-provider.js';

/**
 * Register RXML feature handlers.
 *
 * @param _connection - LSP connection (unused, follows Roxen pattern)
 * @param _services - Server services bundle
 * @param _documents - Text document manager (unused, follows Roxen pattern)
 */
export function registerRXMLHandlers(
  _connection: Connection,
  _services: Services,
  _documents: TextDocuments<TextDocument>
): void {
  // RXML feature integration follows the same pattern as Roxen feature
  // Instead of registering separate LSP handlers, we provide helper functions
  // that existing providers call for RXML-specific enhancements.

  // The actual RXML handlers are registered in the main feature modules:
  // - Completion: EditingFeature calls provideRXMLCompletions() for rxml files
  // - Symbols: SymbolsFeature calls provideRXMLSymbols() for rxml files
  // - Diagnostics: DiagnosticsFeature calls validateRXMLDocument() for rxml files
  //
  // These providers detect RXML files by checking document.languageId === 'rxml'
  // and then apply RXML-specific logic.

  const docs = _documents as unknown as {
    onDidChangeContent?: (listener: (change: { document: TextDocument }) => void) => void;
    onDidClose?: (listener: (change: { document: TextDocument }) => void) => void;
  };

  const invalidateForUri = (uri: string): void => {
    invalidateRXMLDefinitionCaches(uri);
    invalidateRXMLReferenceCaches(uri);
  };

  if (typeof docs.onDidChangeContent === 'function') {
    docs.onDidChangeContent(change => {
      if (change.document.languageId === 'rxml') {
        invalidateForUri(change.document.uri);
      }
    });
  }

  if (typeof docs.onDidClose === 'function') {
    docs.onDidClose(change => {
      if (change.document.languageId === 'rxml') {
        invalidateForUri(change.document.uri);
      }
    });
  }
}

export {
  provideRXMLCompletions,
  getTagCompletions,
  getAttributeCompletions,
  getAttributeValueCompletions,
} from './completion.js';
export {
  RXML_TAG_CATALOG,
  getTagInfo,
  getTagsByType,
  searchTags,
  getDeprecatedTags,
  SCOPE_VARIABLES,
  type RXMLTag,
  type RXMLTagType,
  type RXMLAttribute,
} from './tag-catalog.js';
export {
  validateRXMLDocument,
  checkUnknownTags,
  checkMissingRequiredAttributes,
  checkUnclosedContainerTags,
  checkInvalidAttributeValues,
} from './diagnostics.js';
export { parseRXMLTemplate, isContainerTag, getTagAttributes } from './parser.js';
export { provideRXMLSymbols } from './symbols.js';
export type { RXMLTagInfo, RXMLTagCatalogEntry } from './types.js';

// Phase 5: Tag Catalog Integration
export { extractTagsFromPikeCode } from './module-scanner.js';
export { mergeTags, rxmlTagCatalogManager, RXMLTagCatalogManager } from './catalog-manager.js';

// Phase 6: Advanced LSP Features
export {
  provideRXMLDefinition,
  findTagDefinition,
  findDefvarDefinition,
  invalidateRXMLDefinitionCaches,
  type RoxenTagInfo,
  type RoxenDefvarInfo,
  type RoxenModuleInfo,
} from './definition-provider.js';
export {
  provideRXMLReferences,
  findTagReferences,
  findDefvarReferences,
  invalidateRXMLReferenceCaches,
  findModulesUsingTag,
} from './references-provider.js';
export { prepareRXMLRename, provideRXMLRename } from './rename-provider.js';
export { provideRXMLHover, getModuleConstantHover, getDefvarHover } from './hover-provider.js';
export {
  provideRXMLCodeActions,
  provideRXMLQuickFix,
  type ExtendedModuleInfo,
} from './code-actions-provider.js';
