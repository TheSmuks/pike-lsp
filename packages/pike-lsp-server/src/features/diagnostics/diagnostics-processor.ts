/**
 * Diagnostics Processor
 *
 * Processes analysis results to produce diagnostics and publishes them.
 * Delegates cache building to cache-builder.ts.
 *
 * Extracted from document-validator.ts for maintainability (Issue #1289).
 */

import type { Connection, TextDocuments } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import type { CoreDiagnostic, DocumentCacheEntry } from '../../core/types.js';
import { Logger } from '@pike-lsp/core';
import type { RequestScheduler } from '../../services/request-scheduler.js';
import { detectRoxenModule, provideRoxenDiagnostics } from '../roxen/index.js';
import { toSchedulerMetricsLogPayload } from '../utils/scheduler-metrics.js';
import { toProtocolDiagnostics } from '../../services/protocol-mappers.js';
import {
  analyzeSemantics,
  deduplicateDiagnostics,
  isSemanticAnalysisEnabled,
} from './semantic-analyzer.js';
import { flattenSymbols } from './symbol-index.js';
import { convertDiagnostic, isDeprecatedSymbolDiagnostic } from './utils.js';
import {
  buildCacheWithIntrospection,
  buildCacheParseOnly,
  buildCacheStaleFallback,
  type CacheBuildContext,
} from './cache-builder.js';

/** Raw analysis data extracted from bridge response */
export interface AnalysisResults {
  parseData: {
    symbols: import('@pike-lsp/pike-bridge').PikeSymbol[];
    diagnostics: import('@pike-lsp/pike-bridge').PikeDiagnostic[];
  };
  introspectData: import('@pike-lsp/pike-bridge').IntrospectionResult;
  diagnosticsData: {
    diagnostics: Array<{
      message: string;
      severity?: string;
      position?: { line?: number; character?: number };
      variable?: string;
    }>;
  };
  tokenizeData: import('@pike-lsp/pike-bridge').PikeToken[] | undefined;
  degradedFailureMessage: string | undefined;
}

/** Context for processing, passed from document-validator */
export interface ProcessContext {
  document: TextDocument;
  services: Services;
  connection: Connection;
  documents: TextDocuments<TextDocument>;
  diagnosticsScheduler: RequestScheduler;
  validationCompletions: { value: number };
  contentHash: string;
  lineHashes: number[];
  analysisMode: 'typing' | 'full';
  bridge: NonNullable<Services['bridge']>;
  log: Logger;
  ensureLatest: (stage: string) => boolean;
}

const SCHEDULER_METRICS_LOG_EVERY = 25;

/**
 * Process analysis results and publish diagnostics.
 *
 * Handles:
 * 1. Introspection diagnostics collection (with deprecated/unused symbol support)
 * 2. Cache entry building (delegated to cache-builder.ts)
 * 3. Analyze diagnostics processing (syntax errors, uninitialized warnings)
 * 4. Roxen diagnostics integration
 * 5. Semantic analysis integration
 * 6. Diagnostics publishing
 */
