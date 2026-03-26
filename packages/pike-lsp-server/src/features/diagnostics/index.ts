/**
 * Diagnostics Feature Handlers
 *
 * Provides document validation, diagnostics, and configuration handling.
 * Extracted from server.ts for modular feature organization.
 *
 * Refactored (Issue #136): Split into submodules for maintainability:
 * - utils.ts: Diagnostic conversion utilities
 * - symbol-index.ts: Symbol position index building
 * - change-detection.ts: Incremental change detection
 */

import type {
  Connection,
  TextDocuments,
  Diagnostic,
  Range,
} from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import type { PikeSettings, DocumentCacheEntry } from '../../core/types.js';
import { TypeDatabase, CompiledProgramInfo } from '../../type-database.js';
import { Logger } from '@pike-lsp/core';
import { DIAGNOSTIC_DELAY_DEFAULT, DEFAULT_MAX_PROBLEMS } from '../../constants/index.js';
import { computeContentHash, computeLineHashes } from '../../services/document-cache.js';
import { RequestScheduler, RequestSupersededError } from '../../services/request-scheduler.js';
import { detectRoxenModule, provideRoxenDiagnostics } from '../roxen/index.js';
import { toSchedulerMetricsLogPayload } from '../utils/scheduler-metrics.js';
import { registerDiagnosticsLifecycleHandlers } from './lifecycle.js';

interface PendingChangeState {
  range: Range | undefined;
  hasMultipleChanges: boolean;
}

// Import from split modules
export {
  convertDiagnostic,
  isDeprecatedSymbolDiagnostic,
  extractDeprecatedFromSymbols,
} from './utils.js';
export { buildSymbolNameIndex } from './symbol-index.js';
export {
  buildSymbolPositionIndex,
  buildSymbolPositionIndexRegex,
  flattenSymbols,
} from './symbol-index.js';
export {
  classifyChange,
  stripLineComments,
  type ChangeClassification,
} from './change-detection.js';

export function applySkippedValidationCacheUpdate(
  cachedEntry: DocumentCacheEntry,
  currentVersion: number,
  classification: { newHash?: string; newLineHashes?: number[] }
): void {
  if (classification.newHash) {
    cachedEntry.contentHash = classification.newHash;
  }
  if (classification.newLineHashes) {
    cachedEntry.lineHashes = classification.newLineHashes;
  }
  cachedEntry.version = currentVersion;
}

export function buildStaleFallbackEntry(
  existingEntry: DocumentCacheEntry | undefined,
  version: number,
  diagnostics: Diagnostic[],
  contentHash: string,
  lineHashes: number[]
): DocumentCacheEntry {
  if (existingEntry) {
    return {
      ...existingEntry,
      version,
      diagnostics,
      contentHash,
      lineHashes,
      analysisState: {
        isStale: true,
        parseFailed: true,
      },
    };
  }

  return {
    version,
    symbols: [],
    diagnostics,
    symbolPositions: new Map(),
    symbolNames: new Map(),
    contentHash,
    lineHashes,
    analysisState: {
      isStale: true,
      parseFailed: true,
    },
  };
}

