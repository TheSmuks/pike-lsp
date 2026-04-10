/**
 * Pike Bridge Core - Subprocess lifecycle and messaging
 *
 * Base class for PikeBridge containing process management, JSON-RPC messaging,
 * resolution cache persistence, and internal state management. Public API methods
 * are defined in bridge.ts.
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { PikeProcess } from './process.js';
import type { PikeRequest, PikeResponse } from './types.js';
import {
  BRIDGE_TIMEOUT_DEFAULT,
  PROCESS_STARTUP_DELAY,
  GRACEFUL_SHUTDOWN_DELAY,
} from './constants.js';
import { Logger } from '@pike-lsp/core';
import { PikeError } from '@pike-lsp/core';
import { RateLimiter } from './rate-limiter.js';
import type { PikeBridgeOptions, InternalBridgeOptions } from './bridge-options.js';
import { resolveDefineEntries, buildProcessArgs, buildDefineNameSet } from './bridge-options.js';
import { applyConditionalDefinesToCode as applyDefines } from './bridge-conditional-defines.js';
import { rejectPendingRequest, buildResponseResult } from './bridge-response.js';
import type { PendingRequest } from './bridge-response.js';
import {
  serializeResolutionCaches as serializeCaches,
  loadResolutionCaches as loadCaches,
  getResolutionCacheStats as getCacheStatsInner,
} from './bridge-resolution-cache.js';

interface PendingRequestLocal {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class PikeBridgeBase extends EventEmitter {
  protected process: PikeProcess | null = null;
  protected requestId = 0;
  protected pendingRequests = new Map<number, PendingRequestLocal>();
  protected requestCache = new Map<string, Promise<unknown>>();
  protected tokenCache = new Map<
    string,
    { version: number; splitTokens: string[]; timestamp: number }
  >();
  protected stdlibResolveCache = new Map<string, import('./types.js').StdlibResolveResult>();
  protected moduleResolveCache = new Map<string, string | null>();
  protected startupPromise: Promise<void> | null = null;

  protected readonly options: InternalBridgeOptions;

  protected started = false;
  protected startupInProgress = false;
  protected cancelStartup = false;
  protected readonly logger = new Logger('PikeBridge');
  protected debugLog: (message: string) => void;
  protected rateLimiter: RateLimiter | null;
  protected autoRestart = false;
  protected maxAutoRestarts = 1;
  protected autoRestartCount = 0;
  protected stopping = false;
  protected batchParseMetrics: Array<{
    totalMs: number;
    chunkingMs: number;
    ipcMs: number;
    chunkCount: number;
    fileCount: number;
  }> = [];

  constructor(options: PikeBridgeOptions = {}) {
    super();

    const debug = options.debug ?? false;
    this.debugLog = debug ? (message: string) => this.logger.debug(message) : () => {};

    let defaultAnalyzerPath: string;
    if (options.analyzerPath) {
      defaultAnalyzerPath = options.analyzerPath;
      this.debugLog(`Using provided analyzer path: ${defaultAnalyzerPath}`);
    } else {
      const modulePath = fileURLToPath(import.meta.url);
      const resolvedDirname = path.dirname(modulePath);
      this.debugLog(`Searching for pike-scripts from: ${resolvedDirname}`);

      defaultAnalyzerPath = path.resolve('pike-scripts', 'analyzer.pike');
      let searchPath = resolvedDirname;
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        const candidate = path.resolve(searchPath, 'pike-scripts', 'analyzer.pike');
        if (fs.existsSync(candidate)) {
          defaultAnalyzerPath = candidate;
          this.debugLog(`Found pike-scripts at: ${defaultAnalyzerPath}`);
          break;
        }
        const parent = path.resolve(searchPath, '..');
        if (parent === searchPath) break;
        searchPath = parent;
        attempts++;
      }
    }

    const defineEntries = resolveDefineEntries(options.defines, options.defineFiles, this.debugLog);
    const processArgs = buildProcessArgs(defineEntries);
    const defineNames = buildDefineNameSet(defineEntries);
    const defineEnv =
      defineEntries.length > 0 ? { PIKE_ANALYSIS_DEFINES: defineEntries.join('\n') } : {};

    this.options = {
      pikePath: options.pikePath ?? 'pike',
      analyzerPath: defaultAnalyzerPath,
      timeout: options.timeout ?? BRIDGE_TIMEOUT_DEFAULT,
      debug,
      env: { ...(options.env ?? {}), ...defineEnv },
      processArgs,
      defineNames,
    };

    if (options.rateLimit) {
      const maxRequests = options.rateLimit.maxRequests ?? 100;
      const windowSeconds = options.rateLimit.windowSeconds ?? 10;
      const refillRate = maxRequests / windowSeconds;
      this.rateLimiter = new RateLimiter(maxRequests, refillRate);
      this.debugLog(`Rate limiter enabled: ${maxRequests} requests per ${windowSeconds}s`);
    } else {
      this.rateLimiter = null;
    }

    this.debugLog(
      `Initialized with pikePath="${this.options.pikePath}", analyzerPath="${this.options.analyzerPath}", args=${JSON.stringify(this.options.processArgs)}`
    );
  }

  // --- Lifecycle ---

  async start(): Promise<void> {
    if (this.started && this.process?.isAlive()) {
      this.debugLog('Process already running, skipping start');
      return;
    }

    if (this.startupPromise) {
      this.debugLog('Startup already in progress, waiting for readiness');
      return this.startupPromise;
    }

    if (this.process && !this.process.isAlive()) {
      this.process = null;
    }
    this.startupInProgress = true;
    this.cancelStartup = false;

    this.debugLog(
      `Starting Pike subprocess: ${this.options.pikePath} ${this.options.processArgs.join(' ')} ${this.options.analyzerPath}`
    );
    this.emit('stderr', 'Env: ' + JSON.stringify(this.options.env));

    const pikeProc = new PikeProcess();

    const startupPromise = new Promise<void>((resolve, reject) => {
      let startupSettled = false;
      let startupTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanupStartupHandlers = (): void => {
        pikeProc.removeListener('error', onStartupError);
        pikeProc.removeListener('exit', onStartupExit);
      };

      const rejectStartup = (message: string): void => {
        if (startupSettled) return;
        startupSettled = true;
        this.startupInProgress = false;
        if (startupTimer) {
          clearTimeout(startupTimer);
          startupTimer = null;
        }
        this.started = false;
        this.process = null;
        cleanupStartupHandlers();
        reject(new Error(message));
      };

      const resolveStartup = (): void => {
        if (startupSettled) return;
        if (this.cancelStartup) {
          rejectStartup('Pike bridge stop requested during startup');
          return;
        }
        startupSettled = true;
        this.startupInProgress = false;
        startupTimer = null;
        this.started = true;
        cleanupStartupHandlers();
        this.debugLog('Pike subprocess started successfully');
        this.emit('started');
        resolve();
      };

      const onStartupError = (err: Error): void => {
        this.debugLog(`Process error event: ${err.message}`);
        rejectStartup(`Failed to start Pike subprocess: ${err.message}`);
      };

      const onStartupExit = (code: number | null): void => {
        if (startupSettled) return;
        this.debugLog(`Process exited during startup with code: ${code}`);
        rejectStartup(`Pike subprocess exited during startup with code ${code}`);
      };

      pikeProc.on('error', onStartupError);
      pikeProc.on('exit', onStartupExit);

      pikeProc.on('stderr', data => {
        const message = data.trim();
        if (message) {
          const suppressedPatterns = [/^Illegal comment/, /^Missing ['"]>?['"]\)/];
          const isSuppressed = suppressedPatterns.some(p => p.test(message));
          if (!isSuppressed) {
            this.logger.debug('Pike stderr', { raw: message });
            this.emit('stderr', message);
          } else {
            this.logger.trace('Pike stderr (suppressed)', { raw: message });
          }
        }
      });

      pikeProc.on('message', line => {
        this.debugLog(`Received line: ${line.substring(0, 100)}...`);
        this.handleResponse(line);
      });

      pikeProc.on('exit', code => {
        if (!this.started) {
          this.debugLog(`Process exited before startup completed with code: ${code}`);
          return;
        }
        this.debugLog(`Process closed with code: ${code}`);
        this.started = false;
        this.process = null;
        this.emit('close', code);
        this.rejectAllPendingRequests(`Pike process exited with code ${code}`);

        if (this.autoRestart && !this.stopping && this.autoRestartCount < this.maxAutoRestarts) {
          this.autoRestartCount++;
          this.debugLog(
            `Auto-restarting after unexpected exit (attempt ${this.autoRestartCount}/${this.maxAutoRestarts})`
          );
          this.start().catch(err => {
            this.debugLog(
              `Auto-restart failed: ${err instanceof Error ? err.message : String(err)}`
            );
          });
        }
      });

      try {
        pikeProc.spawn(
          this.options.analyzerPath,
          this.options.pikePath,
          this.options.env,
          this.options.processArgs
        );
        this.debugLog(`Pike subprocess spawned with PID: ${pikeProc.pid}`);
        this.process = pikeProc;

        startupTimer = setTimeout(() => {
          if (!this.process || !this.process.isAlive()) {
            rejectStartup('Pike subprocess is not alive after startup delay');
            return;
          }
          resolveStartup();
        }, PROCESS_STARTUP_DELAY);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.debugLog(`Exception during start: ${message}`);
        rejectStartup(`Failed to start Pike bridge: ${message}`);
      }
    });

    this.startupPromise = startupPromise.finally(() => {
      this.startupPromise = null;
    });

    return this.startupPromise;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.startupInProgress) {
      this.cancelStartup = true;
    }

    if (this.process) {
      this.debugLog('Stopping Pike subprocess...');
      const proc = this.process;
      const waitForShutdown = async (): Promise<void> => {
        await new Promise(resolve => setTimeout(resolve, GRACEFUL_SHUTDOWN_DELAY));
      };

      this.rejectAllPendingRequests('Pike bridge stopped while requests were in flight');
      proc.kill();
      await waitForShutdown();

      if (proc.isAlive()) {
        this.debugLog('Graceful shutdown timed out, forcing SIGKILL');
        proc.forceKill();
        await waitForShutdown();
      }

      this.debugLog('Pike subprocess stopped');
      this.process = null;
      this.started = false;
    }
    this.rejectAllPendingRequests('Pike bridge stopped while requests were in flight');
    this.requestCache.clear();
    this.clearResolutionCaches();
    this.stopping = false;
    this.autoRestartCount = 0;
    this.emit('stopped');
  }

  // --- Internal helpers ---

  protected rejectAllPendingRequests(message: string): void {
    if (this.pendingRequests.size === 0) return;
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new PikeError(message));
    }
    this.pendingRequests.clear();
  }

  protected clearResolutionCaches(): void {
    this.stdlibResolveCache.clear();
    this.moduleResolveCache.clear();
  }

  applyConditionalDefinesToCode(code: string): string {
    return applyDefines(this.options.defineNames, code);
  }

  // --- Resolution cache persistence ---

  serializeResolutionCaches(): string {
    return serializeCaches(this.stdlibResolveCache, this.moduleResolveCache);
  }

  loadResolutionCaches(serialized: string): number {
    return loadCaches(serialized, this.stdlibResolveCache, this.moduleResolveCache);
  }

  getResolutionCacheStats(): { stdlib: number; modules: number } {
    return getCacheStatsInner(this.stdlibResolveCache, this.moduleResolveCache);
  }

  // --- State queries ---

  isRunning(): boolean {
    return this.started && this.process !== null && this.process.isAlive();
  }

  setAutoRestart(enabled: boolean, maxRestarts = 1): void {
    this.autoRestart = enabled;
    this.maxAutoRestarts = maxRestarts;
    this.autoRestartCount = 0;
  }

  // --- JSON-RPC messaging ---

  getRequestKey(method: string, params: Record<string, unknown>): string | null {
    switch (method) {
      case 'analyze':
      case 'parse':
      case 'compile':
      case 'tokenize':
      case 'get_completion_context':
      case 'get_completion_context_cached':
      case 'extract_imports':
      case 'check_circular':
        return null;
      default:
        return `${method}:${JSON.stringify(params)}`;
    }
  }

  async sendRequest<T>(
    method: string,
    params: Record<string, unknown>,
    validate?: (raw: unknown, method: string) => T
  ): Promise<T> {
    if (this.rateLimiter && !this.rateLimiter.tryAcquire()) {
      throw new PikeError('Rate limit exceeded');
    }

    const requestKey = this.getRequestKey(method, params);
    if (requestKey) {
      const existing = this.requestCache.get(requestKey);
      if (existing) return existing as Promise<T>;
    }

    if (!this.process || !this.process.isAlive() || !this.started) {
      await this.start();
    }

    const promise = new Promise<T>((resolve, reject) => {
      const id = ++this.requestId;
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new PikeError(`Request ${id} timed out after ${this.options.timeout}ms`));
      }, this.options.timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      const request: PikeRequest = { id, method: method as PikeRequest['method'], params };
      const json = JSON.stringify(request);
      const process = this.process;

      if (!process) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(new PikeError('Pike process is not running'));
        return;
      }

      try {
        process.send(json);
      } catch (err) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        const message = err instanceof Error ? err.message : String(err);
        reject(new PikeError(`Failed to send request ${id}: ${message}`));
      }
    });

    if (requestKey) {
      this.requestCache.set(requestKey, promise);
    }
    if (requestKey) {
      promise.then(
        () => {
          this.requestCache.delete(requestKey);
        },
        () => {
          this.requestCache.delete(requestKey);
        }
      );
    }

    if (validate) {
      return promise.then(result => validate(result as unknown, method));
    }
    return promise;
  }

  buildResponseResult(response: PikeResponse): unknown {
    return buildResponseResult(response);
  }

  handleResponse(line: string): void {
    let response: PikeResponse;
    try {
      response = JSON.parse(line);
    } catch {
      this.emit('stderr', line);
      return;
    }

    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id);

    try {
      if (response.error) {
        rejectPendingRequest(pending as unknown as PendingRequest, response.error.message);
        return;
      }
      const result = this.buildResponseResult(response);
      pending.resolve(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Failed to process Pike response', {
        responseId: response.id,
        raw: line,
        error: message,
      });
      rejectPendingRequest(
        pending as unknown as PendingRequest,
        `Failed to process Pike response: ${message}`
      );
    }
  }
}
