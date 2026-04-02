export interface StressDelayRange {
  min: number;
  max: number;
}

export interface StressRunOptions {
  concurrency?: number;
  delayMs?: StressDelayRange;
  timeoutMs?: number;
  seed?: number;
  reportEvery?: number;
  onProgress?: (progress: StressProgress) => void;
  onLog?: (message: string) => void;
}

export interface StressFailure {
  iteration: number;
  seed: number;
  workerId: number;
  delayMs: number;
  durationMs: number;
  errorName: string;
  errorMessage: string;
  stack?: string;
}

export interface StressProgress {
  name: string;
  seed: number;
  iterations: number;
  completed: number;
  failures: number;
  inFlight: number;
  elapsedMs: number;
}

export interface StressResult {
  name: string;
  seed: number;
  iterations: number;
  completed: number;
  failures: number;
  durationMs: number;
  concurrency: number;
  delayMs: StressDelayRange;
  failureContexts: StressFailure[];
}

export interface StressRunner {
  run<T>(
    name: string,
    iterations: number,
    operation: (seed: number, iteration: number) => Promise<T>,
    options?: {
      concurrency?: number;
      delayMs?: { min: number; max: number };
      timeoutMs?: number;
      seed?: number;
      reportEvery?: number;
      onProgress?: (progress: StressProgress) => void;
      onLog?: (message: string) => void;
    }
  ): Promise<StressResult>;
}
