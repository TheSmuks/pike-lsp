"use strict";
/**
 * Pike Language Extension for VSCode
 *
 * This extension provides Pike language support including:
 * - Syntax highlighting via TextMate grammar
 * - Real-time diagnostics (syntax errors as red squiggles)
 * - Document symbols (outline view)
 * - LSP integration for IntelliSense
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.activateForTesting = activateForTesting;
exports.addModulePathSetting = addModulePathSetting;
exports.deactivate = deactivate;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
let client;
let serverOptions = null;
let outputChannel;
// Test mode flag - can be set via environment variable
const TEST_MODE = process.env.PIKE_LSP_TEST_MODE === 'true';
/**
 * Internal activation implementation
 */
async function activateInternal(context, testOutputChannel) {
    console.log('Pike Language Extension is activating...');
    // Use provided test output channel or create a real one
    outputChannel = testOutputChannel || vscode_1.window.createOutputChannel('Pike Language Server');
    let disposable = vscode_1.commands.registerCommand('pike-module-path.add', async (e) => {
        const rv = await addModulePathSetting(e.fsPath);
        if (rv)
            vscode_1.window.showInformationMessage('Folder has been added to the module path');
        else
            vscode_1.window.showInformationMessage('Folder was already on the module path');
    });
    context.subscriptions.push(disposable);
    const showReferencesDisposable = vscode_1.commands.registerCommand('pike.showReferences', async (arg) => {
        let uri;
        let position;
        if (Array.isArray(arg)) {
            [uri, position] = arg;
        }
        else if (arg && typeof arg === 'object') {
            const payload = arg;
            uri = payload.uri;
            position = payload.position;
        }
        if (!uri || !position) {
            return;
        }
        const refUri = vscode_1.Uri.parse(uri);
        const refPosition = new vscode_1.Position(position.line, position.character);
        await vscode_1.commands.executeCommand('editor.action.findReferences', refUri, refPosition, {
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
    let serverModule = null;
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
        vscode_1.window.showWarningMessage('Pike LSP server not found. Syntax highlighting will work but no IntelliSense.');
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
            transport: node_1.TransportKind.ipc,
        },
        debug: {
            module: serverModule,
            transport: node_1.TransportKind.ipc,
            options: {
                execArgv: ['--nolazy', '--inspect=6009'],
            },
        },
    };
    await restartClient(true);
    context.subscriptions.push(vscode_1.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration('pike.pikeModulePath') ||
            event.affectsConfiguration('pike.pikeIncludePath') ||
            event.affectsConfiguration('pike.pikePath')) {
            await restartClient(false);
        }
    }));
    // Return the extension API
    return {
        getClient: () => client,
        getOutputChannel: () => outputChannel,
        getLogs: () => {
            // If using MockOutputChannel, get logs from it
            if ('getLogs' in outputChannel && typeof outputChannel.getLogs === 'function') {
                return outputChannel.getLogs();
            }
            return [];
        },
    };
}
/**
 * Public activate function for VSCode
 */
async function activate(context) {
    await activateInternal(context);
}
/**
 * Test helper: Activate extension with mock output channel
 *
 * This allows tests to capture all logs from the extension and LSP server.
 */
async function activateForTesting(context, mockOutputChannel) {
    return activateInternal(context, mockOutputChannel);
}
function getExpandedModulePaths() {
    const config = vscode_1.workspace.getConfiguration('pike');
    const pikeModulePath = config.get('pikeModulePath', 'pike');
    let expandedPaths = [];
    if (vscode_1.workspace.workspaceFolders !== undefined) {
        let f = vscode_1.workspace.workspaceFolders[0].uri.fsPath;
        for (const p of pikeModulePath) {
            expandedPaths.push(p.replace("${workspaceFolder}", f));
        }
    }
    else {
        expandedPaths = pikeModulePath;
    }
    console.log('Pike module path: ' + JSON.stringify(pikeModulePath));
    return expandedPaths;
}
function getExpandedIncludePaths() {
    const config = vscode_1.workspace.getConfiguration('pike');
    const pikeIncludePath = config.get('pikeIncludePath', []);
    let expandedPaths = [];
    if (vscode_1.workspace.workspaceFolders !== undefined) {
        const f = vscode_1.workspace.workspaceFolders[0].uri.fsPath;
        for (const p of pikeIncludePath) {
            expandedPaths.push(p.replace("${workspaceFolder}", f));
        }
    }
    else {
        expandedPaths = pikeIncludePath;
    }
    console.log('Pike include path: ' + JSON.stringify(pikeIncludePath));
    return expandedPaths;
}
async function restartClient(showMessage) {
    if (!serverOptions) {
        return;
    }
    if (client) {
        try {
            await client.stop();
        }
        catch (err) {
            console.error('Error stopping Pike Language Client:', err);
        }
    }
    const config = vscode_1.workspace.getConfiguration('pike');
    const pikePath = config.get('pikePath', 'pike');
    const expandedPaths = getExpandedModulePaths();
    const expandedIncludePaths = getExpandedIncludePaths();
    const clientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'pike' },
        ],
        synchronize: {
            fileEvents: vscode_1.workspace.createFileSystemWatcher('**/*.{pike,pmod}'),
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
    client = new node_1.LanguageClient('pikeLsp', 'Pike Language Server', serverOptions, clientOptions);
    try {
        await client.start();
        console.log('Pike Language Extension activated successfully!');
        if (showMessage) {
            vscode_1.window.showInformationMessage('Pike Language Server started');
        }
    }
    catch (err) {
        console.error('Failed to start Pike Language Client:', err);
        vscode_1.window.showErrorMessage(`Failed to start Pike language server: ${err}`);
    }
}
async function addModulePathSetting(modulePath) {
    // Get Pike path from configuration
    const config = vscode_1.workspace.getConfiguration('pike');
    const pikeModulePath = config.get('pikeModulePath', 'pike');
    let updatedPath = [];
    if (vscode_1.workspace.workspaceFolders !== undefined) {
        let f = vscode_1.workspace.workspaceFolders[0].uri.fsPath;
        modulePath = modulePath.replace(f, "${workspaceFolder}");
    }
    if (!pikeModulePath.includes(modulePath)) {
        updatedPath = pikeModulePath.slice();
        updatedPath.push(modulePath);
        await config.update('pikeModulePath', updatedPath, vscode_1.ConfigurationTarget.Workspace);
        return true;
    }
    return false;
}
async function deactivate() {
    if (!client) {
        return;
    }
    try {
        await client.stop();
        console.log('Pike Language Extension deactivated');
    }
    catch (err) {
        console.error('Error stopping Pike Language Client:', err);
    }
}
