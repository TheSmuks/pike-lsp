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
    const allUris = this.workspaceIndex.getAllDocumentUris();
    this.remainingUris = allUris.filter(uri => !this.processedUris.has(uri));
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

      // Only mark successfully processed URIs; push the rest back for retry
      for (const item of batch) {
        if (successfulUris.has(item.uri)) {
          this.processedUris.add(item.uri);
        } else {
          this.remainingUris.push(item.uri);
        }
      }
    }

    if (this.pendingQueue.length === 0) {
      log.debug('Workspace diagnostics queue empty');
      this.isRunning = false;
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

      await this.scheduler.schedule({
        requestClass: 'background',
        key: `workspace-diagnostics:${uriList.join(',')}`,
        run: async () => {
          const fs = await import('node:fs/promises');

          const results = await Promise.allSettled(
            batch.map(async item => {
              const fsPath = uriToFsPath(item.uri);
              const text = await fs.readFile(fsPath, 'utf-8');
              return bridge.analyze(text, ['parse', 'diagnostics'], item.uri);
            })
          );

          for (const [idx, result] of results.entries()) {
            const uri = batch[idx]?.uri;
            if (!uri) continue;

            if (result.status === 'rejected') {
              log.debug('Background diagnostic failed', {
                uri,
                error:
                  result.reason instanceof Error ? result.reason.message : String(result.reason),
              });
              continue;
            }

            processed.add(uri);

            const rawDiagnostics = result.value.result?.diagnostics?.diagnostics ?? [];

            if (rawDiagnostics.length > 0) {
              // Map bridge diagnostics → CoreDiagnostic, preserving severity.
              // Bridge returns position (point), CoreDiagnostic requires range (span).
              const diagnostics: CoreDiagnostic[] = rawDiagnostics.map(d => ({
                range: {
                  start: { line: d.position.line, character: d.position.character },
                  end: { line: d.position.line, character: d.position.character },
                },
                message: d.message,
                severity: d.severity ? convertSeverity(d.severity) : 2,
                source: 'pike-background',
              }));
              this.sendDiagnostics({ uri, diagnostics });
              this.backgroundDiagnosticUris.add(uri);
              log.debug('Published background diagnostics', {
                uri,
                count: diagnostics.length,
              });
            }
          }
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
