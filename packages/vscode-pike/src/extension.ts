/**
 * Pike Language Extension for VSCode
 *
 * This extension provides Pike language support including:
 * - Syntax highlighting via TextMate grammar
 * - Real-time diagnostics (syntax errors as red squiggles)
 * - Document symbols (outline view)
 * - LSP integration for IntelliSense
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  ExtensionContext,
  ConfigurationTarget,
  Position,
  Uri,
  Location,
  StatusBarAlignment,
  StatusBarItem,
  commands,
  workspace,
  window,
  OutputChannel,
  languages,
  TextDocument as VSCodeTextDocument,
  TextDocumentChangeEvent,
} from 'vscode';
import { PIKE_LANGUAGE_IDS } from './constants';
import { detectPike, getModulePathSuggestions, PikeDetectionResult } from './pike-detector';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  State,
  TransportKind,
} from 'vscode-languageclient/node';

let activeRuntime: ExtensionRuntime | undefined;

class ExtensionRuntime {
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
    testOutputChannel?: OutputChannel
  ) {
    this.outputChannel = testOutputChannel || window.createOutputChannel('Pike Language Server');
    this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'pike.lsp.serverActions';
    this.setStatusBar('idle');
    this.statusBarItem.show();
    this.track(this.statusBarItem);
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
    await autoDetectPikeConfigurationIfNeeded(this.outputChannel);

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
      didOpen: async (
        document: VSCodeTextDocument,
        next: (document: VSCodeTextDocument) => Promise<void>
      ) => {
        if (this.disposed) return;
        await next(document);
      },
      didChange: (
        event: TextDocumentChangeEvent,
        next: (event: TextDocumentChangeEvent) => Promise<void>
      ) => {
        if (this.disposed) return Promise.resolve();
        return next(event);
      },
      didSave: (
        document: VSCodeTextDocument,
        next: (document: VSCodeTextDocument) => Promise<void>
      ) => {
        if (this.disposed) return Promise.resolve();
        return next(document);
      },
      didClose: (
        document: VSCodeTextDocument,
        next: (document: VSCodeTextDocument) => Promise<void>
      ) => {
        if (this.disposed) return Promise.resolve();
        return next(document);
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
    const expandedPaths = getExpandedModulePaths(this.outputChannel);
    const expandedIncludePaths = getExpandedIncludePaths(this.outputChannel);
    const expandedProgramPaths = getExpandedProgramPaths(this.outputChannel);

    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    const normalizePath = (p: string) => (process.platform === 'win32' ? p.replace(/\\/g, '/') : p);
    const normalizedModulePaths = expandedPaths.map(normalizePath);
    const normalizedIncludePaths = expandedIncludePaths.map(normalizePath);
    const normalizedProgramPaths = expandedProgramPaths.map(normalizePath);

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
      console.error('Failed to start Pike Language Client:', err);
      this.setStatusBar('error', err instanceof Error ? err.message : String(err));
      window.showErrorMessage(`Failed to start Pike language server: ${err}`);
    }
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

/**
 * Extension API exported for testing
 */
export interface ExtensionApi {
  getClient(): LanguageClient | undefined;
  getOutputChannel(): OutputChannel;
  getLogs(): string[];
}

/**
 * Internal activation implementation
 */
