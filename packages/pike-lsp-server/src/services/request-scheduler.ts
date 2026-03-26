import { Logger } from '@pike-lsp/core';

export type RequestClass = 'typing' | 'interactive' | 'background';

interface RequestSchedulerLogger {
  error: (message: string, meta?: Record<string, unknown>) => void;
}

export interface RequestSchedulerMetrics {
  scheduled: number;
  started: number;
  completed: number;
  failed: number;
  canceled: number;
  maxConcurrent: number;
  activeWorkers: number;
  queueDepth: {
    typing: number;
    interactive: number;
    background: number;
  };
  inFlightByClass: {
    typing: number;
    interactive: number;
    background: number;
  };
  queueWaitMs: {
    typing: number[];
    interactive: number[];
    background: number[];
  };
}

type RequestSchedulerCounters = Pick<
  RequestSchedulerMetrics,
  'scheduled' | 'started' | 'completed' | 'failed' | 'canceled' | 'queueWaitMs'
>;

export class RequestSupersededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestSupersededError';
  }
}

type Checkpoint = () => void;

interface ScheduleRequest<T> {
  requestClass: RequestClass;
  key?: string;
  coalesceMs?: number;
  run: (checkpoint: Checkpoint) => Promise<T>;
}

interface QueuedTask {
  id: number;
  requestClass: RequestClass;
  key?: string;
  createdAt: number;
  started: boolean;
  cancelled: boolean;
  run: (checkpoint: Checkpoint) => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

interface CoalescedPending {
  timeout: ReturnType<typeof setTimeout>;
  reject: (reason?: unknown) => void;
}

interface PendingTaskHandle {
  started: () => boolean;
  cancel: (reason: Error) => void;
}

interface RequestSchedulerOptions {
  maxConcurrent?: number;
  logger?: RequestSchedulerLogger;
}

export class RequestScheduler {
  private static readonly QUEUE_WAIT_SAMPLE_CAP = 256;
  private nextId = 1;
  private dispatching = false;
  private activeWorkers = 0;
  private readonly maxConcurrent: number;
  private readonly logger: RequestSchedulerLogger;
  private readonly activeByClass: Record<RequestClass, number> = {
    typing: 0,
    interactive: 0,
    background: 0,
  };
  private readonly BACKGROUND_START_GRACE_MS = 8;
  private readonly queues: Record<RequestClass, QueuedTask[]> = {
    typing: [],
    interactive: [],
    background: [],
  };
  private readonly tasksByKey = new Map<string, PendingTaskHandle>();
  private readonly coalescedByKey = new Map<string, CoalescedPending>();
  private readonly metrics: RequestSchedulerCounters = {
    scheduled: 0,
    started: 0,
    completed: 0,
    failed: 0,
    canceled: 0,
    queueWaitMs: {
      typing: [],
      interactive: [],
      background: [],
    },
  };

  constructor(options: RequestSchedulerOptions = {}) {
    const configuredMax = Math.floor(options.maxConcurrent ?? 2);
    this.maxConcurrent = configuredMax > 0 ? configuredMax : 1;
    this.logger = options.logger ?? new Logger('request-scheduler');
  }

  async schedule<T>(request: ScheduleRequest<T>): Promise<T> {
    const key = request.key;
    if (key) {
      this.cancelPendingByKey(key, new RequestSupersededError(`Superseded request key=${key}`));
    }

    return new Promise<T>((resolve, reject) => {
      const enqueueTask = (): void => {
        const task: QueuedTask = {
          id: this.nextId++,
          requestClass: request.requestClass,
          createdAt: Date.now(),
          started: false,
          cancelled: false,
          run: request.run,
          resolve: value => resolve(value as T),
          reject,
          ...(key ? { key } : {}),
        };

        this.metrics.scheduled += 1;
        this.queues[request.requestClass].push(task);
        if (key) {
          this.tasksByKey.set(key, {
            started: () => task.started,
            cancel: (reason: Error) => {
              task.cancelled = true;
              if (!task.started) {
                task.reject(reason);
              }
            },
          });
        }
        this.processQueue().catch(error => {
          this.logSchedulerError('schedule:processQueue', error);
        });
      };

      const coalesceMs = request.coalesceMs ?? 0;
      if (key && coalesceMs > 0) {
        const existing = this.coalescedByKey.get(key);
        if (existing) {
          clearTimeout(existing.timeout);
          existing.reject(new RequestSupersededError(`Coalesced request key=${key}`));
          this.metrics.canceled += 1;
        }

        const timeout = setTimeout(() => {
          this.coalescedByKey.delete(key);
          enqueueTask();
        }, coalesceMs);
        this.coalescedByKey.set(key, { timeout, reject });
        return;
      }

      enqueueTask();
    });
  }

