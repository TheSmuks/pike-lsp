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
import { ExtensionContext, ConfigurationTarget, commands, workspace, window } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;
let serverOptions: ServerOptions | null = null;

export async function activate(context: ExtensionContext): Promise<void> {
    console.log('Pike Language Extension is activating...');

    let disposable = commands.registerCommand('pike-module-path.add', async (e) => {
        const rv = await addModulePathSetting(e.fsPath);

        if (rv)
            window.showInformationMessage('Folder has been added to the module path');
        else
            window.showInformationMessage('Folder was already on the module path');
    });

    context.subscriptions.push(disposable);

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
        window.showWarningMessage(
            'Pike LSP server not found. Syntax highlighting will work but no IntelliSense.'
        );
        return;
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
                event.affectsConfiguration('pike.pikePath')
            ) {
                await restartClient(false);
            }
        })
    );

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

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'pike' },
        ],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.{pike,pmod}'),
        },
        initializationOptions: {
            pikePath,
            env: { 'PIKE_MODULE_PATH': expandedPaths.join(":") },
        },
        outputChannelName: 'Pike Language Server',
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
        await client.stop();
        console.log('Pike Language Extension deactivated');
    } catch (err) {
        console.error('Error stopping Pike Language Client:', err);
    }
}