async function activateInternal(
  context: ExtensionContext,
  testOutputChannel?: OutputChannel
): Promise<ExtensionApi> {
  const runtime = new ExtensionRuntime(context, testOutputChannel);
  activeRuntime = runtime;

  let disposable = commands.registerCommand('pike-module-path.add', async e => {
    if (runtime.isDisposed()) return;
    const rv = await addModulePathSetting(e.fsPath);

    if (rv) window.showInformationMessage('Folder has been added to the module path');
    else window.showInformationMessage('Folder was already on the module path');
  });

  runtime.track(disposable);

  const addProgramPathDisposable = commands.registerCommand('pike-program-path.add', async e => {
    if (runtime.isDisposed()) return;
    const rv = await addProgramPathSetting(e.fsPath);

    if (rv) window.showInformationMessage('Folder has been added to the program path');
    else window.showInformationMessage('Folder was already on the program path');
  });

  runtime.track(addProgramPathDisposable);

  const showReferencesDisposable = commands.registerCommand(
    'pike.showReferences',
    async (uri, position, symbolName?: string) => {
      if (runtime.isDisposed()) return;
      runtime
        .getOutputChannel()
        .appendLine(
          `[pike.showReferences] Called with: ${JSON.stringify({ uri, position, symbolName })}`
        );

      if (!uri || !position) {
        console.error('[pike.showReferences] Missing arguments:', { uri, position });
        window.showErrorMessage('Invalid code lens arguments. Check console.');
        return;
      }

      const refUri = Uri.parse(uri);
      let refPosition = new Position(position.line, position.character);

      // If symbolName is provided (from code lens), find the symbol's position in the document
      // This handles the case where the code lens position points to return type, not function name
      if (symbolName) {
        try {
          const doc = await workspace.openTextDocument(refUri);
          const lineText = doc.lineAt(position.line).text;
          const symbolIndex = lineText.indexOf(symbolName);
          if (symbolIndex >= 0) {
            refPosition = new Position(position.line, symbolIndex);
            runtime
              .getOutputChannel()
              .appendLine(
                `[pike.showReferences] Adjusted position to symbol: ${symbolName} at character ${symbolIndex}`
              );
          }
        } catch (err) {
          runtime
            .getOutputChannel()
            .appendLine(`[pike.showReferences] Could not adjust position for symbol: ${err}`);
        }
      }

      // Use our LSP server's reference provider directly
      const references = await commands.executeCommand(
        'vscode.executeReferenceProvider',
        refUri,
        refPosition
      );

      runtime
        .getOutputChannel()
        .appendLine(
          `[pike.showReferences] Found references: ${Array.isArray(references) ? references.length : 1}`
        );

      // Normalize to array (can be Location, Location[], or LocationLink[])
      runtime.getOutputChannel().show(true);
      let locations: Location[] = [];
      if (!references) {
        locations = [];
      } else if (Array.isArray(references)) {
        // Check if it's LocationLink array
        if (references.length > 0 && 'targetUri' in references[0]) {
          // Convert LocationLink to Location
          locations = (references as any[]).map(
            ll => new Location((ll as any).targetUri, (ll as any).targetRange)
          );
        } else {
          locations = references as any as Location[];
        }
      } else {
        // Single Location
        locations = [references as any as Location];
      }

      // Use VSCode's built-in references peek view (same as "Go to References")
      // This provides the standard references UI that users expect
      await commands.executeCommand('editor.action.showReferences', refUri, refPosition, locations);
    }
  );

  runtime.track(showReferencesDisposable);

  // Register showDiagnostics command - shows diagnostics for current document
  const showDiagnosticsDisposable = commands.registerCommand(
    'pike.lsp.showDiagnostics',
    async () => {
      if (runtime.isDisposed()) return;
      const activeEditor = window.activeTextEditor;
      if (!activeEditor) {
        window.showInformationMessage('No active Pike file to show diagnostics for.');
        return;
      }

      const doc = activeEditor.document;
      if (doc.languageId !== 'pike') {
        window.showInformationMessage('Active file is not a Pike file.');
        return;
      }

      const diagnostics = languages.getDiagnostics(doc.uri);

      if (diagnostics.length === 0) {
        window.showInformationMessage('No diagnostics found for this file.');
        return;
      }

      // Show diagnostics in output channel
      runtime.getOutputChannel().clear();
      runtime.getOutputChannel().appendLine(`Diagnostics for ${doc.uri}:`);
      runtime.getOutputChannel().appendLine(''.padEnd(40, '-'));

      for (const diag of diagnostics) {
        const severity =
          diag.severity === 0
            ? 'Error'
            : diag.severity === 1
              ? 'Error'
              : diag.severity === 2
                ? 'Warning'
                : diag.severity === 3
                  ? 'Info'
                  : 'Unknown';
        const line = diag.range.start.line + 1;
        runtime.getOutputChannel().appendLine(`  [${severity}] Line ${line}: ${diag.message}`);
      }

      runtime.getOutputChannel().show(true);
    }
  );

  runtime.track(showDiagnosticsDisposable);

  const showHealthDisposable = commands.registerCommand('pike.lsp.showHealth', async () => {
    if (runtime.isDisposed()) return;

    await runtime.ensureLspStarted();
    const client = runtime.getClient();
    if (!client) {
      window.showWarningMessage('Pike language server is not running yet.');
      return;
    }

    try {
      const result = await client.sendRequest('workspace/executeCommand', {
        command: 'pike.lsp.serverHealth',
        arguments: [],
      });

      const healthText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      runtime.getOutputChannel().show(true);
      runtime.getOutputChannel().appendLine(healthText);
      window.showInformationMessage('Pike server health printed to output channel.');
    } catch (err) {
      runtime
        .getOutputChannel()
        .appendLine(`[pike.lsp.showHealth] Failed to request server health: ${String(err)}`);
      window.showErrorMessage('Failed to fetch Pike server health.');
    }
  });

  runtime.track(showHealthDisposable);

  const restartServerDisposable = commands.registerCommand('pike.lsp.restartServer', async () => {
    if (runtime.isDisposed()) return;

    if (runtime.isLspStarted()) {
      await runtime.restartClient(true);
      return;
    }

    await runtime.ensureLspStarted();
  });

  runtime.track(restartServerDisposable);

  const serverActionsDisposable = commands.registerCommand('pike.lsp.serverActions', async () => {
    if (runtime.isDisposed()) return;

    const selected = await window.showQuickPick(
      [
        { label: 'Restart Server', command: 'pike.lsp.restartServer' },
        { label: 'Show Health', command: 'pike.lsp.showHealth' },
        { label: 'Open Logs', command: 'pike.lsp.openLogs' },
        { label: 'Detect Pike Installation', command: 'pike.detectPike' },
      ],
      {
        placeHolder: 'Pike Language Server actions',
      }
    );

    if (!selected) {
      return;
    }

    await commands.executeCommand(selected.command);
  });

  runtime.track(serverActionsDisposable);

  const openLogsDisposable = commands.registerCommand('pike.lsp.openLogs', async () => {
    if (runtime.isDisposed()) return;
    runtime.getOutputChannel().show(true);
  });

  runtime.track(openLogsDisposable);

  const enableTestCommands = process.env['PIKE_LSP_ENABLE_TEST_COMMANDS'] === '1';
  if (enableTestCommands) {
    const simulateUnexpectedStopDisposable = commands.registerCommand(
      'pike.lsp.__simulateUnexpectedStopForTesting',
      async () => {
        if (runtime.isDisposed()) return;
        await runtime.simulateUnexpectedStopForTesting();
      }
    );

    runtime.track(simulateUnexpectedStopDisposable);

    const setAutoRestartPolicyDisposable = commands.registerCommand(
      'pike.lsp.__setAutoRestartPolicyForTesting',
      async (policy: { windowMs?: number; maxAttempts?: number; backoffMs?: number[] }) => {
        if (runtime.isDisposed()) return;
        runtime.setAutoRestartPolicyForTesting(policy ?? {});
      }
    );

    runtime.track(setAutoRestartPolicyDisposable);

    const setRestartFailureModeDisposable = commands.registerCommand(
      'pike.lsp.__setRestartFailureModeForTesting',
      async (enabled: boolean) => {
        if (runtime.isDisposed()) return;
        runtime.setRestartFailureModeForTesting(Boolean(enabled));
      }
    );

    runtime.track(setRestartFailureModeDisposable);

    const getAutoRestartStateDisposable = commands.registerCommand(
      'pike.lsp.__getAutoRestartStateForTesting',
      async () => {
        if (runtime.isDisposed()) return null;
        return runtime.getAutoRestartStateForTesting();
      }
    );

    runtime.track(getAutoRestartStateDisposable);
  }

  // Register Pike detection command
  const detectPikeDisposable = commands.registerCommand('pike.detectPike', async () => {
    if (runtime.isDisposed()) return;
    await autoDetectPikeConfiguration(runtime.getOutputChannel());
  });
  runtime.track(detectPikeDisposable);

  // Register deferred activation on first Pike file open
  const fileOpenDisposable = workspace.onDidOpenTextDocument(async doc => {
    if (runtime.isDisposed()) return;
    if (runtime.isTrackedLanguage(doc.languageId)) {
      fileOpenDisposable.dispose();
      await runtime.ensureLspStarted();
    }
  });
  runtime.track(fileOpenDisposable);

    // Check for Pike files already open in editor tabs (e.g., restored session).
    // Their onDidOpenTextDocument events fired before activate(), so we missed them.
    const alreadyOpenPikeDoc = workspace.textDocuments.find(
        doc => runtime.isTrackedLanguage(doc.languageId)
    );
    if (alreadyOpenPikeDoc) {
        fileOpenDisposable.dispose();
        await runtime.ensureLspStarted();
    }

  // Also start LSP when configuration changes (if already opened a Pike file)
  context.subscriptions.push(
    workspace.onDidChangeConfiguration(async event => {
      if (runtime.isDisposed()) return;
      if (
        runtime.isLspStarted() &&
        (event.affectsConfiguration('pike.pikeModulePath') ||
          event.affectsConfiguration('pike.pikeIncludePath') ||
          event.affectsConfiguration('pike.pikeProgramPath') ||
          event.affectsConfiguration('pike.pikePath'))
      ) {
        await runtime.restartClient(false);
      }
    })
  );

  // Return the extension API
  return {
    getClient: () => runtime.getClient(),
    getOutputChannel: () => runtime.getOutputChannel(),
    getLogs: () => runtime.getLogs(),
  };
}