/**
 * Register diagnostics handlers with the LSP connection.
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
  // Import functions from split modules
  const {
    convertDiagnostic,
    isDeprecatedSymbolDiagnostic,
    extractDeprecatedFromSymbols,
  } = require('./utils.js');
  const {
    buildSymbolPositionIndex,
    buildSymbolNameIndex,
    flattenSymbols,
  } = require('./symbol-index.js');
  const { classifyChange } = require('./change-detection.js');

  // NOTE: We access services.bridge dynamically instead of destructuring,
  // because bridge is null when handlers are registered and only initialized later in onInitialize.
  const { documentCache, typeDatabase, workspaceIndex } = services;
  const log = new Logger('diagnostics');

  // Validation timers for debouncing
  const validationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // INC-563: Track expected document version for each debounced validation
  // This prevents stale validations from overwriting fresher results after undo
  const validationVersions = new Map<string, number>();

  // INC-002: Track change ranges for incremental parsing.
  const pendingChangeStates = new Map<string, PendingChangeState>();
  const documentSnapshots = services.documentSnapshots ?? new Map<string, string>();
  const inFlightDiagnosticRequests = new Map<string, string>();
  const pullDiagnosticResultIds = new Map<string, string>();
  const diagnosticsScheduler = new RequestScheduler({ logger: log });
  const SCHEDULER_METRICS_LOG_EVERY = 25;
  let validationCompletions = 0;

  // Configuration settings
  const defaultSettings: PikeSettings = {
    pikePath: 'pike',
    maxNumberOfProblems: DEFAULT_MAX_PROBLEMS,
    diagnosticDelay: DIAGNOSTIC_DELAY_DEFAULT,
  };

  const computePullDiagnosticResultId = (uri: string): string => {
    const cached = documentCache.get(uri);
    const versionPart = cached?.version ?? 0;
    const hashPart = cached?.contentHash ?? `diag-${cached?.diagnostics.length ?? 0}`;
    return `${versionPart}:${hashPart}`;
  };

  if (typeof connection.onRequest === 'function') {
    connection.onRequest('textDocument/diagnostic', async (params: any) => {
      const uri = params?.textDocument?.uri as string | undefined;
      if (!uri) {
        return { kind: 'full', items: [], resultId: '0:diag-0' };
      }

      await documentCache.waitFor(uri);
      const cached = documentCache.get(uri);
      const resultId = computePullDiagnosticResultId(uri);
      pullDiagnosticResultIds.set(uri, resultId);

      if (params?.previousResultId && params.previousResultId === resultId) {
        return {
          kind: 'unchanged',
          resultId,
        };
      }

      return {
        kind: 'full',
        items: cached?.diagnostics ?? [],
        resultId,
      };
    });

    connection.onRequest('workspace/diagnostic', async (params: any) => {
      const previousByUri = new Map<string, string>();
      const previousResultIds = Array.isArray(params?.previousResultIds)
        ? params.previousResultIds
        : [];

      for (const previous of previousResultIds) {
        const uri = previous?.uri;
        const resultId = previous?.value;
        if (typeof uri === 'string' && typeof resultId === 'string') {
          previousByUri.set(uri, resultId);
        }
      }

      const uris = new Set<string>();
      for (const uri of documentCache.keys()) {
        uris.add(uri);
      }

      for (const uri of workspaceIndex.getAllDocumentUris()) {
        uris.add(uri);
      }

      const items: any[] = [];
      for (const uri of uris) {
        await documentCache.waitFor(uri);
        const cached = documentCache.get(uri);
        const resultId = computePullDiagnosticResultId(uri);
        pullDiagnosticResultIds.set(uri, resultId);

        if (previousByUri.get(uri) === resultId) {
          items.push({
            uri,
            kind: 'unchanged',
            resultId,
          });
        } else {
          items.push({
            uri,
            kind: 'full',
            items: cached?.diagnostics ?? [],
            resultId,
          });
        }
      }

      return { items };
    });
  }

  function validateDocumentDebounced(document: TextDocument): void {
    const uri = document.uri;
    const version = document.version;

    // Clear existing timer
    const existingTimer = validationTimers.get(uri);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // INC-563: Store expected version for this scheduled validation
    // This prevents stale validations from overwriting fresher results after undo
    const expectedVersion = version;
    validationVersions.set(uri, expectedVersion);

    // Set new timer
    const timer = setTimeout(() => {
      validationTimers.delete(uri);

      const liveDocument = documents.get(uri);
      if (!liveDocument) {
        validationVersions.delete(uri);
        pendingChangeStates.delete(uri);
        return;
      }

      // INC-563: Check if this validation is stale (a newer version was scheduled)
      const currentVersion = liveDocument.version;
      if (currentVersion !== expectedVersion) {
        validationVersions.delete(uri);
        // Clear pending change range since we're skipping
        pendingChangeStates.delete(uri);
        return;
      }

      // INC-002: Classify change to determine if parsing is needed
      const changeState = pendingChangeStates.get(uri);
      const cachedEntry = documentCache.get(uri);
      const classification = changeState?.hasMultipleChanges
        ? { canSkip: false, reason: 'multiple_change_batch' }
        : classifyChange(liveDocument, changeState?.range, cachedEntry);

      if (classification.canSkip) {
        validationVersions.delete(uri);
        // Skip parsing entirely - just update cache metadata
        if (cachedEntry) {
          applySkippedValidationCacheUpdate(cachedEntry, currentVersion, classification);
        }

        // Clear the pending change range
        pendingChangeStates.delete(uri);
        return;
      }

      // Proceed with full validation
      const promise = diagnosticsScheduler.schedule({
        requestClass: 'typing',
        key: `diagnostics:${uri}`,
        run: async checkpoint => {
          checkpoint();
          await validateDocument(liveDocument, classification, checkpoint);
        },
      });
      documentCache.setPending(uri, promise);
      promise.finally(() => {
        validationVersions.delete(uri);
      });
      promise.catch(err => {
        if (err instanceof RequestSupersededError) {
          return;
        }
        log.error('Debounced validation failed', {
          uri,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, services.globalSettings.diagnosticDelay);

    validationTimers.set(uri, timer);
  }

  /**
   * Validate document and send diagnostics
   * INC-002: Accepts classification to reuse computed hashes
   * LOG-14-01: Logs validation start with version tracking
   */
  async function validateDocument(
    document: TextDocument,
    classification?: import('./change-detection.js').ChangeClassification,
    shouldContinue: () => void = () => {}
  ): Promise<void> {
    const uri = document.uri;
    const version = document.version;

    log.debug('VALIDATE_START', { uri, version });

    const bridge = services.bridge;
    if (!bridge) {
      log.warn('Bridge not available');
      return;
    }

    if (!bridge.isRunning()) {
      connection.console.warn('[VALIDATE] Bridge not running, attempting to start...');
      try {
        await bridge.start();
        log.debug('Bridge started successfully for validation', { uri });
      } catch (err) {
        connection.console.error(`[VALIDATE] Failed to start bridge: ${err}`);
        return;
      }
    }

    const text = document.getText();

    log.debug('Validating document', { uri, version, length: text.length });

    // INC-002: Compute hashes for incremental change detection
    // Use pre-computed hashes from classification if available
    const contentHash = classification?.newHash ?? computeContentHash(text);
    const lineHashes = classification?.newLineHashes ?? computeLineHashes(text);

    // Extract filename from URI and decode URL encoding
    const filename = decodeURIComponent(uri.replace(/^file:\/\//, ''));

    const ensureLatest = (stage: string): boolean => {
      shouldContinue();
      const live = documents.get(uri);
      if (!live || live.version !== version) {
        log.debug('Skipping diagnostics stage for stale version', {
          uri,
          stage,
          validatedVersion: version,
          latestVersion: live?.version,
        });
        return false;
      }
      return true;
    };

    try {
      if (!ensureLatest('pre_analyze')) {
        return;
      }

      log.debug('Calling unified analyze', { filename, version });
      const requestId = `${uri}:${version}:${Date.now()}`;
      const clearInFlightRequest = (): void => {
        inFlightDiagnosticRequests.delete(uri);
      };
      let analyzeResult: import('@pike-lsp/pike-bridge').AnalyzeResponse | null = null;

      try {
        const previousRequestId = inFlightDiagnosticRequests.get(uri);
        if (previousRequestId && previousRequestId !== requestId) {
          try {
            await bridge.engineCancelRequest({ requestId: previousRequestId });
          } catch (err) {
            log.debug('Engine query cancellation for superseded request failed', {
              uri,
              requestId: previousRequestId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const liveBeforeTrack = documents.get(uri);
        if (!liveBeforeTrack || liveBeforeTrack.version !== version) {
          log.debug('Skipping diagnostics request tracking for closed/stale document', {
            uri,
            requestId,
            validatedVersion: version,
            latestVersion: liveBeforeTrack?.version,
          });
          return;
        }

        inFlightDiagnosticRequests.set(uri, requestId);

        const snapshotId = documentSnapshots.get(uri);
        const qeResponse = await bridge.engineQuery({
          feature: 'diagnostics',
          requestId,
          snapshot: snapshotId ? { mode: 'fixed', snapshotId } : { mode: 'latest' },
          queryParams: {
            uri,
            filename,
            version,
            text,
          },
        });

        const responseRevision =
          typeof qeResponse.result['revision'] === 'number'
            ? qeResponse.result['revision']
            : undefined;

        log.debug('Engine query diagnostics response', {
          uri,
          requestId,
          snapshotIdUsed: qeResponse.snapshotIdUsed,
          revision: responseRevision,
        });
        documentSnapshots.set(uri, qeResponse.snapshotIdUsed);

        const candidate = qeResponse.result['analyzeResult'];
        if (candidate && typeof candidate === 'object') {
          analyzeResult = candidate as import('@pike-lsp/pike-bridge').AnalyzeResponse;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/cancel/i.test(message)) {
          log.debug('Engine query diagnostics cancelled', { uri, requestId });
          clearInFlightRequest();
          return;
        }
        log.debug('Engine query diagnostics fallback', {
          uri,
          requestId,
          error: message,
        });
      }

      if (!analyzeResult) {
        log.debug('Engine query diagnostics using analyze fallback', { uri, requestId });
        analyzeResult = await bridge.analyze(
          text,
          ['parse', 'introspect', 'diagnostics', 'tokenize'],
          filename,
          version
        );
      }

      clearInFlightRequest();

      if (!ensureLatest('post_analyze')) {
        return;
      }

      // Log completion status
      const hasParse = !!analyzeResult.result?.parse;
      const hasIntrospect = !!analyzeResult.result?.introspect;
      const hasDiagnostics = !!analyzeResult.result?.diagnostics;
      log.debug('Analyze completed', { uri, hasParse, hasIntrospect, hasDiagnostics });

      // Log cache hit/miss for debugging
      if (analyzeResult._perf) {
        const cacheHit = analyzeResult._perf.cache_hit;
        log.debug('Analyze cache status', { uri, cacheHit });
      }

      // Log any partial failures
      if (analyzeResult.failures && Object.keys(analyzeResult.failures).length > 0) {
        log.debug('Analyze partial failures', {
          uri,
          failures: Object.keys(analyzeResult.failures),
        });
      }

      // Extract results with fallback values for partial failures
      const parseData = analyzeResult.failures?.parse
        ? { symbols: [], diagnostics: [] }
        : (analyzeResult.result?.parse ?? { symbols: [], diagnostics: [] });
      const introspectData = analyzeResult.failures?.introspect
        ? {
            success: 0,
            symbols: [],
            functions: [],
            variables: [],
            classes: [],
            inherits: [],
            diagnostics: [],
          }
        : (analyzeResult.result?.introspect ?? {
            success: 0,
            symbols: [],
            functions: [],
            variables: [],
            classes: [],
            inherits: [],
            diagnostics: [],
          });
      const diagnosticsData = analyzeResult.failures?.diagnostics
        ? { diagnostics: [] }
        : (analyzeResult.result?.diagnostics ?? { diagnostics: [] });
      // PERF-004: Extract tokens for symbolPositions building
      const tokenizeData = analyzeResult.result?.tokenize?.tokens;

      // Convert Pike diagnostics to LSP diagnostics
      const diagnostics: Diagnostic[] = [];
      const lines = text.split('\n');
      const seenDiagnostics = new Set<string>();

      const pushDiagnostic = (diagnostic: Diagnostic): void => {
        if (diagnostics.length >= services.globalSettings.maxNumberOfProblems) {
          return;
        }

        const key = [
          diagnostic.source ?? '',
          diagnostic.code === undefined ? '' : String(diagnostic.code),
          diagnostic.severity ?? '',
          diagnostic.range.start.line,
          diagnostic.range.start.character,
          diagnostic.range.end.line,
          diagnostic.range.end.character,
          diagnostic.message,
        ].join('|');

        if (seenDiagnostics.has(key)) {
          return;
        }

        seenDiagnostics.add(key);
        diagnostics.push(diagnostic);
      };

      // Patterns for module resolution errors we should skip
      const skipPatterns = [
        /Index .* not present in module/i,
        /Indexed module was:/i,
        /Illegal program identifier/i,
        /Not a valid program specifier/i,
        /Failed to evaluate constant expression/i,
      ];

      const shouldSkipDiagnostic = (msg: string): boolean => {
        return skipPatterns.some(pattern => pattern.test(msg));
      };

      // Process diagnostics from introspection
      for (const pikeDiag of introspectData.diagnostics) {
        if (diagnostics.length >= services.globalSettings.maxNumberOfProblems) {
          break;
        }
        // Skip module resolution errors
        if (shouldSkipDiagnostic(pikeDiag.message)) {
          continue;
        }

        // Check if this diagnostic is about a deprecated symbol
        const isDeprecated = isDeprecatedSymbolDiagnostic(pikeDiag.message, introspectData.symbols);

        pushDiagnostic(convertDiagnostic(pikeDiag, document, { deprecated: isDeprecated }, lines));
      }

      // Update type database with introspected symbols if compilation succeeded
      if (introspectData.success && introspectData.symbols.length > 0) {
        if (!ensureLatest('before_type_database_set')) {
          return;
        }

        // Convert introspected symbols to Maps
        const symbolMap = new Map(introspectData.symbols.map(s => [s.name, s]));
        const functionMap = new Map(introspectData.functions.map(s => [s.name, s]));
        const variableMap = new Map(introspectData.variables.map(s => [s.name, s]));
        const classMap = new Map(introspectData.classes.map(s => [s.name, s]));

        // Estimate size
        const sizeBytes = TypeDatabase.estimateProgramSize(symbolMap, introspectData.inherits);

        const programInfo: CompiledProgramInfo = {
          uri,
          version,
          symbols: symbolMap,
          functions: functionMap,
          variables: variableMap,
          classes: classMap,
          inherits: introspectData.inherits,
          imports: new Set(),
          compiledAt: Date.now(),
          sizeBytes,
        };

        typeDatabase.setProgram(programInfo);

        // Also update legacy cache for backward compatibility
        // Merge introspected symbols with parse symbols to get position info
        const legacySymbols: import('@pike-lsp/pike-bridge').PikeSymbol[] = [];

        log.debug('Introspection summary', {
          uri,
          success: introspectData.success,
          symbols: introspectData.symbols.length,
          functions: introspectData.functions?.length ?? 0,
          classes: introspectData.classes?.length ?? 0,
        });

        if (parseData && parseData.symbols.length > 0) {
          // Flatten nested symbols to include class members
          // This ensures get_n, get_e, set_random etc. are indexed
          const flatParseSymbols = flattenSymbols(parseData.symbols);

          log.debug('Flattened parse symbols', {
            uri,
            originalSymbolCount: parseData.symbols.length,
            flattenedSymbolCount: flatParseSymbols.length,
          });

          // Build a set of all parsed symbol names (including flattened) for faster lookup
          const parsedSymbolNames = new Set<string>();
          for (const symbol of flatParseSymbols) {
            if (symbol.name) {
              parsedSymbolNames.add(symbol.name);
            }
          }

          // For each parsed symbol (including nested), enrich with type info from introspection
          for (const parsedSym of flatParseSymbols) {
            // Skip symbols with null names
            if (!parsedSym.name) continue;

            const introspectedSym = introspectData.symbols.find(s => s.name === parsedSym.name);
            if (introspectedSym) {
              // Merge: position from parse, type from introspection
              legacySymbols.push({
                ...parsedSym,
                type: introspectedSym.type,
                modifiers: introspectedSym.modifiers,
              });
            } else {
              // Only in parse results
              legacySymbols.push(parsedSym);
            }
          }

          // Add any introspected symbols not in parse results
          // Check against flattened symbols to avoid missing class methods
          for (const introspectedSym of introspectData.symbols) {
            // Skip symbols with null names
            if (!introspectedSym.name) continue;

            const inParse = parsedSymbolNames.has(introspectedSym.name);
            if (!inParse) {
              const introspectedKind =
                introspectedSym.kind as import('@pike-lsp/pike-bridge').PikeSymbolKind;
              legacySymbols.push({
                name: introspectedSym.name,
                kind: introspectedKind,
                modifiers: introspectedSym.modifiers,
                type: introspectedSym.type,
              });
            }
          }
        } else {
          // No parse results, use introspection only (no positions)
          for (const s of introspectData.symbols) {
            // Skip symbols with null names
            if (!s.name) continue;

            legacySymbols.push({
              name: s.name,
              kind: s.kind as import('@pike-lsp/pike-bridge').PikeSymbolKind,
              modifiers: s.modifiers,
              type: s.type,
            });
          }
        }

        // Resolve include/import dependencies for IntelliSense
        let dependencies: import('../../core/types.js').DocumentDependencies | undefined;
        if (services.includeResolver) {
          dependencies = await services.includeResolver.resolveDependencies(uri, legacySymbols);
          if (!ensureLatest('post_dependency_resolve')) {
            return;
          }
        }

        // P.2 FIX: Store hierarchical symbols (not flattened) so classSymbol.children works
        // Apply extractDeprecatedFromSymbols to preserve class hierarchy with deprecated flags
        const hierarchicalSymbols =
          parseData && parseData.symbols.length > 0
            ? extractDeprecatedFromSymbols(parseData.symbols)
            : legacySymbols;

        const symbolPositions = await buildSymbolPositionIndex(text, legacySymbols, tokenizeData, bridge);
        if (!ensureLatest('post_symbol_index_build')) {
          return;
        }

        const cacheEntry: DocumentCacheEntry = {
          version,
          symbols: hierarchicalSymbols, // Use hierarchical symbols with children preserved
          diagnostics,
          symbolPositions,
          // PERF-005: Build symbol name index for O(1) hover lookups
          symbolNames: buildSymbolNameIndex(hierarchicalSymbols),
          // INC-002: Store hashes for incremental change detection
          contentHash,
          lineHashes,
          // Store introspection for AutoDoc data including @deprecated tags
          introspection: introspectData.success ? introspectData : undefined,
          analysisState: {
            isStale: false,
            parseFailed: false,
          },
        };
        if (dependencies) {
          cacheEntry.dependencies = dependencies;
          if (introspectData.inherits) {
            cacheEntry.inherits = introspectData.inherits;
          }
        }

        documentCache.set(uri, cacheEntry);
        log.debug('Cached document after introspection merge', {
          uri,
          symbolCount: legacySymbols.length,
          introspectionSuccess: introspectData.success,
        });
      } else if (parseData && parseData.symbols.length > 0) {
        // Introspection failed, use parse results
        // P.2 FIX: Extract @deprecated tags from source even when introspection fails
        const symbolsWithDeprecated = extractDeprecatedFromSymbols(parseData.symbols);
        log.debug('Using parse result fallback', {
          uri,
          symbolCount: symbolsWithDeprecated.length,
        });
        // Resolve include/import dependencies for IntelliSense
        let dependencies: import('../../core/types.js').DocumentDependencies | undefined;
        if (services.includeResolver) {
          dependencies = await services.includeResolver.resolveDependencies(
            uri,
            symbolsWithDeprecated
          );
          if (!ensureLatest('post_dependency_resolve_fallback')) {
            return;
          }
        }

        const symbolPositions = await buildSymbolPositionIndex(
          text,
          symbolsWithDeprecated,
          tokenizeData,
          bridge
        );
        if (!ensureLatest('post_symbol_index_build_fallback')) {
          return;
        }

        const cacheEntry: DocumentCacheEntry = {
          version,
          symbols: symbolsWithDeprecated, // Use symbols with deprecated extracted from source
          diagnostics,
          symbolPositions,
          // PERF-005: Build symbol name index for O(1) hover lookups
          symbolNames: buildSymbolNameIndex(symbolsWithDeprecated),
          // INC-002: Store hashes for incremental change detection
          contentHash,
          lineHashes,
          analysisState: {
            isStale: false,
            parseFailed: false,
          },
        };
        if (dependencies) {
          cacheEntry.dependencies = dependencies;
          if (introspectData.inherits) {
            cacheEntry.inherits = introspectData.inherits;
          }
        }

        documentCache.set(uri, cacheEntry);
        log.debug('Cached document from parse result', {
          uri,
          symbolCount: symbolsWithDeprecated.length,
        });
      } else {
        log.debug('No parse result available for document', { uri });
        const staleEntry = buildStaleFallbackEntry(
          documentCache.get(uri),
          version,
          diagnostics,
          contentHash,
          lineHashes
        );
        documentCache.set(uri, staleEntry);
      }

      // Process diagnostics from unified analyze (includes syntax errors + uninitialized warnings)
      if (diagnosticsData.diagnostics && diagnosticsData.diagnostics.length > 0) {
        log.debug('Analyze diagnostics extracted', {
          uri,
          count: diagnosticsData.diagnostics.length,
        });
        for (const diag of diagnosticsData.diagnostics) {
          if (diagnostics.length >= services.globalSettings.maxNumberOfProblems) {
            break;
          }
          // Determine severity: 'error' = 1 (Error), 'warning' = 2 (Warning), default = Error
          const severity = diag.severity === 'warning' ? 2 : 1;
          // Determine source based on diagnostic type
          const source = diag.variable ? 'pike-uninitialized' : 'pike';

          pushDiagnostic({
            severity,
            range: {
              start: {
                line: Math.max(0, (diag.position?.line ?? 1) - 1),
                character: Math.max(0, diag.position?.character ?? 0),
              },
              end: {
                line: Math.max(0, (diag.position?.line ?? 1) - 1),
                character:
                  Math.max(0, diag.position?.character ?? 0) + (diag.variable?.length ?? 10),
              },
            },
            message: diag.message,
            source,
          });
        }
      }

      // --- Roxen diagnostics integration ---
      try {
        if (services.bridge?.bridge) {
          const roxenInfo = await detectRoxenModule(text, uri, services.bridge.bridge);
          if (roxenInfo && roxenInfo.is_roxen_module === 1) {
            const roxenDiags = await provideRoxenDiagnostics(uri, text, services.bridge.bridge, 0);
            if (!ensureLatest('post_roxen_diagnostics')) {
              return;
            }
            for (const roxenDiag of roxenDiags) {
              pushDiagnostic(roxenDiag);
            }
            log.debug('Added Roxen diagnostics', { uri, count: roxenDiags.length });
          }
        }
      } catch (err) {
        log.debug('Roxen diagnostics failed', {
          uri,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      // --- End Roxen integration ---

      const latestBeforePublish = documents.get(uri);
      if (!latestBeforePublish || latestBeforePublish.version !== version) {
        log.debug('Skipping diagnostics publish for stale version', {
          uri,
          validatedVersion: version,
          latestVersion: latestBeforePublish?.version,
        });
        return;
      }

      // Send diagnostics
      connection.sendDiagnostics({ uri, version, diagnostics });
      log.debug('Sent diagnostics', { uri, count: diagnostics.length });

      validationCompletions += 1;
      if (validationCompletions % SCHEDULER_METRICS_LOG_EVERY === 0) {
        const schedulerMetrics = diagnosticsScheduler.snapshotMetrics();
        log.debug('Diagnostics scheduler metrics', {
          uri,
          samples: validationCompletions,
          ...toSchedulerMetricsLogPayload(schedulerMetrics),
        });
      }

      // Log memory stats periodically
      const stats = typeDatabase.getMemoryStats();
      if (stats.programCount % 10 === 0 && stats.programCount > 0) {
        log.debug('Type DB stats', {
          programs: stats.programCount,
          symbols: stats.symbolCount,
          mb: Number((stats.totalBytes / 1024 / 1024).toFixed(1)),
          utilizationPercent: Number(stats.utilizationPercent.toFixed(1)),
        });
      }

      log.debug('Validation complete', { uri, version, diagnostics: diagnostics.length });
    } catch (err) {
      if (err instanceof RequestSupersededError) {
        return;
      }
      inFlightDiagnosticRequests.delete(uri);
      connection.console.error(`[VALIDATE] ✗ Validation failed for ${uri}: ${err}`);
    }
  }

  registerDiagnosticsLifecycleHandlers({
    connection,
    documents,
    services,
    documentCache,
    typeDatabase,
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
    validateDocument,
    validateDocumentDebounced,
    log,
  });
}
