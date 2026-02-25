export type RequestClass = 'typing' | 'interactive' | 'background';

export interface RequestSchedulerMetrics {
  scheduled: number;
  started: number;
  completed: number;
  failed: number;
  canceled: number;
  queueWaitMs: {
    typing: number[];
    interactive: number[];
    background: number[];
  };
}

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

export class RequestScheduler {
  private nextId = 1;
  private running = false;
  private readonly BACKGROUND_START_GRACE_MS = 8;
  private readonly queues: Record<RequestClass, QueuedTask[]> = {
    typing: [],
    interactive: [],
    background: [],
  };
  private readonly tasksByKey = new Map<string, PendingTaskHandle>();
  private readonly coalescedByKey = new Map<string, CoalescedPending>();
  private readonly metrics: RequestSchedulerMetrics = {
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
        this.processQueue().catch(() => {});
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
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      while (true) {
        const next =
          this.queues.typing.shift() ??
          this.queues.interactive.shift() ??
          this.queues.background.shift();

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

        await this.runTask(next);
      }
    } finally {
      this.running = false;
    }
  }

  private async runTask(task: QueuedTask): Promise<void> {
    if (task.cancelled) {
      return;
    }

    task.started = true;
    this.metrics.started += 1;
    this.metrics.queueWaitMs[task.requestClass].push(Date.now() - task.createdAt);

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
}