/**
 * Public activate function for VSCode
 */
export async function activate(context: ExtensionContext): Promise<void> {
  await activateInternal(context);
}

/**
 * Test helper: Activate extension with mock output channel
 *
 * This allows tests to capture all logs from the extension and LSP server.
 */
export async function activateForTesting(
  context: ExtensionContext,
  mockOutputChannel: OutputChannel
): Promise<ExtensionApi> {
  return activateInternal(context, mockOutputChannel);
}

function getExpandedModulePaths(outputChannel: OutputChannel): string[] {
  const config = workspace.getConfiguration('pike');
  const pikeModulePath = config.get<string[]>('pikeModulePath', ['pike']);
  let expandedPaths: string[] = [];

  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    const f = workspace.workspaceFolders[0]!.uri.fsPath;
    for (const p of pikeModulePath) {
      expandedPaths.push(p.replace('${workspaceFolder}', f));
    }
  } else {
    expandedPaths = pikeModulePath;
  }

  outputChannel.appendLine(`Pike module path: ${JSON.stringify(pikeModulePath)}`);
  return expandedPaths;
}

function getExpandedIncludePaths(outputChannel: OutputChannel): string[] {
  const config = workspace.getConfiguration('pike');
  const pikeIncludePath = config.get<string[]>('pikeIncludePath', []);
  let expandedPaths: string[] = [];

  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    const f = workspace.workspaceFolders[0]!.uri.fsPath;
    for (const p of pikeIncludePath) {
      expandedPaths.push(p.replace('${workspaceFolder}', f));
    }
  } else {
    expandedPaths = pikeIncludePath;
  }

  outputChannel.appendLine(`Pike include path: ${JSON.stringify(pikeIncludePath)}`);
  return expandedPaths;
}

