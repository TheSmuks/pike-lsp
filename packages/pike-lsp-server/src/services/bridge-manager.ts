/**
 * Bridge Manager - PikeBridge wrapper with health monitoring
 *
 * Wraps PikeBridge with lifecycle management and health monitoring.
 * Provides a single interface for feature handlers to interact
 * with the Pike subprocess.
 */

import type {
  PikeBridge,
  PikeVersionInfo,
  ProtocolInfo,
  QueryEngineMutationAck,
  QueryEngineCancelAck,
  QueryEngineQueryResponse,
  QueryEngineSnapshotSelector,
  AnalyzeResponse,
  AnalysisOperation,
} from '@pike-lsp/pike-bridge';
import type { Logger } from '@pike-lsp/core';
import * as fs from 'fs';

/**
 * Pike version information with path details.
 */
export interface PikeVersionInfoWithPath extends PikeVersionInfo {
  /** Absolute path to the Pike executable */
  pikePath: string;
}

/**
 * Health status of the bridge and server.
 */
export interface HealthStatus {
  /** Server uptime in milliseconds */
  serverUptime: number;
  /** Whether the bridge is connected */
  bridgeConnected: boolean;
  /** Pike subprocess PID (if running) */
  pikePid: number | null;
  /** Pike version information with path (detected via RPC) */
  pikeVersion: PikeVersionInfoWithPath | null;
  /** Recent error messages from stderr */
  recentErrors: string[];
  /** PERF-011: Startup timing metrics in milliseconds */
  startupMetrics?: { [key: string]: number } | null;
  /** PERF-013: Whether version info fetch is currently in progress */
  versionFetchPending?: boolean;
}

/**
 * Bridge manager wraps PikeBridge with health monitoring.
 *
 * Tracks server uptime, recent errors, Pike version info, and provides pass-through
 * methods for all PikeBridge functionality.
 */
export class BridgeManager {
  private startTime: number;
  private errorLog: string[] = [];
  private readonly MAX_ERRORS = 5;
  private cachedVersion: PikeVersionInfoWithPath | null = null;
  /** PERF-011: Bridge startup timing tracking */
  private bridgeStartTime: number | null = null;
  /** PERF-011: Startup metrics for health reporting */
  private startupMetrics: { [key: string]: number } | null = null;
  /** PERF-013: Promise tracking for async version fetch */
  private versionFetchPromise: Promise<void> | null = null;

  constructor(
    public readonly bridge: PikeBridge | null,
    private logger: Logger
  ) {
    this.startTime = Date.now();
    this.setupErrorLogging();
  }

  /**
   * Set up error logging from bridge stderr.
   */
  private setupErrorLogging(): void {
    this.bridge?.on('stderr', (msg: string) => {
      if (msg.toLowerCase().includes('error')) {
        this.errorLog.push(msg);
        this.logger.debug('Bridge error logged', { message: msg });
        if (this.errorLog.length > this.MAX_ERRORS) {
          this.errorLog.shift();
        }
      }
    });
  }

  /**
   * Start the bridge subprocess and cache version information.
   * PERF-011: Tracks startup timing for performance monitoring.
   * PERF-013: Fetches version info asynchronously to reduce perceived startup time.
   */
  async start(): Promise<void> {
    if (!this.bridge) return;

    // PERF-011: Record start time before bridge.start()
    this.bridgeStartTime = performance.now();
    await this.bridge.start();
    const bridgeReadyTime = performance.now();

    // PERF-013: Record bridge_ready timing before async version fetch
    this.startupMetrics = {
      bridgeStart: this.bridgeStartTime,
      bridgeReady: bridgeReadyTime,
      bridgeStartDuration: bridgeReadyTime - this.bridgeStartTime,
    };

    // PERF-013: Fetch version info asynchronously (fire and forget)
    // This allows start() to return immediately after subprocess spawn
    this.versionFetchPromise = this.fetchVersionInfoInternal().finally(() => {
      this.versionFetchPromise = null;
    });
  }

