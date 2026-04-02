export interface MockBridgeConfig {
  analyzeResult?: (text: string) => { hasError: boolean; errorMessage?: string };
  delayMs?: number;
  onQuery?: (context: { callCount: number; text: string }) => void;
  onCancel?: () => void;
}

export interface FaultInjectionConfig {
  restartAtIteration?: number;
  crashAtOperation?: string;
  delayMs?: { min: number; max: number };
  failWithError?: Error;
  hangDurationMs?: number;
  probability?: number;
  triggerAfterMs?: number;
}

interface FaultStats {
  injected: number;
  triggered: number;
}

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();

function hashDeterministic(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class MockBridge {
  protected _callCount = 0;
  protected running = true;
  protected revisionClock = 0;
  protected cancelledRequestIds = new Set<string>();
  protected readonly config: MockBridgeConfig;
  protected readonly delayMs: number;
  protected readonly analyzeResult: (text: string) => { hasError: boolean; errorMessage?: string };

  constructor(config: MockBridgeConfig = {}) {
    this.config = config;
    this.delayMs = config.delayMs ?? 1;
    this.analyzeResult = config.analyzeResult ?? (() => ({ hasError: false }));
  }

  get callCount(): number {
    return this._callCount;
  }

  isRunning(): boolean {
    return this.running;
  }

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  protected async maybeInjectFault(_operation: string): Promise<void> {}

  protected nextMutationAck(): { revision: number; snapshotId: string } {
    this.revisionClock += 1;
    return {
      revision: this.revisionClock,
      snapshotId: `snp-${this.revisionClock}`,
    };
  }

  async engineOpenDocument(_params?: unknown): Promise<{ revision: number; snapshotId: string }> {
    await this.maybeInjectFault('engineOpenDocument');
    return this.nextMutationAck();
  }

  async engineChangeDocument(_params?: unknown): Promise<{ revision: number; snapshotId: string }> {
    await this.maybeInjectFault('engineChangeDocument');
    return this.nextMutationAck();
  }

  async engineCloseDocument(_params?: unknown): Promise<{ revision: number; snapshotId: string }> {
    await this.maybeInjectFault('engineCloseDocument');
    return this.nextMutationAck();
  }

  async engineUpdateConfig(_params?: unknown): Promise<{ revision: number; snapshotId: string }> {
    await this.maybeInjectFault('engineUpdateConfig');
    return this.nextMutationAck();
  }

  async engineUpdateWorkspace(
    _params?: unknown
  ): Promise<{ revision: number; snapshotId: string }> {
    await this.maybeInjectFault('engineUpdateWorkspace');
    return this.nextMutationAck();
  }

  async engineCancelRequest(params?: { requestId?: string }): Promise<{ accepted: boolean }> {
    await this.maybeInjectFault('engineCancelRequest');
    if (params?.requestId) {
      this.cancelledRequestIds.add(params.requestId);
    }
    this.config.onCancel?.();
    return { accepted: true };
  }

  async engineQuery(params: { requestId?: string; queryParams?: { text?: string } }): Promise<{
    snapshotIdUsed: string;
    result: Record<string, unknown>;
    metrics: Record<string, unknown>;
  }> {
    this._callCount += 1;
    if (!this.running) {
      throw new Error('Bridge is not running');
    }
    await this.maybeInjectFault('engineQuery');

    const requestId = params.requestId;
    if (requestId && this.cancelledRequestIds.has(requestId)) {
      throw new Error(`Request cancelled: ${requestId}`);
    }

    const text = params.queryParams?.text ?? '';
    this.config.onQuery?.({ callCount: this._callCount, text });
    const analysis = this.analyzeResult(text);
    const diags = analysis.hasError
      ? [
          {
            message: analysis.errorMessage ?? 'Syntax error',
            severity: 'error',
            position: { line: 1, character: 0 },
          },
        ]
      : [];

    if (this.delayMs > 0) await sleep(this.delayMs);

    if (requestId && this.cancelledRequestIds.has(requestId)) {
      throw new Error(`Request cancelled: ${requestId}`);
    }

    return {
      snapshotIdUsed: `snp-${this._callCount}`,
      result: {
        analyzeResult: {
          result: {
            parse: { symbols: [], diagnostics: [] },
            introspect: {
              success: analysis.hasError ? 0 : 1,
              symbols: [],
              functions: [],
              variables: [],
              classes: [],
              inherits: [],
              diagnostics: [],
            },
            diagnostics: { diagnostics: diags },
          },
        },
        revision: 1,
      },
      metrics: { durationMs: this.delayMs },
    };
  }

  async analyze(): Promise<never> {
    await this.maybeInjectFault('analyze');
    throw new Error('analyze fallback should not be used');
  }

  async findOccurrences(_params?: unknown): Promise<{ occurrences: unknown[] }> {
    await this.maybeInjectFault('resolve');
    return { occurrences: [] };
  }
}

export class FaultInjectableMockBridge extends MockBridge {
  private faultConfig: FaultInjectionConfig = {};
  private stats: FaultStats = { injected: 0, triggered: 0 };

  constructor(config: MockBridgeConfig = {}, faultConfig: FaultInjectionConfig = {}) {
    super(config);
    this.faultConfig = { ...faultConfig };
  }

  setFaultConfig(config: FaultInjectionConfig): void {
    this.faultConfig = { ...config };
  }

  clearFaults(): void {
    this.faultConfig = {};
    this.stats = { injected: 0, triggered: 0 };
  }

  getFaultStats(): FaultStats {
    return { ...this.stats };
  }

  protected override async maybeInjectFault(operation: string): Promise<void> {
    if (!this.isFaultConfigured()) {
      return;
    }

    this.stats.injected += 1;
    if (!this.shouldInject(operation)) {
      return;
    }

    let triggered = false;

    const triggerAfterMs = this.faultConfig.triggerAfterMs ?? 0;
    if (triggerAfterMs > 0) {
      await sleep(triggerAfterMs);
      triggered = true;
    }

    const restartAt = this.faultConfig.restartAtIteration;
    if (restartAt !== undefined && this.callCount === restartAt) {
      this.running = false;
      await sleep(2);
      this.running = true;
      triggered = true;
    }

    if (this.faultConfig.delayMs) {
      const { min, max } = this.faultConfig.delayMs;
      const lo = Math.max(0, Math.min(min, max));
      const hi = Math.max(lo, Math.max(min, max));
      const span = hi - lo;
      const offset =
        span === 0 ? 0 : hashDeterministic(`${operation}:${this.callCount}`) % (span + 1);
      await sleep(lo + offset);
      triggered = true;
    }

    const hangDurationMs = this.faultConfig.hangDurationMs ?? 0;
    if (hangDurationMs > 0) {
      await sleep(hangDurationMs);
      triggered = true;
    }

    const crashTarget = this.faultConfig.crashAtOperation;
    if (crashTarget && crashTarget === operation) {
      this.stats.triggered += 1;
      throw this.faultConfig.failWithError ?? new Error(`Injected crash at ${operation}`);
    }

    if (triggered) {
      this.stats.triggered += 1;
    }
  }

  private isFaultConfigured(): boolean {
    return (
      this.faultConfig.restartAtIteration !== undefined ||
      this.faultConfig.crashAtOperation !== undefined ||
      this.faultConfig.delayMs !== undefined ||
      this.faultConfig.failWithError !== undefined ||
      this.faultConfig.hangDurationMs !== undefined ||
      this.faultConfig.probability !== undefined ||
      this.faultConfig.triggerAfterMs !== undefined
    );
  }

  private shouldInject(operation: string): boolean {
    const probability = this.faultConfig.probability;
    if (probability === undefined) {
      return true;
    }
    if (probability <= 0) {
      return false;
    }
    if (probability >= 1) {
      return true;
    }
    const threshold = hashDeterministic(`${operation}:${this.callCount}:prob`) / 0xffffffff;
    return threshold < probability;
  }
}