  snapshotMetrics(): RequestSchedulerMetrics {
    return {
      scheduled: this.metrics.scheduled,
      started: this.metrics.started,
      completed: this.metrics.completed,
      failed: this.metrics.failed,
      canceled: this.metrics.canceled,
      maxConcurrent: this.maxConcurrent,
      activeWorkers: this.activeWorkers,
      queueDepth: {
        typing: this.queues.typing.length,
        interactive: this.queues.interactive.length,
        background: this.queues.background.length,
      },
      inFlightByClass: {
        typing: this.activeByClass.typing,
        interactive: this.activeByClass.interactive,
        background: this.activeByClass.background,
      },
      queueWaitMs: {
        typing: [...this.metrics.queueWaitMs.typing],
        interactive: [...this.metrics.queueWaitMs.interactive],
        background: [...this.metrics.queueWaitMs.background],
      },
    };
  }

  private cancelPendingByKey(key: string, reason: Error): void {
    const coalesced = this.coalescedByKey.get(key);
    if (coalesced) {
      clearTimeout(coalesced.timeout);
      this.coalescedByKey.delete(key);
      coalesced.reject(reason);
      this.metrics.canceled += 1;
    }

    const existingTask = this.tasksByKey.get(key);
    if (!existingTask) {
      return;
    }

    this.tasksByKey.delete(key);
    this.metrics.canceled += 1;
    existingTask.cancel(reason);
  }

  private async processQueue(): Promise<void> {
    if (this.dispatching) {
      return;
    }

    this.dispatching = true;
    try {
      while (this.activeWorkers < this.maxConcurrent) {
        const next = this.dequeueNextTask();

        if (!next) {
          break;
        }

        if (
          next.requestClass === 'background' &&
          this.queues.typing.length === 0 &&
          this.queues.interactive.length === 0
        ) {
          await new Promise(resolve => setTimeout(resolve, this.BACKGROUND_START_GRACE_MS));
          if (this.queues.typing.length > 0 || this.queues.interactive.length > 0) {
            this.queues.background.unshift(next);
            continue;
          }
        }

        this.activeWorkers += 1;
        this.activeByClass[next.requestClass] += 1;
        this.runTask(next)
          .catch(error => {
            this.logSchedulerError('runTask', error, { requestClass: next.requestClass, id: next.id });
          })
          .finally(() => {
            this.activeWorkers -= 1;
            this.activeByClass[next.requestClass] = Math.max(
              0,
              this.activeByClass[next.requestClass] - 1
            );
            this.processQueue().catch(error => {
              this.logSchedulerError('finally:processQueue', error);
            });
          });
      }
    } finally {
      this.dispatching = false;
    }

    if (this.activeWorkers < this.maxConcurrent && this.hasQueuedTasks()) {
      this.processQueue().catch(error => {
        this.logSchedulerError('tail:processQueue', error);
      });
    }
  }

  private logSchedulerError(
    location: string,
    error: unknown,
    extra: Record<string, unknown> = {}
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.error('Request scheduler internal async error', {
      location,
      error: errorMessage,
      ...extra,
    });
  }

  private dequeueNextTask(): QueuedTask | undefined {
    return this.queues.typing.shift() ?? this.queues.interactive.shift() ?? this.queues.background.shift();
  }

  private hasQueuedTasks(): boolean {
    return (
      this.queues.typing.length > 0 ||
      this.queues.interactive.length > 0 ||
      this.queues.background.length > 0
    );
  }

  private async runTask(task: QueuedTask): Promise<void> {
    if (task.cancelled) {
      return;
    }

    task.started = true;
    this.metrics.started += 1;
    this.recordQueueWait(task.requestClass, Date.now() - task.createdAt);

    const checkpoint: Checkpoint = () => {
      if (task.cancelled) {
        throw new RequestSupersededError(
          `Cancelled during execution key=${task.key ?? 'unkeyed'} id=${task.id}`
        );
      }
    };

    try {
      const result = await task.run(checkpoint);
      checkpoint();
      this.metrics.completed += 1;
      if (task.key) {
        this.tasksByKey.delete(task.key);
      }
      task.resolve(result);
    } catch (error) {
      if (task.key) {
        this.tasksByKey.delete(task.key);
      }

      if (error instanceof RequestSupersededError) {
        this.metrics.canceled += 1;
      } else {
        this.metrics.failed += 1;
      }
      task.reject(error);
    }
  }

  private recordQueueWait(requestClass: RequestClass, waitMs: number): void {
    const samples = this.metrics.queueWaitMs[requestClass];
    samples.push(waitMs);
    const overflow = samples.length - RequestScheduler.QUEUE_WAIT_SAMPLE_CAP;
    if (overflow > 0) {
      samples.splice(0, overflow);
    }
  }
}
