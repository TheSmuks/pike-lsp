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
import { DEFAULT_DIAGNOSTIC_DELAY, DEBUG_PORT } from './constants.js';

let client: LanguageClient | undefined;
let serverOptions: ServerOptions | null = null;
let outputChannel: OutputChannel;
let diagnosticsCommandDisposable: ReturnType<typeof commands.registerCommand> | undefined;

/**
 * Extension API exported for testing
 */
export interface ExtensionApi {
    getClient(): LanguageClient | undefined;
    getOutputChannel(): OutputChannel;
    getLogs(): string[];
}

// Test mode flag - can be set via environment variable
const TEST_MODE = process.env['PIKE_LSP_TEST_MODE'] === 'true';

/**
 * Console-logging output channel wrapper for E2E tests
 * Wraps a real OutputChannel but also logs everything to console
 * so test runners can capture Pike server errors.
 */
function createTestOutputChannel(name: string): OutputChannel {
    const realChannel = window.createOutputChannel(name);
    return {
        name: realChannel.name,
        append: (value: string) => {
            console.log(`[${name}] ${value}`);
            realChannel.append(value);
        },
        appendLine: (value: string) => {
            console.log(`[${name}] ${value}`);
            realChannel.appendLine(value);
        },
        replace: (value: string) => {
            console.log(`[${name}] (replace) ${value}`);
            realChannel.replace(value);
        },
        clear: () => realChannel.clear(),
        show: (column?: any, preserveFocus?: boolean) => realChannel.show(column, preserveFocus),
        hide: () => realChannel.hide(),
        dispose: () => realChannel.dispose(),
    };
}

/**
 * Internal activation implementation
 */
async function activateInternal(context: ExtensionContext, testOutputChannel?: OutputChannel): Promise<ExtensionApi> {
    console.log('Pike Language Extension is activating...');

    // Use provided test output channel, or create one
    // In test mode, wrap with console logging so tests can see Pike errors
    if (testOutputChannel) {
        outputChannel = testOutputChannel;
    } else if (TEST_MODE) {
        outputChannel = createTestOutputChannel('Pike Language Server');
        console.log('[Pike LSP] Test mode enabled - all output will be logged to console');
    } else {
        outputChannel = window.createOutputChannel('Pike Language Server');
    }

    let disposable = commands.registerCommand('pike-module-path.add', async (e) => {
        const rv = await addModulePathSetting(e.fsPath);

        if (rv)
            window.showInformationMessage('Folder has been added to the module path');
        else
            window.showInformationMessage('Folder was already on the module path');
    });

    context.subscriptions.push(disposable);

    // Register diagnostics command immediately (works even before client starts)
    diagnosticsCommandDisposable = commands.registerCommand('pike.lsp.showDiagnostics', async () => {
        if (!client) {
            window.showWarningMessage('Pike LSP is not active. Open a .pike file to start the server.');
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

    context.subscriptions.push(diagnosticsCommandDisposable);

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
                execArgv: ['--nolazy', `--inspect=${DEBUG_PORT}`],
            },
        },
    };

    await restartClient(true);

    context.subscriptions.push(
        workspace.onDidChangeConfiguration(async (event) => {
            if (
                event.affectsConfiguration('pike.pikeModulePath') ||
                event.affectsConfiguration('pike.pikeIncludePath') ||
                event.affectsConfiguration('pike.pikePath') ||
                event.affectsConfiguration('pike.diagnosticDelay')
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
    const pikeModulePath = config.get<string[] | string>('pikeModulePath', 'pike');
    let expandedPaths: string[] = [];

    if (workspace.workspaceFolders !== undefined) {
        const folder = workspace.workspaceFolders[0];
        if (folder) {
            const f = folder.uri.fsPath;
            const paths = Array.isArray(pikeModulePath) ? pikeModulePath : [pikeModulePath];
            for (const p of paths) {
                expandedPaths.push(p.replace("${workspaceFolder}", f));
            }
        }
    } else {
        expandedPaths = Array.isArray(pikeModulePath) ? pikeModulePath : [pikeModulePath];
    }

    console.log('Pike module path: ' + JSON.stringify(pikeModulePath));
    return expandedPaths;
}

function getExpandedIncludePaths(): string[] {
    const config = workspace.getConfiguration('pike');
    const pikeIncludePath = config.get<string[]>('pikeIncludePath', []);
    let expandedPaths: string[] = [];

    if (workspace.workspaceFolders !== undefined) {
        const folder = workspace.workspaceFolders[0];
        if (folder) {
            const f = folder.uri.fsPath;
            for (const p of pikeIncludePath) {
                expandedPaths.push(p.replace("${workspaceFolder}", f));
            }
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
    const diagnosticDelay = config.get<number>('diagnosticDelay', DEFAULT_DIAGNOSTIC_DELAY);
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
            diagnosticDelay,
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
    } catch (err) {
        console.error('Failed to start Pike Language Client:', err);
        window.showErrorMessage(`Failed to start Pike language server: ${err}`);
    }
}

export async function addModulePathSetting(modulePath: string): Promise<boolean> {
    // Get Pike path from configuration
    const config = workspace.getConfiguration('pike');
    const pikeModulePath = config.get<string[] | string>('pikeModulePath', 'pike');

    if (workspace.workspaceFolders !== undefined) {
        const folder = workspace.workspaceFolders[0];
        if (folder) {
            const f = folder.uri.fsPath;
            modulePath = modulePath.replace(f, "${workspaceFolder}");
        }
    }

    const existingPaths = Array.isArray(pikeModulePath) ? pikeModulePath : [pikeModulePath];
    if (!existingPaths.includes(modulePath)) {
        const updatedPath = [...existingPaths, modulePath];
        await config.update('pikeModulePath', updatedPath, ConfigurationTarget.Workspace);
        return true;
    }

    return false;
}

export async function deactivate(): Promise<void> {
    // Clean up diagnostics command disposable if registered
    if (diagnosticsCommandDisposable) {
        diagnosticsCommandDisposable.dispose();
        diagnosticsCommandDisposable = undefined;
    }

    if (!client) {
        return;
    }
    try {
        await client.stop();
        console.log('Pike Language Extension deactivated');
    } catch (err) {
        console.error('Error stopping Pike Language Client:', err);
    }
}
