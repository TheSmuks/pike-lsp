/**
 * PikeBridge - Public API
 *
 * Extends PikeBridgeBase with all public analysis, Roxen, query engine,
 * health, and diagnostic methods. Core lifecycle and messaging are in
 * bridge-core.ts.
 *
 * @example
 * ```ts
 * const bridge = new PikeBridge({ pikePath: 'pike' });
 * await bridge.start();
 * const result = await bridge.parse('int x = 5;', 'test.pike');
 * console.log(result.symbols);
 * await bridge.stop();
 * ```
 */

import type { InternalBridgeOptions, BridgeHealthCheck } from './bridge-options.js';
import { PikeBridgeBase } from './bridge-core.js';
import * as analysisApi from './bridge-analysis.js';
import * as roxenApi from './bridge-roxen.js';
import * as qeApi from './bridge-query-engine.js';
import * as healthApi from './bridge-health.js';
import { getCompletionContext } from './bridge-completion-cache.js';

// Re-export option types for backward compatibility
export type {
  PikeBridgeOptions,
  InternalBridgeOptions,
  BridgeHealthCheck,
} from './bridge-options.js';

export interface BatchParseMetrics {
  totalMs: number;
  chunkingMs: number;
  ipcMs: number;
  chunkCount: number;
  fileCount: number;
}

export class PikeBridge extends PikeBridgeBase {
  // --- Core analysis ---

  async parse(code: string, filename?: string) {
    return analysisApi.parse(this, code, filename);
  }

  async tokenize(code: string) {
    return analysisApi.tokenize(this, code);
  }

  async compile(code: string, filename?: string) {
    return analysisApi.compile(this, code, filename);
  }

  async resolveModule(modulePath: string, currentFile?: string): Promise<string | null> {
    return analysisApi.resolveModule(this, modulePath, currentFile, this.moduleResolveCache);
  }

  async resolveInclude(includePath: string, currentFile?: string) {
    return analysisApi.resolveInclude(this, includePath, currentFile);
  }

  async analyze(
    code: string,
    include: import('./types.js').AnalysisOperation[],
    filename?: string,
    documentVersion?: number
  ) {
    return analysisApi.analyze(this, code, include, filename, documentVersion);
  }

  // --- Stdlib and paths ---

  async resolveStdlib(modulePath: string) {
    return analysisApi.resolveStdlib(this, modulePath, this.stdlibResolveCache);
  }

  async getPikePaths() {
    return analysisApi.getPikePaths(this);
  }

  async getInherited(className: string) {
    return analysisApi.getInherited(this, className);
  }

  // --- Import and dependency ---

  async extractImports(code: string, filename?: string) {
    return analysisApi.extractImports(this, code, filename);
  }

  async resolveImport(
    importType: import('./types.js').ImportType,
    target: string,
    currentFile?: string
  ) {
    return analysisApi.resolveImport(this, importType, target, currentFile);
  }

  async checkCircular(code: string, filename?: string) {
    return analysisApi.checkCircular(this, code, filename);
  }

  async getWaterfallSymbols(code: string, filename?: string, maxDepth?: number) {
    return analysisApi.getWaterfallSymbols(this, code, filename, maxDepth);
  }

  // --- Debug and navigation ---

  async setDebug(enabled: boolean) {
    return analysisApi.setDebug(this, enabled);
  }

  async findOccurrences(code: string) {
    return analysisApi.findOccurrences(this, code);
  }

  async findRenamePositions(
    code: string,
    symbolName: string,
    line: number,
    character?: number,
    filename?: string
  ) {
    return analysisApi.findRenamePositions(this, code, symbolName, line, character, filename);
  }

  async prepareRename(code: string, line: number, character: number, filename?: string) {
    return analysisApi.prepareRename(this, code, line, character, filename);
  }

  // --- Analysis utilities ---

  async analyzeUninitialized(code: string, filename?: string) {
    return analysisApi.analyzeUninitialized(this, code, filename);
  }

  async evaluateConstant(expression: string, filename?: string) {
    return analysisApi.evaluateConstant(this, expression, filename);
  }

  async parsePreprocessorBlocks(code: string) {
    return analysisApi.parsePreprocessorBlocks(this, code);
  }

  // --- Completion context ---

  async getCompletionContext(
    code: string,
    line: number,
    character: number,
    documentUri?: string,
    documentVersion?: number
  ) {
    return getCompletionContext(this, this.tokenCache, this.debugLog, {
      code,
      line,
      character,
      documentUri,
      documentVersion,
    });
  }

  // --- Batch parse ---

  getBatchParseMetrics() {
    return [...this.batchParseMetrics];
  }

  clearBatchParseMetrics(): void {
    this.batchParseMetrics = [];
  }

  async batchParse(files: Array<{ code: string; filename: string }>) {
    return qeApi.batchParse(this, files, metrics => {
      this.batchParseMetrics.push(metrics);
      this.logger.info('bridge-batch-parse-perf', {
        ...metrics,
        avgIpcMs: (metrics.ipcMs / metrics.chunkCount).toFixed(2),
      });
    });
  }

