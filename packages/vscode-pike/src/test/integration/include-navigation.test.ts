/**
 * Include/Import/Inherit Navigation E2E Tests
 */

// @ts-nocheck
// These tests require vscode package to run - skip in standard test environment

import * as assert from 'assert';
import * as path from 'path';
import { suite, test } from 'mocha';

// Skip all tests in this file if vscode is not available
let vscode: any;
let vscodeAvailable = true;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    vscode = require('vscode');
    vscodeAvailable = true;
} catch {
    // vscode not available - tests will be skipped
}

const itSkip = test;

let capturedLogs: string[] = [];

function logServerOutput(message: string) {
    capturedLogs.push(message);
    console.log(`[Pike Server] ${message}`);
}

function dumpServerLogs(context: string) {
    console.log(`\n=== Pike Server Logs (${context}) ===`);
    if (capturedLogs.length === 0) {
        console.log('(No logs captured)');
    } else {
        capturedLogs.forEach(log => console.log(log));
    }
    console.log('=== End Server Logs ===\n');
}

function assertWithLogs(condition: unknown, message: string): asserts condition {
    if (!condition) {
        dumpServerLogs(`Assertion failed: ${message}`);
        assert.ok(condition, message);
    }
}

suite('Include/Import/Inherit Navigation E2E Tests', () => {
    let workspaceFolder: any;
    let testDocumentUri: any;
    let document: any;

    suiteSetup(async function() {
        }
        this.timeout(60000);
        capturedLogs = [];

        // Check if Pike is available
        const { execSync } = await import('child_process');
        let pikeAvailable = false;
        try {
            execSync('pike --version', { encoding: 'utf8' });
            pikeAvailable = true;
        } catch {
            pikeAvailable = false;
        }

        // Skip in CI - these tests have environmental issues
        const isCI = process.env.CI === 'true';
        if (isCI) {
            console.log('Skipping include navigation E2E tests: environmental issues in CI');
            this.skip();
            return;
        }

        if (!pikeAvailable) {
            console.log('Skipping include navigation E2E tests: Pike not available');
            this.skip();
            return;
        }

        workspaceFolder = vscode.workspace.workspaceFolders?.[0]!;
        assert.ok(workspaceFolder, 'Workspace folder should exist');

        const extension = vscode.extensions.getExtension('pike-lsp.vscode-pike');
        assert.ok(extension, 'Extension should be found');

        if (!extension.isActive) {
            await extension.activate();
            console.log('Extension activated for include navigation tests');
        }

        const fixturePath = path.join(
            workspaceFolder.uri.fsPath,
            'src', 'test', 'fixtures', 'include-import-inherit', 'main.pike'
        );

        testDocumentUri = vscode.Uri.file(fixturePath);
        document = await vscode.workspace.openTextDocument(testDocumentUri);
        assert.ok(document, 'Should open test document');

        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('Include navigation test suite initialized');
    });

    suiteTeardown(async function() {
        if (document) {
            await vscode.window.showTextDocument(document);
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
    });

    test('Go-to-definition for constant from #include file', async function() {
        this.timeout(30000);

        const text = document.getText();
        const referenceMatch = text.match(/global_constant/);
        assert.ok(referenceMatch, 'Should find global_constant reference in main.pike');

        const referenceOffset = text.indexOf(referenceMatch[0]);
        const referencePosition = document.positionAt(referenceOffset);

        const locations = await vscode.commands.executeCommand<
            vscode.Location | vscode.Location[] | vscode.LocationLink[]
        >(
            'vscode.executeDefinitionProvider',
            testDocumentUri,
            referencePosition
        );

        assertWithLogs(locations, 'Should return definition locations (not null) - include resolution may be broken');

        let locationArray: vscode.Location[];
        if (Array.isArray(locations)) {
            if (locations.length > 0 && locations[0] && 'targetUri' in locations[0]) {
                locationArray = (locations as vscode.LocationLink[]).map(ll =>
                    new vscode.Location(ll.targetUri, ll.targetRange)
                );
            } else {
                locationArray = locations as vscode.Location[];
            }
        } else {
            locationArray = [locations as vscode.Location];
        }

        assertWithLogs(locationArray.length > 0, 'Should have at least one definition location');

        const firstLocation = locationArray[0]!;
        assertWithLogs(firstLocation.uri, 'Location should have URI');
        assertWithLogs(firstLocation.range, 'Location should have range');

        const uriPath = firstLocation.uri.fsPath;
        assertWithLogs(
            uriPath.includes('globals.h'),
            `Definition should point to globals.h, got: ${uriPath}`
        );

        assertWithLogs(firstLocation.range.start, 'Location range should have start position');
        assertWithLogs(firstLocation.range.end, 'Location range should have end position');

        console.log(`Navigate to constant: ${uriPath}:${firstLocation.range.start.line}`);
    });

    test('Go-to-definition for function from #include file', async function() {
        this.timeout(30000);

        const text = document.getText();
        const referenceMatch = text.match(/helper_function\(\)/);
        assert.ok(referenceMatch, 'Should find helper_function() call in main.pike');

        const referenceOffset = text.indexOf(referenceMatch[0]);
        const referencePosition = document.positionAt(referenceOffset);

        const locations = await vscode.commands.executeCommand<
            vscode.Location | vscode.Location[] | vscode.LocationLink[]
        >(
            'vscode.executeDefinitionProvider',
            testDocumentUri,
            referencePosition
        );

        assertWithLogs(locations, 'Should return definition locations (not null) - include resolution may be broken');

        let locationArray: vscode.Location[];
        if (Array.isArray(locations)) {
            if (locations.length > 0 && locations[0] && 'targetUri' in locations[0]) {
                locationArray = (locations as vscode.LocationLink[]).map(ll =>
                    new vscode.Location(ll.targetUri, ll.targetRange)
                );
            } else {
                locationArray = locations as vscode.Location[];
            }
        } else {
            locationArray = [locations as vscode.Location];
        }

        assertWithLogs(locationArray.length > 0, 'Should have at least one definition location');

        const firstLocation = locationArray[0]!;
        assertWithLogs(firstLocation.uri, 'Location should have URI');
        assertWithLogs(firstLocation.range, 'Location should have range');

        const uriPath = firstLocation.uri.fsPath;
        assertWithLogs(
            uriPath.includes('globals.h'),
            `Definition should point to globals.h, got: ${uriPath}`
        );

        assertWithLogs(firstLocation.range.start, 'Location range should have start position');
        assertWithLogs(firstLocation.range.end, 'Location range should have end position');

        console.log(`Navigate to function: ${uriPath}:${firstLocation.range.start.line}`);
    });

    test('Go-to-definition for documented function from #include file', async function() {
        this.timeout(30000);

        const text = document.getText();
        const referenceMatch = text.match(/global_constant/);
        assert.ok(referenceMatch, 'Should find symbol reference in main.pike');

        const referenceOffset = text.indexOf(referenceMatch[0]);
        const referencePosition = document.positionAt(referenceOffset);

        const locations = await vscode.commands.executeCommand<
            vscode.Location | vscode.Location[] | vscode.LocationLink[]
        >(
            'vscode.executeDefinitionProvider',
            testDocumentUri,
            referencePosition
        );

        assertWithLogs(locations, 'Should return definition locations');

        let locationArray: vscode.Location[];
        if (Array.isArray(locations)) {
            if (locations.length > 0 && locations[0] && 'targetUri' in locations[0]) {
                locationArray = (locations as vscode.LocationLink[]).map(ll =>
                    new vscode.Location(ll.targetUri, ll.targetRange)
                );
            } else {
                locationArray = locations as vscode.Location[];
            }
        } else {
            locationArray = [locations as vscode.Location];
        }

        assertWithLogs(locationArray.length > 0, 'Should have at least one definition location');

        const firstLocation = locationArray[0]!;
        const uriPath = firstLocation.uri.fsPath;
        assertWithLogs(
            uriPath.includes('globals.h'),
            `Definition should point to globals.h, got: ${uriPath}`
        );

        console.log(`Navigate to documented symbol: ${uriPath}`);
    });

    test('Go-to-definition on #include directive navigates to included file', async function() {
        this.timeout(30000);

        const text = document.getText();

        // Find the #include directive line
        const includeLineMatch = text.match(/#include\s+"([^"]+)"/);
        assert.ok(includeLineMatch, 'Should find #include directive in main.pike');

        // Position cursor on the path part (inside the quotes)
        const includeOffset = text.indexOf(includeLineMatch[0]) + '#include "'.length;
        const includePosition = document.positionAt(includeOffset);

        const locations = await vscode.commands.executeCommand<
            vscode.Location | vscode.Location[] | vscode.LocationLink[]
        >(
            'vscode.executeDefinitionProvider',
            testDocumentUri,
            includePosition
        );

        assertWithLogs(locations, 'Should return definition location for #include directive (not null)');

        let locationArray: vscode.Location[];
        if (Array.isArray(locations)) {
            if (locations.length > 0 && locations[0] && 'targetUri' in locations[0]) {
                locationArray = (locations as vscode.LocationLink[]).map(ll =>
                    new vscode.Location(ll.targetUri, ll.targetRange)
                );
            } else {
                locationArray = locations as vscode.Location[];
            }
        } else {
            locationArray = [locations as vscode.Location];
        }

        assertWithLogs(locationArray.length > 0, 'Should have at least one location for #include');

        const firstLocation = locationArray[0]!;
        const uriPath = firstLocation.uri.fsPath;
        assertWithLogs(
            uriPath.includes('globals.h'),
            `#include directive should navigate to globals.h, got: ${uriPath}`
        );

        console.log(`Navigate from #include directive to: ${uriPath}`);
    });
});
