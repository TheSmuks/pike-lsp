/**
 * Workspace Diagnostics Manager
 *
 * #1113: Runs diagnostics on unopened workspace files during idle time.
 * Adapts vscode-go/gopls pattern of workspace-wide analysis.
 */

import { Logger } from '@pike-lsp/core';
import type { CoreDiagnostic } from '../core/types.js';
import type { RequestScheduler } from './request-scheduler.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import type { BridgeManager } from './bridge-manager.js';
import { uriToFsPath } from '../utils/uri-path.js';
import { computeContentHash } from './document-cache.js';
import { convertSeverity } from '../features/diagnostics/utils.js';

const log = new Logger('WorkspaceDiagnostics');

interface WorkspaceDiagnosticsOptions {
  scheduler: RequestScheduler;
  workspaceIndex: WorkspaceIndex;
  bridgeManager: BridgeManager | null;
  idleDelayMs?: number;
  batchSize?: number;
  sendDiagnostics: (params: { uri: string; diagnostics: CoreDiagnostic[] }) => void;
  clearDiagnostics: (uri: string) => void;
}

interface PendingDiagnostic {
  uri: string;
  scheduledAt: number;
}

/**
 * Manages background diagnostics for workspace files during idle time.
 *
 * Monitors for idle periods (no typing/interactive requests) and schedules
 * low-priority background validation of workspace files that aren't currently
 * open. Yields to user activity by cancelling background work when typing starts.
 */
export class WorkspaceDiagnosticsManager {
  private scheduler: RequestScheduler;
  private workspaceIndex: WorkspaceIndex;
  private bridgeManager: BridgeManager | null;
  private idleDelayMs: number;
  private batchSize: number;
  private sendDiagnostics: (params: { uri: string; diagnostics: CoreDiagnostic[] }) => void;
  private clearDiagnostics: (uri: string) => void;

  private static readonly MAX_FAILURES = 3;
  private failedUriAttempts = new Map<string, number>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private pendingQueue: PendingDiagnostic[] = [];
  private processedUris = new Set<string>();
  private backgroundDiagnosticUris = new Set<string>();
  private remainingUris: string[] = [];
  private lastActivityTime = Date.now();

  constructor(options: WorkspaceDiagnosticsOptions) {
    this.scheduler = options.scheduler;
    this.workspaceIndex = options.workspaceIndex;
    this.bridgeManager = options.bridgeManager;
    this.idleDelayMs = options.idleDelayMs ?? 5000;
    this.batchSize = options.batchSize ?? 5;
    this.sendDiagnostics = options.sendDiagnostics;
    this.clearDiagnostics = options.clearDiagnostics;
  }

  /**
   * Notify that user activity occurred (typing, navigation, etc).
   * Resets idle timer, cancels pending background work, and clears
   * previously published background diagnostics.
   */
  onUserActivity(): void {
    this.lastActivityTime = Date.now();

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.isRunning) {
      log.debug('User activity detected, pausing workspace diagnostics');
      this.pause();
    }

    // Clear previously published background diagnostics
    for (const uri of this.backgroundDiagnosticUris) {
      this.clearDiagnostics(uri);
    }
    this.backgroundDiagnosticUris.clear();