export async function processAnalysisResults(
  results: AnalysisResults,
  ctx: ProcessContext
): Promise<void> {
  const {
    document,
    services,
    connection,
    documents,
    diagnosticsScheduler,
    validationCompletions,
    contentHash,
    lineHashes,
    analysisMode,
    bridge,
    log,
    ensureLatest,
  } = ctx;

  const uri = document.uri;
  const version = document.version;
  const text = document.getText();
  const { parseData, introspectData, diagnosticsData, tokenizeData, degradedFailureMessage } =
    results;

  // Convert Pike diagnostics to LSP diagnostics
  const diagnostics: CoreDiagnostic[] = [];
  const lines = text.split('\n');
  const seenDiagnostics = new Set<string>();

  const pushDiagnostic = (diagnostic: CoreDiagnostic): void => {
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

  // Patterns for module resolution errors to skip
  const skipPatterns = [
    /Index .* not present in module/i,
    /Indexed module was:/i,
    /Illegal program identifier/i,
    /Not a valid program specifier/i,
    /Failed to evaluate constant expression/i,
  ];
  const shouldSkipDiagnostic = (msg: string): boolean =>
    skipPatterns.some(pattern => pattern.test(msg));

  // Build symbol position map for related info lookup
  const symbolPositionMap = new Map<string, { line: number; character: number; name: string }>();
  const flatSymbols =
    parseData && parseData.symbols.length > 0 ? flattenSymbols(parseData.symbols) : [];

  for (const sym of flatSymbols) {
    if (sym.name && sym.position) {
      symbolPositionMap.set(sym.name, {
        name: sym.name,
        line: sym.position.line ?? 1,
        character: sym.position.column ?? 1,
      });
    }
  }

  // Process diagnostics from introspection
  for (const pikeDiag of introspectData.diagnostics) {
    if (diagnostics.length >= services.globalSettings.maxNumberOfProblems) break;
    if (shouldSkipDiagnostic(pikeDiag.message)) continue;

    const isDeprecated = isDeprecatedSymbolDiagnostic(pikeDiag.message, introspectData.symbols);

    // Add related information for unused variable diagnostics
    let relatedLocation: import('./utils.js').DiagnosticRelatedLocation | undefined;
    const msgLower = pikeDiag.message.toLowerCase();
    if (msgLower.includes('unused')) {
      const unusedMatch = pikeDiag.message.match(
        /(?:unused\s+(?:variable\s+)?|is\s+unused[,.]\s*)(['"]?)([a-zA-Z_][a-zA-Z0-9_]*)\1/i
      );
      if (unusedMatch && unusedMatch[2]) {
        const varName = unusedMatch[2];
        const pos = symbolPositionMap.get(varName);
        if (
          pos &&
          (pos.line !== pikeDiag.position.line || pos.character !== pikeDiag.position.column)
        ) {
          relatedLocation = {
            uri,
            range: {
              start: { line: Math.max(0, pos.line - 1), character: Math.max(0, pos.character - 1) },
              end: { line: Math.max(0, pos.line - 1), character: pos.character + varName.length },
            },
            message: 'declared here',
          };
        }
      }
    }

    pushDiagnostic(
      convertDiagnostic(
        pikeDiag,
        document,
        {
          ...(isDeprecated ? { deprecated: true } : {}),
          ...(relatedLocation ? { relatedLocation } : {}),
        },
        lines
      )
    );
  }

  // --- Cache building ---
  const cacheCtx: CacheBuildContext = {
    uri,
    version,
    text,
    lines,
    contentHash,
    lineHashes,
    bridge,
    services,
    documents,
    log,
    ensureLatest,
  };

  if (introspectData.success && introspectData.symbols.length > 0) {
    await buildCacheWithIntrospection(
      parseData,
      introspectData,
      tokenizeData,
      flatSymbols,
      diagnostics,
      cacheCtx
    );
  } else if (parseData && parseData.symbols.length > 0) {
    await buildCacheParseOnly(
      parseData,
      introspectData,
      tokenizeData,
      diagnostics,
      analysisMode,
      cacheCtx
    );
  } else {
    buildCacheStaleFallback(diagnostics, cacheCtx);
  }

  // --- Analyze diagnostics processing ---
  processAnalyzeDiagnostics(
    diagnosticsData,
    diagnostics,
    services,
    uri,
    log,
    pushDiagnostic,
    analysisMode
  );

  if (degradedFailureMessage) {
    pushDiagnostic({
      severity: 1,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      message: `Parse degraded under active edits: ${degradedFailureMessage}`,
      source: 'pike',
    });
  }

  // --- Roxen diagnostics integration ---
  try {
    if (services.bridge?.bridge) {
      const roxenInfo = await detectRoxenModule(text, uri, services.bridge.bridge);
      if (roxenInfo && roxenInfo.is_roxen_module === 1) {
        const roxenDiags = await provideRoxenDiagnostics(uri, text, services.bridge.bridge, 0);
        if (!ensureLatest('post_roxen_diagnostics')) return;
        for (const roxenDiag of roxenDiags) pushDiagnostic(roxenDiag);
        log.debug('Added Roxen diagnostics', { uri, count: roxenDiags.length });
      }
    }
  } catch (err) {
    log.debug('Roxen diagnostics failed', {
      uri,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // --- Semantic analysis integration (Issue #1196) ---
  try {
    if (isSemanticAnalysisEnabled(services.globalSettings)) {
      // In typing mode, introspection wasn't run — use cached introspection
      // from the document cache so inherited/imported symbols are known.
      const introspectionForSemantic = introspectData.success
        ? introspectData
        : analysisMode === 'typing'
          ? (services.documentCache.get(uri) as DocumentCacheEntry | undefined)?.introspection
          : undefined;

      // Skip undefined-symbol detection in typing mode without introspection.
      // Transient parse errors make token streams unreliable.
      const enableUndefined = analysisMode === 'full' || !!introspectionForSemantic;

      const semanticResult = analyzeSemantics(
        document,
        parseData.symbols,
        introspectionForSemantic,
        tokenizeData,
        {
          maxProblems: services.globalSettings.maxNumberOfProblems - diagnostics.length,
          enableUndefinedDetection: enableUndefined,
          enableTypeMismatch: analysisMode === 'full',
          enableMissingCallbacks: analysisMode === 'full',
        }
      );

      const uniqueSemanticDiags = deduplicateDiagnostics(diagnostics, semanticResult.diagnostics);
      for (const diag of uniqueSemanticDiags) {
        if (diagnostics.length >= services.globalSettings.maxNumberOfProblems) break;
        diagnostics.push(diag);
      }

      log.debug('Semantic analysis complete', {
        uri,
        undefinedSymbols: semanticResult.stats.undefinedSymbols,
        typeMismatches: semanticResult.stats.typeMismatches,
        missingCallbacks: semanticResult.stats.missingCallbacks,
        added: uniqueSemanticDiags.length,
      });
    }
  } catch (semanticErr) {
    log.debug('Semantic analysis failed (non-critical)', {
      uri,
      error: semanticErr instanceof Error ? semanticErr.message : String(semanticErr),
    });
  }

  // --- Publish diagnostics ---
  const latestBeforePublish = documents.get(uri);
  if (!latestBeforePublish || latestBeforePublish.version !== version) {
    log.debug('Skipping diagnostics publish for stale version', {
      uri,
      validatedVersion: version,
      latestVersion: latestBeforePublish?.version,
    });
    return;
  }

  connection.sendDiagnostics({ uri, version, diagnostics: toProtocolDiagnostics(diagnostics) });
  log.debug('Sent diagnostics', { uri, count: diagnostics.length });

  validationCompletions.value += 1;
  if (validationCompletions.value % SCHEDULER_METRICS_LOG_EVERY === 0) {
    const schedulerMetrics = diagnosticsScheduler.snapshotMetrics();
    log.debug('Diagnostics scheduler metrics', {
      uri,
      samples: validationCompletions.value,
      ...toSchedulerMetricsLogPayload(schedulerMetrics),
    });
  }

  // Log memory stats periodically
  const stats = services.typeDatabase.getMemoryStats();
  if (stats.programCount % 10 === 0 && stats.programCount > 0) {
    log.debug('Type DB stats', {
      programs: stats.programCount,
      symbols: stats.symbolCount,
      mb: Number((stats.totalBytes / 1024 / 1024).toFixed(1)),
      utilizationPercent: Number(stats.utilizationPercent.toFixed(1)),
    });
  }

  log.debug('Validation complete', { uri, version, diagnostics: diagnostics.length });
}

/**
 * Process analyze diagnostics (syntax errors, uninitialized warnings).
 * Suppresses cascade diagnostics when syntax errors are present.
 * In typing mode, suppresses syntax errors entirely — they're transient
 * artifacts of incomplete code during active editing.
 */
function processAnalyzeDiagnostics(
  diagnosticsData: AnalysisResults['diagnosticsData'],
  diagnostics: CoreDiagnostic[],
  services: Services,
  uri: string,
  log: Logger,
  pushDiagnostic: (d: CoreDiagnostic) => void,
  analysisMode: 'typing' | 'full' = 'full'
): void {
  const rawDiagData = diagnosticsData;
  const hasSyntaxErrors =
    rawDiagData.diagnostics?.some((d: { message?: string }) => {
      const msg = d.message?.toLowerCase() ?? '';
      return msg.includes('syntax error') || msg.includes('unexpected tok_');
    }) ?? false;

  // In typing mode, suppress syntax errors — they're transient artifacts
  // of incomplete code. Full mode (on save/open) will catch real ones.
  if (analysisMode === 'typing' && hasSyntaxErrors) {
    log.debug('Suppressing transient syntax errors in typing mode', {
      uri,
      count: rawDiagData.diagnostics?.length ?? 0,
    });
    return;
  }

  const diagnosticsToProcess = hasSyntaxErrors
    ? {
        diagnostics:
          rawDiagData.diagnostics?.filter((d: { message?: string }) => {
            const msg = d.message?.toLowerCase() ?? '';
            return msg.includes('syntax error') || msg.includes('unexpected tok_');
          }) ?? [],
      }
    : diagnosticsData;

  if (diagnosticsToProcess.diagnostics && diagnosticsToProcess.diagnostics.length > 0) {
    log.debug('Analyze diagnostics extracted', {
      uri,
      count: diagnosticsToProcess.diagnostics.length,
    });
    for (const diag of diagnosticsToProcess.diagnostics) {
      if (diagnostics.length >= services.globalSettings.maxNumberOfProblems) break;
      const severity = diag.severity === 'warning' ? 2 : 1;
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
            character: Math.max(0, diag.position?.character ?? 0) + (diag.variable?.length ?? 10),
          },
        },
        message: diag.message,
        source,
      });
    }
  }
}