function getExpandedProgramPaths(outputChannel: OutputChannel): string[] {
  const config = workspace.getConfiguration('pike');
  const pikeProgramPath = config.get<string[]>('pikeProgramPath', []);
  let expandedPaths: string[] = [];

  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    const f = workspace.workspaceFolders[0]!.uri.fsPath;
    for (const p of pikeProgramPath) {
      expandedPaths.push(p.replace('${workspaceFolder}', f));
    }
  } else {
    expandedPaths = pikeProgramPath;
  }

  outputChannel.appendLine(`Pike program path: ${JSON.stringify(pikeProgramPath)}`);
  return expandedPaths;
}

export async function addModulePathSetting(modulePath: string): Promise<boolean> {
  // Get Pike path from configuration
  const config = workspace.getConfiguration('pike');
  const pikeModulePath = config.get<string[]>('pikeModulePath', ['pike']);
  let updatedPath: string[] = [];

  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    const f = workspace.workspaceFolders[0]!.uri.fsPath;
    modulePath = modulePath.replace(f, '${workspaceFolder}');
  }

  if (!pikeModulePath.includes(modulePath)) {
    updatedPath = pikeModulePath.slice();
    updatedPath.push(modulePath);
    await config.update('pikeModulePath', updatedPath, ConfigurationTarget.Workspace);
    return true;
  }

  return false;
}

export async function addProgramPathSetting(programPath: string): Promise<boolean> {
  const config = workspace.getConfiguration('pike');
  const pikeProgramPath = config.get<string[]>('pikeProgramPath', []);
  let updatedPath: string[] = [];

  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    const f = workspace.workspaceFolders[0]!.uri.fsPath;
    programPath = programPath.replace(f, '${workspaceFolder}');
  }

  if (!pikeProgramPath.includes(programPath)) {
    updatedPath = pikeProgramPath.slice();
    updatedPath.push(programPath);
    await config.update('pikeProgramPath', updatedPath, ConfigurationTarget.Workspace);
    return true;
  }

  return false;
}

