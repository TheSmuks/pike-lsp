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
import { ExtensionContext, workspace, window } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
    console.log('Pike Language Extension is activating...');

    // Try multiple possible server locations
    const possiblePaths = [
        // Development: sibling package
        context.asAbsolutePath(path.join('..', 'pike-lsp-server', 'dist', 'server.js')),
        // Development: from workspace root
        path.join(context.extensionPath, '..', 'pike-lsp-server', 'dist', 'server.js'),
        // Production: bundled server
        context.asAbsolutePath(path.join('server', 'server.js')),
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
    const serverOptions: ServerOptions = {
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

    // Get Pike path from configuration
    const config = workspace.getConfiguration('pike');
    const pikePath = config.get<string>('pikePath', 'pike');

    // Client options
    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'pike' },
        ],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.{pike,pmod}'),
        },
        initializationOptions: {
            pikePath,
        },
        outputChannelName: 'Pike Language Server',
    };

    // Create the language client
    client = new LanguageClient(
        'pikeLsp',
        'Pike Language Server',
        serverOptions,
        clientOptions
    );

    // Start the client (also starts the server)
    try {
        await client.start();
        console.log('Pike Language Extension activated successfully');
        window.showInformationMessage('Pike Language Server started');
    } catch (err) {
        console.error('Failed to start Pike Language Client:', err);
        window.showErrorMessage(`Failed to start Pike language server: ${err}`);
    }
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
