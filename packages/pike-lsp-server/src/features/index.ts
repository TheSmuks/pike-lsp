/**
 * Feature Module Exports
 *
 * Re-exports all feature registration functions for convenient importing.
 * Feature handlers group related LSP capabilities into cohesive modules.
 */

// Symbols feature - document and workspace symbol providers
export { registerSymbolsHandlers } from './symbols.js';

// Diagnostics feature - validation and document lifecycle
export { registerDiagnosticsHandlers } from './diagnostics.js';

// Navigation feature - go to definition, references, etc.
export { registerNavigationHandlers } from './navigation/index.js';

// Editing feature - completion, signature help, rename
export { registerEditingHandlers } from './editing/index.js';

// Hierarchy feature - call and type hierarchy
export { registerHierarchyHandlers } from './hierarchy.js';

// Advanced feature - formatting, semantic tokens, etc.
export { registerAdvancedHandlers } from './advanced/index.js';

// Roxen feature - Roxen module support (Phase 3)
export { registerRoxenHandlers, detectRoxenModule, enhanceRoxenSymbols } from './roxen/index.js';
export type { RoxenModuleInfo, RXMLTag, ModuleVariable } from './roxen/types.js';

// RXML feature - RXML template support (Phase 2)
export { registerRXMLHandlers } from './rxml/index.js';
export {
  provideRXMLCompletions,
  parseRXMLTemplate,
  getTagInfo,
  RXML_TAG_CATALOG,
  SCOPE_VARIABLES
} from './rxml/index.js';
export type {
  RXMLTagInfo,
  RXMLTagCatalogEntry
} from './rxml/index.js';

// Export Services type for convenience
export type { Services } from '../services/index.js';
