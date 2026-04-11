/**
 * Diagnostics Feature Handlers
 *
 * Provides document validation, diagnostics, and configuration handling.
 * Extracted from server.ts for modular feature organization.
 *
 * Refactored (Issue #1289): Split into submodules for maintainability:
 * - cache-helpers.ts: Cache update and stale fallback utilities
 * - utils.ts: Diagnostic conversion utilities
 * - symbol-index.ts: Symbol position index building
 * - change-detection.ts: Incremental change detection
 * - pull-diagnostics.ts: LSP pull diagnostic request handlers
 * - debounced-validation.ts: Debounced validation with change classification
 * - document-validator.ts: Core document validation logic
 * - lifecycle.ts: LSP lifecycle event handlers (open/change/close/save)
 */

import type { Connection, TextDocuments, Range } from 'vscode-languageserver/node.js';

interface PendingChangeState {
  hasMultipleChanges: boolean;
  range: Range | undefined;
}
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';

import type { PikeSettings } from '../../core/types.js';
import { DIAGNOSTIC_DELAY_DEFAULT, DEFAULT_MAX_PROBLEMS } from '../../constants/index.js';
import { RequestScheduler } from '../../services/request-scheduler.js';
import { Logger } from '@pike-lsp/core';
import { registerDiagnosticsLifecycleHandlers } from './lifecycle.js';
import { registerPullDiagnosticHandlers } from './pull-diagnostics.js';
import { createDebouncedValidation } from './debounced-validation.js';
import { createDocumentValidator } from './document-validator.js';
import { ValidationCycleTracker } from './validation-metrics.js';

// Re-export functions from submodules
export {
  convertDiagnostic,
  isDeprecatedSymbolDiagnostic,
  extractDeprecatedFromSymbols,
  type DiagnosticRelatedLocation,
} from './utils.js';
export {
  buildSymbolNameIndex,
  buildSymbolPositionIndex,
  buildSymbolPositionIndexRegex,
  buildCallPositionIndex,
  flattenSymbols,
} from './symbol-index.js';
export {
  classifyChange,
  stripLineComments,
  type AnalysisMode,
  type ChangeClassification,
} from './change-detection.js';

// NOTE: Type-only re-export to satisfy TypeScript isolatedModules
export {
  analyzeSemantics,
  deduplicateDiagnostics,
  isSemanticAnalysisEnabled,
  type SemanticAnalysisResult,
  type SemanticAnalyzerOptions,
} from './semantic-analyzer.js';

// Re-export cache helpers for test access
export { applySkippedValidationCacheUpdate, buildStaleFallbackEntry } from './cache-helpers.js';

/**
 * Register diagnostics handlers with the LSP connection.
 *
 * Wires together pull diagnostics, debounced validation, document validation,
 * and lifecycle event handlers.
 *
 * @param connection - LSP connection
 * @param services - Server services bundle
 * @param documents - Text document manager
 */
export function registerDiagnosticsHandlers(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  // NOTE: We access services.bridge dynamically instead of destructuring,
  // because bridge is null when handlers are registered and only initialized later in onInitialize.
  const { documentCache, workspaceIndex } = services;
  const log = new Logger('diagnostics');

  // Validation timers for debouncing
  const validationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // INC-563: Track expected document version for each debounced validation
  // This prevents stale validations from overwriting fresher results after undo
  const validationVersions = new Map<string, number>();
  const validationScheduledRevisions = new Map<string, number>();
  const validationRevisions = new Map<string, number>();
  const publishedDiagnosticRevisions = new Map<string, number>();
  const issueValidationRevision = new Map<string, number>();

  // INC-002: Track change ranges for incremental parsing.
  const pendingChangeStates = new Map<string, PendingChangeState>();
  const documentSnapshots = services.documentSnapshots ?? new Map<string, string>();
  const inFlightDiagnosticRequests = new Map<string, string>();
  const pullDiagnosticResultIds = new Map<string, string>();
  const diagnosticsScheduler = new RequestScheduler({ logger: log });
  const validationCompletions = { value: 0 };
  const cycleTracker = new ValidationCycleTracker(log);

  // Configuration settings
  const defaultSettings: PikeSettings = {
    pikePath: 'pike',
    maxNumberOfProblems: DEFAULT_MAX_PROBLEMS,
    diagnosticDelay: DIAGNOSTIC_DELAY_DEFAULT,
  };

  // Create document validator
  const { validateDocument } = createDocumentValidator({
    connection,
    documents,
    services,
    inFlightDiagnosticRequests,
    documentSnapshots,
    diagnosticsScheduler,
    validationCompletions,
    cycleTracker,
    log,
  });

  // Create debounced validation
  const { validateDocumentDebounced } = createDebouncedValidation({
    connection,
    documents,
    services,
    validationTimers,
    validationVersions,
    pendingChangeStates,
    diagnosticsScheduler,
    validateDocument,
    log,
  });

  // Register pull diagnostic handlers
  if (typeof connection.onRequest === 'function') {
    registerPullDiagnosticHandlers(connection, documentCache, workspaceIndex, {
      pullDiagnosticResultIds,
    });
  }

  // Register lifecycle event handlers
  registerDiagnosticsLifecycleHandlers({
    connection,
    documents,
    services,
    documentCache,
    typeDatabase: services.typeDatabase,
    workspaceIndex,
    diagnosticsScheduler,
    defaultSettings,
    getGlobalSettings: () => services.globalSettings,
    setGlobalSettings: settings => {
      services.globalSettings = settings;
    },
    pendingChangeStates,
    documentSnapshots,
    inFlightDiagnosticRequests,
    validationTimers,
    validationVersions,
    validationScheduledRevisions,
    validationRevisions,
    publishedDiagnosticRevisions,
    issueValidationRevision,
    validateDocument,
    validateDocumentDebounced,
    log,
  });
}
