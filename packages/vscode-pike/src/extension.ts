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
import { ExtensionContext, ConfigurationTarget, Position, Uri, commands, workspace, window, OutputChannel } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;
let serverOptions: ServerOptions | null = null;
let outputChannel: OutputChannel;

/**
 * Extension API exported for testing
 */
export interface ExtensionApi {
    getClient(): LanguageClient | undefined;
    getOutputChannel(): OutputChannel;
    getLogs(): string[];
}

// Test mode flag - can be set via environment variable
const TEST_MODE = process.env.PIKE_LSP_TEST_MODE === 'true';

/**
 * Internal activation implementation
 */
async function activateInternal(context: ExtensionContext, testOutputChannel?: OutputChannel): Promise<ExtensionApi> {
    console.log('Pike Language Extension is activating...');

    // Use provided test output channel or create a real one
    outputChannel = testOutputChannel || window.createOutputChannel('Pike Language Server');

    let disposable = commands.registerCommand('pike-module-path.add', async (e) => {
        const rv = await addModulePathSetting(e.fsPath);

        if (rv)
            window.showInformationMessage('Folder has been added to the module path');
        else
            window.showInformationMessage('Folder was already on the module path');
    });

    context.subscriptions.push(disposable);

    const showReferencesDisposable = commands.registerCommand('pike.showReferences', async (arg) => {
        let uri: string | undefined;
        let position: { line: number; character: number } | undefined;

        if (Array.isArray(arg)) {
            [uri, position] = arg;
        } else if (arg && typeof arg === 'object') {
            const payload = arg as { uri?: string; position?: { line: number; character: number } };
            uri = payload.uri;
            position = payload.position;
        }

        if (!uri || !position) {
            return;
        }

        const refUri = Uri.parse(uri);
        const refPosition = new Position(position.line, position.character);
        await commands.executeCommand('editor.action.findReferences', refUri, refPosition, {
            includeDeclaration: false
        });
    });

    context.subscriptions.push(showReferencesDisposable);

    // Try multiple possible server locations
    const possiblePaths = [
        // Production: bundled server (check first for installed extensions)
        context.asAbsolutePath(path.join('server', 'server.js')),
        // Development: sibling package (monorepo structure)
        context.asAbsolutePath(path.join('..', 'pike-lsp-server', 'dist', 'server.js')),
        // Development: alternative path
        path.join(context.extensionPath, '..', 'pike-lsp-server', 'dist', 'server.js'),
    ];

    let serverModule: string | null = null;
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            serverModule = p;
            console.log(`Found Pike LSP server at: ${p}`);
            break;
        }
    }

    if (!serverModule) {
        const msg = `Pike LSP server not found. Tried:\n${possiblePaths.join('\n')}`;
        console.error(msg);
        outputChannel.appendLine(msg);
        window.showWarningMessage(
            'Pike LSP server not found. Syntax highlighting will work but no IntelliSense.'
        );
        return {
            getClient: () => undefined,
            getOutputChannel: () => outputChannel,
            getLogs: () => [],
        };
    }

    // Server options - run the server as a Node.js module
    serverOptions = {
        run: {
            module: serverModule,
            transport: TransportKind.ipc,
        },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: {
                execArgv: ['--nolazy', '--inspect=6009'],
            },
        },
    };

    await restartClient(true);

    context.subscriptions.push(
        workspace.onDidChangeConfiguration(async (event) => {
            if (
                event.affectsConfiguration('pike.pikeModulePath') ||
                event.affectsConfiguration('pike.pikeIncludePath') ||
                event.affectsConfiguration('pike.pikePath')
            ) {
                await restartClient(false);
            }
        })
    );

    // Return the extension API
    return {
        getClient: () => client,
        getOutputChannel: () => outputChannel,
        getLogs: () => {
            // If using MockOutputChannel, get logs from it
            if ('getLogs' in outputChannel && typeof outputChannel.getLogs === 'function') {
                return (outputChannel as any).getLogs();
            }
            return [];
        },
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
export async function activateForTesting(context: ExtensionContext, mockOutputChannel: OutputChannel): Promise<ExtensionApi> {
    return activateInternal(context, mockOutputChannel);
}

function getExpandedModulePaths(): string[] {
    const config = workspace.getConfiguration('pike');
    const pikeModulePath = config.get<string[]>('pikeModulePath', 'pike');
    let expandedPaths: string[] = [];

    if (workspace.workspaceFolders !== undefined) {
        let f = workspace.workspaceFolders[0].uri.fsPath;
        for (const p of pikeModulePath) {
            expandedPaths.push(p.replace("${workspaceFolder}", f));
        }
    } else {
        expandedPaths = pikeModulePath;
    }

    console.log('Pike module path: ' + JSON.stringify(pikeModulePath));
    return expandedPaths;
}

function getExpandedIncludePaths(): string[] {
    const config = workspace.getConfiguration('pike');
    const pikeIncludePath = config.get<string[]>('pikeIncludePath', []);
    let expandedPaths: string[] = [];

    if (workspace.workspaceFolders !== undefined) {
        const f = workspace.workspaceFolders[0].uri.fsPath;
        for (const p of pikeIncludePath) {
            expandedPaths.push(p.replace("${workspaceFolder}", f));
        }
    } else {
        expandedPaths = pikeIncludePath;
    }

    console.log('Pike include path: ' + JSON.stringify(pikeIncludePath));
    return expandedPaths;
}

async function restartClient(showMessage: boolean): Promise<void> {
    if (!serverOptions) {
        return;
    }

    if (client) {
        try {
            await client.stop();
        } catch (err) {
            console.error('Error stopping Pike Language Client:', err);
        }
    }

    const config = workspace.getConfiguration('pike');
    const pikePath = config.get<string>('pikePath', 'pike');
    const expandedPaths = getExpandedModulePaths();
    const expandedIncludePaths = getExpandedIncludePaths();

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'pike' },
        ],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.{pike,pmod}'),
        },
        initializationOptions: {
            pikePath,
            env: {
                'PIKE_MODULE_PATH': expandedPaths.join(":"),
                'PIKE_INCLUDE_PATH': expandedIncludePaths.join(":"),
            },
        },
        outputChannel,
    };

    client = new LanguageClient(
        'pikeLsp',
        'Pike Language Server',
        serverOptions,
        clientOptions
    );

    try {
        await client.start();
        console.log('Pike Language Extension activated successfully!');
        if (showMessage) {
            window.showInformationMessage('Pike Language Server started');
        }

        // Register health check command after client is ready
        // Note: This is registered globally, so we need to track it separately
        const showDiagnosticsDisposable = commands.registerCommand('pike.lsp.showDiagnostics', async () => {
            if (!client) {
                window.showErrorMessage('Pike LSP client not available');
                return;
            }

            try {
                const result = await client.sendRequest('workspace/executeCommand', {
                    command: 'pike.lsp.showDiagnostics',
                });

                const healthOutput = result as string ?? 'No health data available';
                outputChannel.appendLine(healthOutput);
                outputChannel.show();

                // Also show as info message with summary
                const lines = healthOutput.split('\n');
                const summaryLine = lines.find((l) => l.includes('Server Uptime') || l.includes('Bridge Connected'));
                if (summaryLine) {
                    window.showInformationMessage(`Pike LSP: ${summaryLine.trim()}`);
                }
            } catch (err) {
                window.showErrorMessage(`Failed to get diagnostics: ${err}`);
            }
        });

        // Store disposable for cleanup - we'll use a WeakMap or track separately
        // For now, we register it and it will be cleaned up on extension deactivate
        (client as any).__diagnosticsDisposable = showDiagnosticsDisposable;
    } catch (err) {
        console.error('Failed to start Pike Language Client:', err);
        window.showErrorMessage(`Failed to start Pike language server: ${err}`);
    }
}

export async function addModulePathSetting(modulePath): Promise<boolean> {
    // Get Pike path from configuration
    const config = workspace.getConfiguration('pike');
    const pikeModulePath = config.get<string[]>('pikeModulePath', 'pike');
    let updatedPath: string[] = [];

    if (workspace.workspaceFolders !== undefined) {
        let f = workspace.workspaceFolders[0].uri.fsPath;
            modulePath = modulePath.replace(f, "${workspaceFolder}");
     }

    if (!pikeModulePath.includes(modulePath)) {
        updatedPath = pikeModulePath.slice();
        updatedPath.push(modulePath);
        await config.update('pikeModulePath', updatedPath, ConfigurationTarget.Workspace);
        return true;
    }

    return false;
}

export async function deactivate(): Promise<void> {
    if (!client) {
        return;
    }
    try {
        // Clean up diagnostics command disposable if registered
        const diagDisposable = (client as any).__diagnosticsDisposable;
        if (diagDisposable) {
            diagDisposable.dispose();
        }
        await client.stop();
        console.log('Pike Language Extension deactivated');
    } catch (err) {
        console.error('Error stopping Pike Language Client:', err);
    }
}