/**
 * Auto-detect Pike configuration and apply if not already set
 */
async function autoDetectPikeConfigurationIfNeeded(outputChannel: OutputChannel): Promise<void> {
  const config = workspace.getConfiguration('pike');
  const pikePath = config.get<string>('pikePath', 'pike');
  const pikeModulePath = config.get<string[]>('pikeModulePath', []);

  // Skip if user has explicitly configured paths
  if (pikePath !== 'pike' || pikeModulePath.length > 0) {
    outputChannel.appendLine(
      `[Pike] Using configured Pike paths: ${JSON.stringify({ pikePath, pikeModulePath })}`
    );
    return;
  }

  outputChannel.appendLine('[Pike] No configuration found, running auto-detection...');
  const result = await detectPike();

  if (result) {
    outputChannel.appendLine(`[Pike] Auto-detected Pike: ${JSON.stringify(result)}`);
    await applyDetectedPikeConfiguration(result, outputChannel);
  } else {
    outputChannel.appendLine('[Pike] Pike not found in common locations');
  }
}

/**
 * Manually trigger Pike detection and show results
 */
async function autoDetectPikeConfiguration(outputChannel: OutputChannel): Promise<void> {
  outputChannel.appendLine('Detecting Pike installation...');
  outputChannel.show(true);

  const result = await detectPike();

  if (result) {
    outputChannel.appendLine(`Found Pike v${result.version}:`);
    outputChannel.appendLine(`  Executable: ${result.pikePath}`);
    outputChannel.appendLine(`  Module path: ${result.modulePath || '(not found)'}`);
    outputChannel.appendLine(`  Include path: ${result.includePath || '(not found)'}`);

    const applied = await applyDetectedPikeConfiguration(result, outputChannel);
    if (applied) {
      window.showInformationMessage(`Pike v${result.version} detected and configured!`);
    } else {
      window.showInformationMessage('Pike detected but configuration already up to date.');
    }
  } else {
    outputChannel.appendLine('Pike not found on system.');
    window.showWarningMessage(
      'Could not detect Pike installation automatically. Please configure Pike paths manually in settings.'
    );
  }
}

/**
 * Apply detected Pike configuration to workspace settings
 */
async function applyDetectedPikeConfiguration(
  result: PikeDetectionResult,
  outputChannel: OutputChannel
): Promise<boolean> {
  const config = workspace.getConfiguration('pike');
  let updated = false;

  // Update pikePath if it's still the default
  const currentPikePath = config.get<string>('pikePath', 'pike');
  if (currentPikePath === 'pike' && result.pikePath !== 'pike') {
    await config.update('pikePath', result.pikePath, ConfigurationTarget.Workspace);
    updated = true;
    outputChannel.appendLine(`[Pike] Updated pikePath to: ${result.pikePath}`);
  }

  // Update module path
  const currentModulePath = config.get<string[]>('pikeModulePath', []);
  const newModulePaths: string[] = [];

  if (result.modulePath && !currentModulePath.includes(result.modulePath)) {
    newModulePaths.push(result.modulePath);
  }

  if (result.includePath && !currentModulePath.includes(result.includePath)) {
    newModulePaths.push(result.includePath);
  }

  // Also add suggestions from Pike query
  const suggestions = await getModulePathSuggestions(result.pikePath);
  for (const suggestion of suggestions) {
    if (!currentModulePath.includes(suggestion) && !newModulePaths.includes(suggestion)) {
      newModulePaths.push(suggestion);
    }
  }

  if (newModulePaths.length > 0) {
    const updatedModulePath = [...currentModulePath, ...newModulePaths];
    await config.update('pikeModulePath', updatedModulePath, ConfigurationTarget.Workspace);
    updated = true;
    outputChannel.appendLine(`[Pike] Added module paths: ${JSON.stringify(newModulePaths)}`);
  }

  return updated;
}

export async function deactivate(): Promise<void> {
  if (!activeRuntime) {
    return;
  }
  await activeRuntime.deactivate();
  activeRuntime = undefined;
}
