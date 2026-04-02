import type {
  StressDelayRange,
  StressFailure,
  StressProgress,
  StressResult,
  StressRunOptions,
  StressRunner,
} from './stress-config.js';

const DEFAULT_ITERATIONS = 1000;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_DELAY_MS: StressDelayRange = { min: 10, max: 100 };
const DEFAULT_REPORT_EVERY = 50;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeDelay(range?: StressDelayRange): StressDelayRange {
  const min = Math.max(0, Math.floor(range?.min ?? DEFAULT_DELAY_MS.min));
  const max = Math.max(min, Math.floor(range?.max ?? DEFAULT_DELAY_MS.max));
  return { min, max };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, context: string): Promise<T> {
  if (timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Stress operation timed out (${timeoutMs}ms): ${context}`));
    }, timeoutMs);

    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function deriveIterationSeed(seed: number, iteration: number): number {
  let x = (seed ^ (iteration * 0x9e3779b9)) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

function randomDelayFromSeed(seed: number, range: StressDelayRange): number {
  if (range.min === range.max) {
    return range.min;
  }

  const span = range.max - range.min + 1;
  return range.min + (seed % span);
}

function serializeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  return {
    name: 'Error',
    message: typeof error === 'string' ? error : JSON.stringify(error),
  };
}

class DefaultStressRunner implements StressRunner {
  async run<T>(
    name: string,
    iterations: number,
    operation: (seed: number, iteration: number) => Promise<T>,
    options: StressRunOptions = {}
  ): Promise<StressResult> {
    const totalIterations = Math.max(1, Math.floor(iterations || DEFAULT_ITERATIONS));
    const concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY));
    const timeoutMs = Math.max(0, Math.floor(options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
    const delayMs = normalizeDelay(options.delayMs);
    const reportEvery = Math.max(1, Math.floor(options.reportEvery ?? DEFAULT_REPORT_EVERY));
    const seed = options.seed ?? (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
    const log = options.onLog ?? (message => console.info(`[stress:${name}] ${message}`));

    log(`seed=${seed} iterations=${totalIterations} concurrency=${concurrency}`);

    const startedAt = Date.now();
    let nextIteration = 0;
    let completed = 0;
    let inFlight = 0;
    const failures: StressFailure[] = [];

    const reportProgress = (): void => {
      const progress: StressProgress = {
        name,
        seed,
        iterations: totalIterations,
        completed,
        failures: failures.length,
        inFlight,
        elapsedMs: Date.now() - startedAt,
      };
      options.onProgress?.(progress);
      if (completed % reportEvery === 0 || completed === totalIterations) {
        log(
          `progress=${completed}/${totalIterations} failures=${failures.length} elapsedMs=${progress.elapsedMs}`
        );
      }
    };

    const worker = async (workerId: number): Promise<void> => {
      while (true) {
        const iteration = nextIteration;
        nextIteration += 1;
        if (iteration >= totalIterations) {
          return;
        }

        const iterationSeed = deriveIterationSeed(seed, iteration + 1);
        const jitterDelayMs = randomDelayFromSeed(iterationSeed, delayMs);
        const iterationStartedAt = Date.now();

        inFlight += 1;
        try {
          await delay(jitterDelayMs);
          await withTimeout(
            operation(iterationSeed, iteration),
            timeoutMs,
            `name=${name} iteration=${iteration} seed=${iterationSeed}`
          );
        } catch (error) {
          const serialized = serializeError(error);
          const failure: StressFailure = {
            iteration,
            seed: iterationSeed,
            workerId,
            delayMs: jitterDelayMs,
            durationMs: Date.now() - iterationStartedAt,
            errorName: serialized.name,
            errorMessage: serialized.message,
            ...(serialized.stack ? { stack: serialized.stack } : {}),
          };
          failures.push(failure);
          log(
            `failure iteration=${iteration} seed=${iterationSeed} worker=${workerId} error=${serialized.message}`
          );
        } finally {
          completed += 1;
          inFlight -= 1;
          reportProgress();
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, totalIterations) }, (_, i) =>
      worker(i + 1)
    );
    await Promise.all(workers);

    return {
      name,
      seed,
      iterations: totalIterations,
      completed,
      failures: failures.length,
      durationMs: Date.now() - startedAt,
      concurrency,
      delayMs,
      failureContexts: failures,
    };
  }
}

export const stressRunner = new DefaultStressRunner();