  /**
   * PERF-013: Fetch version information asynchronously after bridge starts.
   * This method is called without await to allow start() to return immediately.
   * Version info is cached when the fetch completes.
   */
  private async fetchVersionInfoInternal(): Promise<void> {
    if (!this.bridge) return;

    try {
      const versionFetchStartTime = performance.now();
      const versionInfo = await this.bridge.getVersionInfo();
      const versionFetchTime = performance.now();

      // PERF-013: Update startup metrics with version fetch timing
      this.startupMetrics = {
        ...this.startupMetrics!,
        versionFetch: versionFetchTime,
        versionFetchDuration: versionFetchTime - versionFetchStartTime,
        total: versionFetchTime - this.bridgeStartTime!,
      };

      if (versionInfo) {
        // Get the absolute path to the Pike executable
        // The bridge stores options internally, we need to get the pikePath
        const diagnostics = this.bridge.getDiagnostics();
        const pikePath = diagnostics.options.pikePath;
        let resolvedPath: string;

        if (pikePath === 'pike') {
          // Use 'pike' as the path since we can't resolve it without which/command
          resolvedPath = 'pike';
        } else {
          // Resolve absolute path for custom Pike paths
          resolvedPath = fs.realpathSync(pikePath);
        }

        this.cachedVersion = {
          ...versionInfo,
          pikePath: resolvedPath,
        };
        this.logger.info('Pike version detected (async)', {
          version: versionInfo.version,
          path: resolvedPath,
          startupDuration: (this.startupMetrics?.['total']?.toFixed(2) ?? 'N/A') + 'ms',
        });
      } else {
        this.logger.warn('Failed to get Pike version info via RPC (async)');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn('Failed to get Pike version info (async)', { error: message });
    }
  }

  /**
   * Stop the bridge subprocess.
   */
  async stop(): Promise<void> {
    if (this.bridge) await this.bridge.stop();
    // Clear cached version on stop
    this.cachedVersion = null;
    // PERF-011: Clear startup metrics on stop
    this.startupMetrics = null;
    this.bridgeStartTime = null;
    // PERF-013: Clear version fetch promise on stop
    this.versionFetchPromise = null;
  }

  /**
   * Check if the bridge is running.
   * @returns true if bridge is running
   */
  isRunning(): boolean {
    return this.bridge?.isRunning() ?? false;
  }

  /**
   * Get health status of the bridge and server.
   * PERF-011: Includes startup metrics if available.
   * PERF-013: Reports whether version fetch is pending.
   * @returns Health status information
   */
  async getHealth(): Promise<HealthStatus> {
    return {
      serverUptime: Date.now() - this.startTime,
      bridgeConnected: this.bridge?.isRunning() ?? false,
      pikePid: (this.bridge as any)?.process?.pid ?? null,
      pikeVersion: this.cachedVersion,
      recentErrors: [...this.errorLog],
      startupMetrics: this.startupMetrics,
      versionFetchPending: this.versionFetchPromise !== null,
    };
  }

  /**
   * Unified analyze - consolidate multiple Pike operations in one request.
   *
   * Delegates to PikeBridge.analyze() which performs compilation and
   * tokenization once, then distributes results to all requested operations.
   * More efficient than calling parse(), introspect(), and analyzeUninitialized()
   * separately.
   *
   * LOG-14-01: Logs all analyze() calls with timing and cache hit information
   * to verify whether duplicate analyze calls occur during document changes.
   *
   * @param code - Pike source code to analyze.
   * @param include - Which operations to perform (at least one required).
   * @param filename - Optional filename for error messages.
   * @param documentVersion - Optional LSP document version for cache key.
   * @returns Analyze response with result/failures structure and performance timing.
   */
  async analyze(
    code: string,
    include: AnalysisOperation[],
    filename?: string,
    documentVersion?: number
  ): Promise<AnalyzeResponse> {
    if (!this.bridge)
      throw new Error(
        'Bridge not available: analyze() called before bridge was initialized. Ensure onInitialize has completed before calling analyze.'
      );

    // LOG-14-01: Track analyze call entry with full parameters
    const startTime = performance.now();
    const inflightBefore = (this.bridge as any).inflightRequests?.size ?? 0;
    this.logger.debug('[ANALYZE_START]', {
      uri: filename ?? 'unknown',
      version: documentVersion ?? 'none',
      include: include.join(','),
      codeLength: code.length,
      inflightPending: inflightBefore,
    });

    try {
      const result = await this.bridge.analyze(code, include, filename, documentVersion);

      // LOG-14-01: Track analyze call completion with timing
      const duration = performance.now() - startTime;
      const inflightAfter = (this.bridge as any).inflightRequests?.size ?? 0;
      const cacheHit = result._perf?.cache_hit ?? false;

      this.logger.debug('[ANALYZE_DONE]', {
        uri: filename ?? 'unknown',
        version: documentVersion ?? 'none',
        cacheHit,
        duration: `${duration.toFixed(2)}ms`,
        inflightPending: inflightAfter,
      });

      return result;
    } catch (err) {
      // LOG-14-01: Track analyze call failures
      const duration = performance.now() - startTime;
      this.logger.error('[ANALYZE_ERROR]', {
        uri: filename ?? 'unknown',
        version: documentVersion ?? 'none',
        duration: `${duration.toFixed(2)}ms`,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Parse Pike source code and extract symbols.
   */
  async parse(code: string, filename: string) {
    if (!this.bridge)
      throw new Error(
        'Bridge not available: Pike bridge is not initialized. This usually happens when the LSP server is still starting up or the bridge failed to start. Check the LSP logs for more details.'
      );
    return this.bridge.parse(code, filename);
  }

  /**
   * Find all identifier occurrences using Pike tokenization.
   */
  async findOccurrences(text: string) {
    if (!this.bridge)
      throw new Error(
        'Bridge not available: Pike bridge is not initialized. This usually happens when the LSP server is still starting up or the bridge failed to start. Check the LSP logs for more details.'
      );
    return this.bridge.findOccurrences(text);
  }

  /**
   * Find all rename positions for a symbol using Pike's Rename module.
   */
  async findRenamePositions(
    code: string,
    symbolName: string,
    line: number,
    character?: number,
    filename?: string
  ) {
    if (!this.bridge)
      throw new Error(
        'Bridge not available: Pike bridge is not initialized. This usually happens when the LSP server is still starting up or the bridge failed to start. Check the LSP logs for more details.'
      );
    return this.bridge.findRenamePositions(code, symbolName, line, character, filename);
  }

  /**
   * Prepare rename - get symbol range at position.
   */
  async prepareRename(code: string, line: number, character: number, filename?: string) {
    if (!this.bridge)
      throw new Error(
        'Bridge not available: Pike bridge is not initialized. This usually happens when the LSP server is still starting up or the bridge failed to start. Check the LSP logs for more details.'
      );
    return this.bridge.prepareRename(code, line, character, filename);
  }

  /**
   * PERF-003: Get completion context at a specific position.
   *
   * @param code - Source code to analyze
   * @param line - Line number (1-based)
   * @param character - Character position (0-based)
   * @param documentUri - Optional document URI for tokenization caching
   * @param documentVersion - Optional LSP document version for cache invalidation
   */
  async getCompletionContext(
    code: string,
    line: number,
    character: number,
    documentUri?: string,
    documentVersion?: number
  ) {
    if (!this.bridge)
      throw new Error(
        'Bridge not available: Pike bridge is not initialized. This usually happens when the LSP server is still starting up or the bridge failed to start. Check the LSP logs for more details.'
      );
    return this.bridge.getCompletionContext(code, line, character, documentUri, documentVersion);
  }

  /**
   * Resolve a module path to a file location.
   */
  async resolveModule(modulePath: string, fromFile: string) {
    if (!this.bridge)
      throw new Error(
        'Bridge not available: Pike bridge is not initialized. This usually happens when the LSP server is still starting up or the bridge failed to start. Check the LSP logs for more details.'
      );
    return this.bridge.resolveModule(modulePath, fromFile);
  }

  /**
   * Check if the Pike executable is available.
   */
  async checkPike(): Promise<boolean> {
    if (!this.bridge) return false;
    return this.bridge.checkPike();
  }

  async getProtocolInfo(): Promise<ProtocolInfo | null> {
    if (!this.bridge) return null;
    return this.bridge.getProtocolInfo();
  }

  async engineQuery(params: {
    feature: string;
    requestId: string;
    snapshot: QueryEngineSnapshotSelector;
    queryParams: Record<string, unknown>;
  }): Promise<QueryEngineQueryResponse> {
    if (!this.bridge) {
      throw new Error('Bridge not available: engineQuery() called before bridge was initialized.');
    }
    return this.bridge.engineQuery(params);
  }

  async engineOpenDocument(params: {
    uri: string;
    languageId: string;
    version: number;
    text: string;
  }): Promise<QueryEngineMutationAck> {
    if (!this.bridge) {
      throw new Error(
        'Bridge not available: engineOpenDocument() called before bridge was initialized.'
      );
    }
    return this.bridge.engineOpenDocument(params);
  }

  async engineChangeDocument(params: {
    uri: string;
    version: number;
    changes: Array<Record<string, unknown>>;
  }): Promise<QueryEngineMutationAck> {
    if (!this.bridge) {
      throw new Error(
        'Bridge not available: engineChangeDocument() called before bridge was initialized.'
      );
    }
    return this.bridge.engineChangeDocument(params);
  }

  async engineCloseDocument(params: { uri: string }): Promise<QueryEngineMutationAck> {
    if (!this.bridge) {
      throw new Error(
        'Bridge not available: engineCloseDocument() called before bridge was initialized.'
      );
    }
    return this.bridge.engineCloseDocument(params);
  }

  async engineUpdateConfig(params: {
    settings: Record<string, unknown>;
  }): Promise<QueryEngineMutationAck> {
    if (!this.bridge) {
      throw new Error(
        'Bridge not available: engineUpdateConfig() called before bridge was initialized.'
      );
    }
    return this.bridge.engineUpdateConfig(params);
  }

  async engineUpdateWorkspace(params: {
    roots: string[];
    added: string[];
    removed: string[];
  }): Promise<QueryEngineMutationAck> {
    if (!this.bridge) {
      throw new Error(
        'Bridge not available: engineUpdateWorkspace() called before bridge was initialized.'
      );
    }
    return this.bridge.engineUpdateWorkspace(params);
  }

  async engineCancelRequest(params: { requestId: string }): Promise<QueryEngineCancelAck> {
    if (!this.bridge) {
      throw new Error(
        'Bridge not available: engineCancelRequest() called before bridge was initialized.'
      );
    }
    return this.bridge.engineCancelRequest(params);
  }

  /**
   * Analyze uninitialized variable usage.
   */
  async analyzeUninitialized(text: string, filename: string) {
    if (!this.bridge)
      throw new Error(
        'Bridge not available: Pike bridge is not initialized. This usually happens when the LSP server is still starting up or the bridge failed to start. Check the LSP logs for more details.'
      );
    return this.bridge.analyzeUninitialized(text, filename);
  }

  /**
   * Detect whether a document is a Roxen module.
   *
   * Phase 3: Roxen module LSP support.
   * Calls Pike bridge to check for Roxen-specific patterns.
   *
   * @param code - Source code to analyze
   * @param filename - Filename for the document
   * @returns Roxen module information
   */
  async roxenDetect(
    code: string,
    filename?: string
  ): Promise<import('../features/roxen/types.js').RoxenModuleInfo> {
    if (!this.bridge)
      throw new Error(
        'Bridge not available: Pike bridge is not initialized. This usually happens when the LSP server is still starting up or the bridge failed to start. Check the LSP logs for more details.'
      );

    // Call the roxen_detect RPC handler
    return this.bridge.roxenDetect(code, filename);
  }

  /**
   * Validate Roxen module API compliance.
   *
   * Phase 5: Roxen-specific diagnostics.
   * Checks required callbacks, defvar usage, and tag signatures.
   *
   * Delegates to the bridge's roxenValidate method which calls the
   * roxen_validate RPC handler in Pike.
   *
   * @param code - Source code to validate
   * @param filename - Filename for error messages
   * @param moduleInfo - Optional Roxen module information from detection
   * @returns Validation diagnostics
   */
  async roxenValidate(code: string, filename: string, moduleInfo?: Record<string, unknown>) {
    if (!this.bridge)
      throw new Error(
        'Bridge not available: Pike bridge is not initialized. This usually happens when the LSP server is still starting up or the bridge failed to start. Check the LSP logs for more details.'
      );

    return this.bridge.roxenValidate(code, filename, moduleInfo);
  }

  /**
   * Register event handler on the underlying bridge.
   */
  on(event: string, handler: (...args: unknown[]) => void): void {
    this.bridge?.on(event, handler);
  }

  /**
   * Evaluate a constant Pike expression.
   */
  async evaluateConstant(expression: string, filename?: string) {
    if (!this.bridge)
      throw new Error(
        'Bridge not available: Pike bridge is not initialized. This usually happens when the LSP server is still starting up or the bridge failed to start. Check the LSP logs for more details.'
      );
    return this.bridge.evaluateConstant(expression, filename);
  }
}
