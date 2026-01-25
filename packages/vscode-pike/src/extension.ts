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
import { ExtensionContext, ConfigurationTarget, Position, Uri, Location, commands, workspace, window, OutputChannel, languages } from 'vscode';
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

    const showReferencesDisposable = commands.registerCommand('pike.showReferences', async (uri, position, symbolName?: string) => {
        console.log('[pike.showReferences] Called with:', { uri, position, symbolName });

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
                    console.log('[pike.showReferences] Adjusted position to symbol:', { symbolName, character: symbolIndex });
                }
            } catch (err) {
                console.warn('[pike.showReferences] Could not adjust position for symbol:', err);
            }
        }

        // Use our LSP server's reference provider directly
        const references = await commands.executeCommand(
            'vscode.executeReferenceProvider',
            refUri,
            refPosition
        );

        console.log('[pike.showReferences] Found references:', Array.isArray(references) ? references.length : 1);

        // Normalize to array (can be Location, Location[], or LocationLink[])
        let locations: Location[] = [];
        if (!references) {
            locations = [];
        } else if (Array.isArray(references)) {
            // Check if it's LocationLink array
            if (references.length > 0 && 'targetUri' in references[0]) {
                // Convert LocationLink to Location
                locations = (references as any[]).map(ll =>
                    new Location((ll as any).targetUri, (ll as any).targetRange)
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
        await commands.executeCommand(
            'editor.action.showReferences',
            refUri,
            refPosition,
            locations
        );
    });

    context.subscriptions.push(showReferencesDisposable);

    // Register showDiagnostics command - shows diagnostics for current document
    const showDiagnosticsDisposable = commands.registerCommand('pike.lsp.showDiagnostics', async () => {
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
        outputChannel.clear();
        outputChannel.appendLine(`Diagnostics for ${doc.uri}:`);
        outputChannel.appendLine(''.padEnd(40, '-'));

        for (const diag of diagnostics) {
            const severity = diag.severity === 0 ? 'Error' :
                           diag.severity === 1 ? 'Error' :
                           diag.severity === 2 ? 'Warning' :
                           diag.severity === 3 ? 'Info' : 'Unknown';
            const line = diag.range.start.line + 1;
            outputChannel.appendLine(`  [${severity}] Line ${line}: ${diag.message}`);
        }

        outputChannel.show(true);
    });

    context.subscriptions.push(showDiagnosticsDisposable);

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

    // Determine the server package root directory for proper module resolution
    // The server.js file is in dist/, but relative imports need the package root as cwd
    const serverDir = path.dirname(path.dirname(serverModule));

    // Server options - run the server as a Node.js module
    serverOptions = {
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
    const pikeModulePath = config.get<string[]>('pikeModulePath', ['pike']);
    let expandedPaths: string[] = [];

    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
        const f = workspace.workspaceFolders[0]!.uri.fsPath;
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

    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
        const f = workspace.workspaceFolders[0]!.uri.fsPath;
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
    } catch (err) {
        console.error('Failed to start Pike Language Client:', err);
        window.showErrorMessage(`Failed to start Pike language server: ${err}`);
    }
}

export async function addModulePathSetting(modulePath: string): Promise<boolean> {
    // Get Pike path from configuration
    const config = workspace.getConfiguration('pike');
    const pikeModulePath = config.get<string[]>('pikeModulePath', ['pike']);
    let updatedPath: string[] = [];

    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
        const f = workspace.workspaceFolders[0]!.uri.fsPath;
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
        await client.stop();
        console.log('Pike Language Extension deactivated');
    } catch (err) {
        console.error('Error stopping Pike Language Client:', err);
    }
}