    // Schedule new idle check
    this.scheduleIdleCheck();
  }

  /**
   * Notify that workspace indexing completed.
   * Triggers initial workspace diagnostics after idle period.
   */
  onIndexingComplete(): void {
    log.debug('Workspace indexing complete, scheduling idle diagnostics');
    this.processedUris.clear();
    this.failedUriAttempts.clear();
    const allUris = this.workspaceIndex.getAllDocumentUris();
    this.remainingUris = [...allUris];
    this.scheduleIdleCheck();
  }

  /**
   * Dispose and cleanup resources.
   */
  dispose(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.isRunning = false;
    this.pendingQueue = [];
  }

  /**
   * Get queue statistics for monitoring.
   */
  getStats(): {
    queueDepth: number;
    processedCount: number;
    isRunning: boolean;
  } {
    return {
      queueDepth: this.pendingQueue.length,
      processedCount: this.processedUris.size,
      isRunning: this.isRunning,
    };
  }

  private scheduleIdleCheck(): void {
    if (this.idleTimer) {
      return; // Already scheduled
    }

    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.startIdleProcessing();
    }, this.idleDelayMs);
  }

  private async startIdleProcessing(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    // Check if there's been recent activity
    const timeSinceActivity = Date.now() - this.lastActivityTime;
    if (timeSinceActivity < this.idleDelayMs) {
      this.scheduleIdleCheck();
      return;
    }

    if (this.remainingUris.length === 0) {
      log.debug('All workspace files processed');
      return;
    }

    log.debug('Starting workspace idle diagnostics', {
      remaining: this.remainingUris.length,
    });

    this.isRunning = true;
    this.pendingQueue = this.remainingUris.map(uri => ({
      uri,
      scheduledAt: Date.now(),
    }));
    this.remainingUris = [];

    await this.processQueue();
  }

  private async processQueue(): Promise<void> {
    while (this.isRunning && this.pendingQueue.length > 0) {
      // Check for user activity
      const timeSinceActivity = Date.now() - this.lastActivityTime;
      if (timeSinceActivity < this.idleDelayMs) {
        log.debug('User activity detected during processing, yielding');
        this.pause();
        this.scheduleIdleCheck();
        return;
      }

      // Take next batch
      const batch = this.pendingQueue.splice(0, this.batchSize);

      const successfulUris = await this.processBatch(batch);

      for (const item of batch) {
        if (successfulUris.has(item.uri)) {
          this.processedUris.add(item.uri);
          this.failedUriAttempts.delete(item.uri);
        } else {
          const attempts = (this.failedUriAttempts.get(item.uri) ?? 0) + 1;
          this.failedUriAttempts.set(item.uri, attempts);
          if (attempts >= WorkspaceDiagnosticsManager.MAX_FAILURES) {
            log.warn('URI permanently skipped after repeated failures', {
              uri: item.uri,
              attempts,
            });
          } else {
            this.remainingUris.push(item.uri);
          }
        }
      }
    }

    if (this.pendingQueue.length === 0) {
      this.isRunning = false;
      if (this.remainingUris.length > 0) {
        log.debug('Queue empty but URIs remain, scheduling next idle check');
        this.scheduleIdleCheck();
      } else {
        log.debug('Workspace diagnostics queue empty');
      }
    }
  }

  private async processBatch(batch: PendingDiagnostic[]): Promise<Set<string>> {
    const processed = new Set<string>();
    const bridge = this.bridgeManager?.bridge;
    if (!bridge?.isRunning()) {
      log.debug('Bridge not available, skipping batch');
      return processed;
    }

    try {
      // Use batch analysis for efficiency
      const uriList = batch.map(item => item.uri);
      const batchKey = `workspace-diagnostics:${computeContentHash(uriList.join('\0'))}`;

      await this.scheduler.schedule({
        requestClass: 'background',
        key: batchKey,
        run: async () => {
          const fs = await import('node:fs/promises');

          // Concurrency-limited file reads to avoid I/O stampede
          const MAX_CONCURRENT = 10;
          let active = 0;
          const queue: Array<() => void> = [];
          const acquire = () => {
            if (active < MAX_CONCURRENT) {
              active++;
              return Promise.resolve();
            }
            return new Promise<void>(r => {
              queue.push(r);
            });
          };
          const release = () => {
            const next = queue.shift();
            if (next) {
              next();
            } else {
              active--;
            }
          };

          await Promise.all(
            batch.map(async item => {
              await acquire();
              try {
                const fsPath = uriToFsPath(item.uri);
                const text = await fs.readFile(fsPath, 'utf-8');

                // Analyze immediately while file content is in scope,
                // bounding peak memory to MAX_CONCURRENT * max_file_size.
                try {
                  const analysis = await bridge.analyze(text, ['parse', 'diagnostics'], item.uri);
                  processed.add(item.uri);

                  const rawDiagnostics = analysis.result?.diagnostics?.diagnostics ?? [];

                  if (rawDiagnostics.length > 0) {
                    const diagnostics: CoreDiagnostic[] = rawDiagnostics.map(d => ({
                      range: {
                        start: { line: d.position.line, character: d.position.character },
                        end: { line: d.position.line, character: d.position.character },
                      },
                      message: d.message,
                      severity: d.severity ? convertSeverity(d.severity) : 2,
                      source: 'pike-background',
                    }));
                    this.sendDiagnostics({ uri: item.uri, diagnostics });
                    this.backgroundDiagnosticUris.add(item.uri);
                    log.debug('Published background diagnostics', {
                      uri: item.uri,
                      count: diagnostics.length,
                    });
                  }
                } catch (err) {
                  log.debug('Background analysis failed', {
                    uri: item.uri,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              } catch (err) {
                const code =
                  err instanceof Error && 'code' in err
                    ? (err as Error & { code: string }).code
                    : undefined;
                if (code === 'ENOENT') {
                  processed.add(item.uri);
                } else if (code === 'EACCES') {
                  log.warn('Permission denied, permanently skipping', { uri: item.uri });
                  this.failedUriAttempts.set(item.uri, WorkspaceDiagnosticsManager.MAX_FAILURES);
                } else {
                  log.debug('Background diagnostic failed', {
                    uri: item.uri,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              } finally {
                release();
              }
            })
          );
        },
      });
    } catch (err) {
      log.debug('Batch scheduling failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return processed;
  }

  private pause(): void {
    this.isRunning = false;
    // Re-queue unprocessed items back into remainingUris
    const unprocessed = this.pendingQueue.filter(item => !this.processedUris.has(item.uri));
    this.remainingUris = unprocessed.map(item => item.uri).concat(this.remainingUris);
    this.pendingQueue = [];
  }
}
