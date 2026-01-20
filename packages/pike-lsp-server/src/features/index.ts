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
export { registerNavigationHandlers } from './navigation.js';

// Editing feature - completion, signature help, rename
export { registerEditingHandlers } from './editing.js';

// Hierarchy feature - call and type hierarchy
export { registerHierarchyHandlers } from './hierarchy.js';

// Advanced feature - formatting, semantic tokens, etc.
export { registerAdvancedHandlers } from './advanced.js';

// Export Services type for convenience
export type { Services } from '../services/index.js';