  // --- Health and version ---

  async checkPike(): Promise<boolean> {
    return healthApi.checkPike(this.options.pikePath);
  }

  async getVersionInfo() {
    return healthApi.getVersionInfo(
      <T>(method: string, params: Record<string, unknown>) => this.sendRequest<T>(method, params),
      this.debugLog
    );
  }

  async getProtocolInfo() {
    return healthApi.getProtocolInfo(
      <T>(method: string, params: Record<string, unknown>) => this.sendRequest<T>(method, params),
      this.debugLog
    );
  }

  async getVersion(): Promise<string | null> {
    return healthApi.getVersion(this.options.pikePath, this.debugLog);
  }

  async healthCheck(): Promise<BridgeHealthCheck> {
    return healthApi.healthCheck(this.options, this.debugLog);
  }

  // --- Roxen ---

  async roxenValidate(code: string, filename: string, moduleInfo?: Record<string, unknown>) {
    return roxenApi.roxenValidate(this, code, filename, moduleInfo);
  }

  async roxenGenerateSkeleton(
    moduleType: string,
    moduleName: string,
    options?: { includeDefvar?: boolean; includeComments?: boolean }
  ) {
    return roxenApi.roxenGenerateSkeleton(this, moduleType, moduleName, options);
  }

  async roxenDetect(code: string, filename?: string) {
    return roxenApi.roxenDetect(this, code, filename);
  }

  async roxenParseTags(code: string, filename?: string) {
    return roxenApi.roxenParseTags(this, code, filename);
  }

  async roxenParseVars(code: string, filename?: string) {
    return roxenApi.roxenParseVars(this, code, filename);
  }

  async roxenGetCallbacks(code: string, filename?: string) {
    return roxenApi.roxenGetCallbacks(this, code, filename);
  }

  async roxenExtractRXMLStrings(code: string, filename?: string) {
    return roxenApi.roxenExtractRXMLStrings(this, code, filename);
  }

  async roxenGetTagCatalog(serverPid?: number) {
    return roxenApi.roxenGetTagCatalog(this, serverPid);
  }

  // --- Query engine ---

  async engineOpenDocument(params: {
    uri: string;
    languageId: string;
    version: number;
    text: string;
  }) {
    return qeApi.engineOpenDocument(this, params);
  }

  async engineChangeDocument(params: {
    uri: string;
    version: number;
    changes: Array<Record<string, unknown>>;
  }) {
    return qeApi.engineChangeDocument(this, params);
  }

  async engineCloseDocument(params: { uri: string }) {
    return qeApi.engineCloseDocument(this, params);
  }

  async engineUpdateConfig(params: { settings: Record<string, unknown> }) {
    return qeApi.engineUpdateConfig(this, params);
  }

  async engineUpdateWorkspace(params: { roots: string[]; added: string[]; removed: string[] }) {
    return qeApi.engineUpdateWorkspace(this, params);
  }

  async engineQuery(params: {
    feature: string;
    requestId: string;
    snapshot: import('./types.js').QueryEngineSnapshotSelector;
    queryParams: Record<string, unknown>;
  }) {
    return qeApi.engineQuery(this, params);
  }

  async engineCancelRequest(params: { requestId: string }) {
    return qeApi.engineCancelRequest(this, params);
  }

  // --- Diagnostics ---

  getDiagnostics(): { options: InternalBridgeOptions; isRunning: boolean; pid: number | null } {
    return {
      options: { ...this.options },
      isRunning: this.isRunning(),
      pid: this.process?.pid ?? null,
    };
  }

  async getStartupMetrics(): Promise<import('./types.js').StartupMetrics> {
    const result = await this.sendRequest<{ startup: import('./types.js').StartupMetrics }>(
      'get_startup_metrics',
      {}
    );
    return result.startup;
  }

  async getCacheStats(): Promise<import('./types.js').CacheStats> {
    return this.sendRequest<import('./types.js').CacheStats>('get_cache_stats', {});
  }

  async getTypeAtPosition(code: string, filename: string, line: number, variableName: string) {
    return this.sendRequest<import('./types.js').TypeAtPositionResult>('get_type_at_position', {
      code,
      filename,
      line,
      variableName,
    });
  }

  async invalidateCache(path: string, transitive = false) {
    return this.sendRequest<import('./types.js').InvalidateCacheResult>('invalidate_cache', {
      path,
      transitive: transitive ? 1 : 0,
    });
  }

  // --- Token cache ---

  invalidateTokenCache(documentUri: string): void {
    this.tokenCache.delete(documentUri);
    this.debugLog(`Token cache invalidated for ${documentUri}`);
  }

  clearTokenCache(): void {
    const size = this.tokenCache.size;
    this.tokenCache.clear();
    this.debugLog(`Cleared ${size} token cache entries`);
  }
}
