/**
 * Extension Runtime - Manages LSP client lifecycle and server state
 *
 * Handles: client management, status bar, auto-restart, server lifecycle
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  ExtensionContext,
  StatusBarAlignment,
  StatusBarItem,
  OutputChannel,
  workspace,
  window,
} from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  State,
  TransportKind,
} from 'vscode-languageclient/node';
import { PIKE_LANGUAGE_IDS } from './constants';
import { autoDetectPikeConfigurationIfNeeded } from './pike-config';

export interface ExtensionRuntimeDeps {
  getExpandedModulePaths: (channel: OutputChannel) => string[];
  getExpandedIncludePaths: (channel: OutputChannel) => string[];
  getExpandedProgramPaths: (channel: OutputChannel) => string[];
  getExpandedDefineFiles: (channel: OutputChannel) => string[];
}

export class ExtensionRuntime {
  private client: LanguageClient | undefined;
  private serverOptions: ServerOptions | null = null;
  private serverModulePath: string | null = null;
  private readonly outputChannel: OutputChannel;
  private readonly statusBarItem: StatusBarItem;
  private restartAttempts = 0;
  private restartWindowStart = 0;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;
  private suppressNextStopEvent = false;
  private autoRestartPaused = false;
  private forceRestartFailureForTesting = false;
  private restartPolicy = {
    windowMs: 60_000,
    maxAttempts: 3,
    backoffMs: [1000, 3000, 7000],
  };
  private lspStarted = false;
  private disposed = false;

  constructor(
    private readonly context: ExtensionContext,
    private readonly deps: ExtensionRuntimeDeps,
    testOutputChannel?: OutputChannel
  ) {
    this.outputChannel = testOutputChannel || window.createOutputChannel('Pike Language Server');

    const config = workspace.getConfiguration('pike');
    const showStatusBar = config.get<boolean>('showStatusBar', true);

    if (showStatusBar) {
      this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
      this.statusBarItem.command = 'pike.lsp.serverActions';
      this.setStatusBar('idle');
      this.statusBarItem.show();
      this.track(this.statusBarItem);
    } else {
      this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
      this.statusBarItem.hide();
    }
  }

  private clearRestartTimer(): void {
    if (!this.restartTimer) {
      return;
    }
    clearTimeout(this.restartTimer);
    this.restartTimer = undefined;
  }

  private resetRestartWindow(): void {
    this.restartAttempts = 0;
    this.restartWindowStart = 0;
    this.autoRestartPaused = false;
  }

  private scheduleAutoRestart(reason: string): void {
    if (this.disposed || !this.lspStarted) {
      return;
    }

    const config = workspace.getConfiguration('pike');
    const autoRestart = config.get<boolean>('server.autoRestart', true);
    if (!autoRestart) {
      this.outputChannel.appendLine(`[Pike] ${reason}. Auto-restart disabled.`);
      this.setStatusBar('stopped');
      return;
    }

    const now = Date.now();
    const { windowMs, maxAttempts, backoffMs } = this.restartPolicy;

    if (this.restartWindowStart === 0 || now - this.restartWindowStart > windowMs) {
      this.restartWindowStart = now;
      this.restartAttempts = 0;
      this.autoRestartPaused = false;
    }

    if (this.restartAttempts >= maxAttempts) {
      this.autoRestartPaused = true;
      this.clearRestartTimer();
      this.setStatusBar('error', 'auto-restart paused');
      this.outputChannel.appendLine('[Pike] Auto-restart paused after repeated failures.');
      window.showWarningMessage(
        'Pike language server stopped repeatedly. Auto-restart paused; run "Pike LSP: Restart Server".'
      );
      return;
    }

    this.restartAttempts += 1;
    const delay = backoffMs[Math.min(this.restartAttempts - 1, backoffMs.length - 1)] ?? 1000;
    this.clearRestartTimer();
    this.outputChannel.appendLine(
      `[Pike] ${reason}. Scheduling auto-restart in ${delay}ms (attempt ${this.restartAttempts}/${maxAttempts}).`
    );
    this.setStatusBar('restarting', `retry in ${Math.round(delay / 1000)}s`);

    this.restartTimer = setTimeout(async () => {
      this.restartTimer = undefined;
      if (this.disposed || !this.lspStarted) {
        return;
      }
      await this.restartClient(false);
    }, delay);
  }

  private setStatusBar(
    state: 'idle' | 'starting' | 'running' | 'restarting' | 'error' | 'stopped',
    detail?: string
  ): void {
    const suffix = detail ? ` (${detail})` : '';

    switch (state) {
      case 'idle':
        this.statusBarItem.text = '$(symbol-key) Pike';
        this.statusBarItem.tooltip = `Pike LSP: idle${suffix}\nClick for server actions`;
        break;
      case 'starting':
        this.statusBarItem.text = '$(sync~spin) Pike';
        this.statusBarItem.tooltip = `Pike LSP: starting${suffix}\nClick for server actions`;
        break;
      case 'running':
        this.statusBarItem.text = '$(check) Pike';
        this.statusBarItem.tooltip = `Pike LSP: running${suffix}\nClick for server actions`;
        break;
      case 'restarting':
        this.statusBarItem.text = '$(sync~spin) Pike';
        this.statusBarItem.tooltip = `Pike LSP: restarting${suffix}\nClick for server actions`;
        break;
      case 'error':
        this.statusBarItem.text = '$(error) Pike';
        this.statusBarItem.tooltip = `Pike LSP: error${suffix}\nClick for server actions`;
        break;
      case 'stopped':
        this.statusBarItem.text = '$(debug-stop) Pike';
        this.statusBarItem.tooltip = `Pike LSP: stopped${suffix}\nClick for server actions`;
        break;
      default:
        this.statusBarItem.text = 'Pike';
        this.statusBarItem.tooltip = 'Pike Language Server';
        break;
    }
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  isLspStarted(): boolean {
    return this.lspStarted;
  }

  getClient(): LanguageClient | undefined {
    return this.client;
  }

  getOutputChannel(): OutputChannel {
    return this.outputChannel;
  }

  getLogs(): string[] {
    if ('getLogs' in this.outputChannel && typeof this.outputChannel.getLogs === 'function') {
      return this.outputChannel.getLogs();
    }
    return [];
  }

  track(disposable: { dispose(): unknown }): void {
    this.context.subscriptions.push(disposable);
  }

  isTrackedLanguage(languageId: string): boolean {
    return (PIKE_LANGUAGE_IDS as readonly string[]).includes(languageId);
  }

  async ensureLspStarted(): Promise<void> {
    if (this.disposed || this.lspStarted) {
      return;
    }

    this.lspStarted = true;
    this.setStatusBar('starting');

    const config = workspace.getConfiguration('pike');
    const autoDetectPaths = config.get<boolean>('autoDetectPaths', true);
    if (autoDetectPaths) {
      await autoDetectPikeConfigurationIfNeeded(this.outputChannel);
    }

    const serverModule = this.resolveServerModule();
    if (!serverModule) {
      this.lspStarted = false;
      return;
    }

    this.serverModulePath = serverModule;
    const serverDir = path.dirname(path.dirname(serverModule));
    this.serverOptions = {
      run: {
        module: serverModule,
        transport: TransportKind.ipc,
        options: {
          cwd: serverDir,
        },
      },
      debug: {
        module: serverModule,
        transport: TransportKind.ipc,
        options: {
          execArgv: ['--nolazy', '--inspect=6009'],
          cwd: serverDir,
        },
      },
    };

    await this.restartClient(true);
  }

  private resolveServerModule(): string | null {
    const possiblePaths = [
      this.context.asAbsolutePath(path.join('server', 'server.js')),
      this.context.asAbsolutePath(path.join('..', 'pike-lsp-server', 'dist', 'server.js')),
      path.join(this.context.extensionPath, '..', 'pike-lsp-server', 'dist', 'server.js'),
    ];

    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }

    const msg = `Pike LSP server not found. Tried:\n${possiblePaths.join('\n')}`;
    console.error(msg);
    this.outputChannel.appendLine(msg);
    window.showWarningMessage(
      'Pike LSP server not found. Syntax highlighting will work but no IntelliSense.'
    );
    return null;
  }

  private createMiddleware(): NonNullable<LanguageClientOptions['middleware']> {
    return {
      didOpen: async (document, next) => {
        if (this.disposed) return;
        await next(document);
      },
      didChange: (event, next) => {
        if (this.disposed) return Promise.resolve();
        return next(event);
      },
      didSave: (document, next) => {
        if (this.disposed) return Promise.resolve();
        return next(document);
      },
      didClose: (document, next) => {
        if (this.disposed) return Promise.resolve();
        return next(document);
      },
      provideOnTypeFormattingEdits: (document, position, ch, options, token, next) => {
        if (!workspace.getConfiguration('pike').get<boolean>('formatOnType', true)) {
          return Promise.resolve([]);
        }
        return next(document, position, ch, options, token);
      },
    };
  }

  async restartClient(showMessage: boolean): Promise<void> {
    if (this.disposed || !this.serverOptions) {
      return;
    }

    const hadExistingClient = Boolean(this.client);

    if (this.client) {
      try {
        this.suppressNextStopEvent = true;
        await this.client.stop();
      } catch (err) {
        console.error('Error stopping Pike Language Client:', err);
        this.suppressNextStopEvent = false;
      }
    }

    this.clearRestartTimer();

    const config = workspace.getConfiguration('pike');
    const pikePath = config.get<string>('pikePath', 'pike');
    const expandedPaths = this.deps.getExpandedModulePaths(this.outputChannel);
    const expandedIncludePaths = this.deps.getExpandedIncludePaths(this.outputChannel);
    const expandedProgramPaths = this.deps.getExpandedProgramPaths(this.outputChannel);
    const analysisDefines = config.get<string[]>('analysis.defines', []);
    const expandedDefineFiles = this.deps.getExpandedDefineFiles(this.outputChannel);

    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    const normalizePath = (p: string) => (process.platform === 'win32' ? p.replace(/\\/g, '/') : p);
    const normalizedModulePaths = expandedPaths.map(normalizePath);
    const normalizedIncludePaths = expandedIncludePaths.map(normalizePath);
    const normalizedProgramPaths = expandedProgramPaths.map(normalizePath);
    const normalizedDefineFiles = expandedDefineFiles.map(normalizePath);

    if (!this.serverModulePath) {
      throw new Error('Server module path not set');
    }

    const serverDir = path.dirname(this.serverModulePath);
    const extensionRoot = path.resolve(serverDir, '..');
    const analyzerPath = path.join(extensionRoot, 'server', 'pike-scripts', 'analyzer.pike');

    if (!fs.existsSync(analyzerPath)) {
      const message = `Pike analyzer script not found at ${analyzerPath}`;
      this.outputChannel.appendLine(message);
      window.showWarningMessage(
        'Pike analyzer script not found. Language features may be limited.'
      );
    }

    const clientOptions: LanguageClientOptions = {
      documentSelector: PIKE_LANGUAGE_IDS.map(lang => ({ scheme: 'file', language: lang })),
      synchronize: {
        fileEvents: workspace.createFileSystemWatcher('**/*.{pike,pmod,rxml,roxen,rjs}'),
      },
      initializationOptions: {
        pikePath,
        analyzerPath,
        env: {
          PIKE_MODULE_PATH: normalizedModulePaths.join(pathSeparator),
          PIKE_INCLUDE_PATH: normalizedIncludePaths.join(pathSeparator),
          PIKE_PROGRAM_PATH: normalizedProgramPaths.join(pathSeparator),
        },
        analysis: {
          defines: analysisDefines,
          defineFiles: normalizedDefineFiles,
        },
        maxNumberOfProblems: config.get<number>('maxNumberOfProblems', 100),
        inlayHints: {
          enabled: config.get<boolean>('inlayHints.enabled', true),
          parameterNames: config.get<boolean>('inlayHints.parameterNames', true),
        },
        inlineValues: {
          enabled: config.get<boolean>('inlineValues.enabled', true),
        },
      },
      middleware: this.createMiddleware(),
      outputChannel: this.outputChannel,
    };

    const effectiveServerOptions: ServerOptions = this.forceRestartFailureForTesting
      ? {
          run: {
            module: path.join(this.context.extensionPath, '__missing_server_for_testing__.js'),
            transport: TransportKind.ipc,
          },
          debug: {
            module: path.join(this.context.extensionPath, '__missing_server_for_testing__.js'),
            transport: TransportKind.ipc,
          },
        }
      : this.serverOptions;

    this.client = new LanguageClient(
      'pikeLsp',
      'Pike Language Server',
      effectiveServerOptions,
      clientOptions
    );

    this.track(
      this.client.onDidChangeState(event => {
        switch (event.newState) {
          case State.Starting:
            this.setStatusBar('starting');
            break;
          case State.Running:
            this.resetRestartWindow();
            this.setStatusBar('running');
            break;
          case State.Stopped:
            this.setStatusBar('stopped');
            if (this.suppressNextStopEvent) {
              this.suppressNextStopEvent = false;
              return;
            }
            this.scheduleAutoRestart('Language server stopped unexpectedly');
            break;
          default:
            this.setStatusBar('idle');
            break;
        }
      })
    );

    try {
      this.setStatusBar(hadExistingClient ? 'restarting' : 'starting');
      await this.client.start();
      this.setStatusBar('running');
      if (showMessage && !this.disposed) {
        window.showInformationMessage('Pike Language Server started');
      }
    } catch (err) {
      const safeMessage = this.anonymizeSensitivePaths(
        err instanceof Error ? err.message : String(err)
      );
      console.error('Failed to start Pike Language Client:', err);
      this.setStatusBar('error', safeMessage);
      window.showErrorMessage(`Failed to start Pike language server: ${safeMessage}`);
    }
  }

  private anonymizeSensitivePaths(value: string): string {
    const home = process.env['HOME'];
    const userProfile = process.env['USERPROFILE'];
    const prefixes = [home, userProfile].filter((v): v is string => Boolean(v));

    let output = value;
    for (const prefix of prefixes) {
      const normalized = prefix.replace(/\\/g, '/');
      output = output.replaceAll(normalized, '$HOME');
      output = output.replaceAll(prefix, '$HOME');
    }

    return output;
  }

  async deactivate(): Promise<void> {
    this.disposed = true;
    this.clearRestartTimer();
    if (!this.client) {
      return;
    }
    try {
      this.suppressNextStopEvent = true;
      await this.client.stop();
    } catch (err) {
      console.error('Error stopping Pike Language Client:', err);
      this.suppressNextStopEvent = false;
    }
    this.client = undefined;
    this.setStatusBar('stopped');
  }

  async simulateUnexpectedStopForTesting(): Promise<void> {
    if (!this.client) {
      throw new Error('Language client is not running');
    }

    const waitDeadline = Date.now() + 15000;
    while (this.client && this.client.state !== State.Running && Date.now() < waitDeadline) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (!this.client) {
      throw new Error('Language client is no longer available');
    }

    if (this.client.state !== State.Running) {
      throw new Error(`Language client is not running (state: ${this.client.state})`);
    }

    this.suppressNextStopEvent = false;
    const currentClient = this.client;
    this.client = undefined;
    await currentClient.stop();
  }

  setAutoRestartPolicyForTesting(policy: {
    windowMs?: number;
    maxAttempts?: number;
    backoffMs?: number[];
  }): void {
    if (
      typeof policy.windowMs === 'number' &&
      Number.isFinite(policy.windowMs) &&
      policy.windowMs > 0
    ) {
      this.restartPolicy.windowMs = policy.windowMs;
    }

    if (
      typeof policy.maxAttempts === 'number' &&
      Number.isFinite(policy.maxAttempts) &&
      policy.maxAttempts > 0
    ) {
      this.restartPolicy.maxAttempts = policy.maxAttempts;
    }

    if (
      Array.isArray(policy.backoffMs) &&
      policy.backoffMs.length > 0 &&
      policy.backoffMs.every(ms => Number.isFinite(ms) && ms >= 0)
    ) {
      this.restartPolicy.backoffMs = policy.backoffMs;
    }
  }

  setRestartFailureModeForTesting(enabled: boolean): void {
    this.forceRestartFailureForTesting = enabled;
  }

  getAutoRestartStateForTesting(): {
    attempts: number;
    paused: boolean;
    timerActive: boolean;
    lspStarted: boolean;
    clientState: State | null;
  } {
    return {
      attempts: this.restartAttempts,
      paused: this.autoRestartPaused,
      timerActive: Boolean(this.restartTimer),
      lspStarted: this.lspStarted,
      clientState: this.client?.state ?? null,
    };
  }
}
