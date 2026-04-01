/**
 * BridgePool — shared test utility for concurrent multi-bridge dispatch.
 *
 * Manages N PikeBridge instances for true parallelism. Since each Pike
 * subprocess is sequential (synchronous read-process-write loop), sending
 * concurrent analyze() calls to a single bridge yields zero speedup. This
 * pool distributes work across multiple bridges for real concurrency.
 *
 * #1075: Pool includes crash recovery — when a bridge dies mid-dispatch,
 * it's replaced with a new one and processing continues.
 *
 * Usage:
 * ```ts
 * const pool = new BridgePool({ timeout: 30000 }, { concurrency: 4 });
 * await pool.start();
 * await pool.dispatch(files, async (file, bridge) => {
 *   const result = await bridge.analyze(code, ['parse'], file);
 * });
 * await pool.stop();
 * ```
 */

import { PikeBridge } from '../bridge.js';
import type { PikeBridgeOptions } from '../bridge.js';

/** Handler function invoked for each work item with an assigned bridge. */
export type WorkHandler<T> = (item: T, bridge: PikeBridge, index: number) => Promise<void>;

/** Progress callback invoked after each work item completes. */
export type ProgressCallback = (completed: number, total: number) => void;

/** Options for creating a BridgePool. */
export interface BridgePoolOptions {
  /** Number of PikeBridge instances to manage. Default: 4. */
  concurrency?: number;
  /** Optional progress callback invoked after each item completes. */
  onProgress?: ProgressCallback;
}

/**
 * BridgePool manages multiple PikeBridge instances for concurrent dispatch.
 *
 * Each bridge backs an independent Pike subprocess, so work items can truly
 * run in parallel. The pool uses a semaphore pattern to limit concurrency to
 * the number of bridges and distributes items round-robin.
 */
export class BridgePool {
  private readonly bridgeOptions: PikeBridgeOptions;
  private readonly concurrency: number;
  private readonly onProgress: ProgressCallback | undefined;
  private bridges: PikeBridge[] = [];
  private deadBridges = new Set<number>();

  constructor(bridgeOptions: PikeBridgeOptions = {}, poolOptions: BridgePoolOptions = {}) {
    this.bridgeOptions = bridgeOptions;
    this.concurrency = poolOptions.concurrency ?? 4;
    this.onProgress = poolOptions.onProgress;
  }

  /** Number of bridges in the pool. */
  get size(): number {
    return this.concurrency;
  }

  /** Whether all bridges have been started and are running. */
  get isRunning(): boolean {
    return this.bridges.length === this.concurrency && this.bridges.every(b => b.isRunning());
  }

  /**
   * Start all bridge subprocesses.
   *
   * Creates and starts `concurrency` PikeBridge instances in parallel.
   * Suppresses stderr noise on each bridge (matching corpus test pattern).
   *
   * @throws Error if any bridge fails to start (cleans up all bridges first).
   */
  async start(): Promise<void> {
    this.bridges = Array.from({ length: this.concurrency }, () => {
      const bridge = new PikeBridge(this.bridgeOptions);
      bridge.on('stderr', () => {});
      // #1075: Enable auto-restart so dead bridges can recover
      bridge.setAutoRestart(true, 1);
      return bridge;
    });

    try {
      await Promise.all(this.bridges.map(b => b.start()));
    } catch (err) {
      await this.stop();
      throw err;
    }
  }

  /**
   * Stop all bridges gracefully.
   *
   * Attempts to stop every bridge even if some fail, collecting the first
   * error to re-throw after cleanup.
   */
  async stop(): Promise<void> {
    if (this.bridges.length === 0) return;

    const results = await Promise.allSettled(this.bridges.map(b => b.stop()));
    this.bridges = [];
    this.deadBridges.clear();

    const firstError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (firstError) {
      throw firstError.reason instanceof Error
        ? firstError.reason
        : new Error(String(firstError.reason));
    }
  }

  // #1075: Replace a dead bridge with a fresh one
  private async replaceBridge(workerId: number): Promise<PikeBridge> {
    const oldBridge = this.bridges[workerId];
    if (oldBridge) {
      try {
        await oldBridge.stop();
      } catch {
        // Ignore stop errors on dead bridge
      }
    }

    const newBridge = new PikeBridge(this.bridgeOptions);
    newBridge.on('stderr', () => {});
    newBridge.setAutoRestart(true, 1);
    await newBridge.start();
    this.bridges[workerId] = newBridge;
    this.deadBridges.delete(workerId);
    return newBridge;
  }

  /**
   * Distribute work items across bridges using a concurrency-limited pool.
   *
   * Items are assigned round-robin to bridges. At most `concurrency` items
   * run concurrently (one per bridge). Errors propagate immediately — the
   * first failing item rejects the returned promise.
   *
   * #1075: When a bridge dies mid-dispatch, it's replaced and processing continues.
   *
   * @param workItems - Array of items to process.
   * @param handler   - Async function called for each item with its assigned bridge.
   * @throws Error from the first failing handler.
   */
  async dispatch<T>(workItems: T[], handler: WorkHandler<T>): Promise<void> {
    if (workItems.length === 0) return;
    if (this.bridges.length === 0) {
      throw new Error('BridgePool not started — call start() first');
    }

    let completed = 0;
    const total = workItems.length;
    let nextIndex = 0;

    const worker = async (workerId: number): Promise<void> => {
      let bridge = this.bridges[workerId]!;

      while (true) {
        const itemIndex = nextIndex;
        if (itemIndex >= total) return;
        nextIndex++;

        // #1075: Check bridge health before each work item
        if (!bridge.isRunning()) {
          bridge = await this.replaceBridge(workerId);
        }

        try {
          await handler(workItems[itemIndex]!, bridge, itemIndex);
          completed++;
        } catch (err) {
          // #1075: If bridge died during the operation, mark it and continue
          if (!bridge.isRunning()) {
            this.deadBridges.add(workerId);
            // Don't increment completed — this item failed
            // Continue to next item with replacement bridge
            bridge = await this.replaceBridge(workerId);
            continue;
          }
          throw err;
        }

        if (this.onProgress) {
          this.onProgress(completed, total);
        }
      }
    };

    const workerCount = Math.min(this.concurrency, total);
    await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i)));
  }
}
