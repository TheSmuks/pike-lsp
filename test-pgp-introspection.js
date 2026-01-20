#!/usr/bin/env node

/**
 * Test PGP.pmod introspection to verify the fix for timeout crash
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PGP_FILE = '/home/smuks/Antigravity/PikeLSP/Pike-v8.0.1116/lib/modules/Crypto.pmod/PGP.pmod';
const SERVER_PATH = path.join(__dirname, 'packages/pike-lsp-server/dist/server.js');

async function testPGPIntrospection() {
    console.log('==========================================');
    console.log('   PGP.pmod Introspection Test');
    console.log('==========================================');
    console.log(`PGP file: ${PGP_FILE}`);
    console.log();

    // Read the PGP.pmod file
    if (!fs.existsSync(PGP_FILE)) {
        console.error(`✗ FAIL: PGP.pmod file not found: ${PGP_FILE}`);
        process.exit(1);
    }

    const pgpCode = fs.readFileSync(PGP_FILE, 'utf8');
    console.log(`✓ PGP.pmod file loaded (${pgpCode.length} chars)`);

    // Check for #require directive
    if (pgpCode.includes('#require')) {
        console.log('✓ File contains #require directive (as expected)');
    }

    // Start the LSP server
    console.log();
    console.log('Starting LSP server...');
    const server = spawn('node', [SERVER_PATH, '--stdio'], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    let serverOutput = '';
    let serverErrors = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
        console.error('✗ FAIL: Test timed out after 60 seconds');
        timedOut = true;
        server.kill();
    }, 60000);

    server.stdout.on('data', (data) => {
        const output = data.toString();
        serverOutput += output;
        // Print each line for debugging
        output.split('\n').forEach(line => {
            if (line.trim()) console.log('[SERVER]', line);
        });
    });

    server.stderr.on('data', (data) => {
        serverErrors += data.toString();
        console.error('[STDERR]', data.toString());
    });

    server.on('close', (code) => {
        clearTimeout(timeout);
        if (timedOut) {
            process.exit(1);
        }
        console.log(`Server exited with code ${code}`);
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Send initialize request
    const initializeRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            processId: process.pid,
            rootUri: null,
            capabilities: {}
        }
    };

    const initJson = JSON.stringify(initializeRequest);
    console.log('Sending initialize request...');
    server.stdin.write(`Content-Length: ${initJson.length}\r\n\r\n${initJson}`);

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Send introspect request for PGP.pmod
    // Use the bridge's introspect method directly
    const introspectRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'pike/introspect',
        params: {
            code: pgpCode,
            filename: PGP_FILE
        }
    };

    console.log('Sending introspect request for PGP.pmod...');
    const introspectJson = JSON.stringify(introspectRequest);
    server.stdin.write(`Content-Length: ${introspectJson.length}\r\n\r\n${introspectJson}`);

    // Wait for response (with timeout protection)
    console.log('Waiting for response (60 second timeout)...');
    let startTime = Date.now();

    // Wait up to 60 seconds for response
    const responseTimeout = 60000;
    let checkCount = 0;
    while (Date.now() - startTime < responseTimeout) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        checkCount++;

        // Check for any response with id:2 or diagnostics (textDocument/publishDiagnostics)
        if (serverOutput.includes('"id":2') || serverOutput.includes('"id": 2') ||
            serverOutput.includes('publishDiagnostics') || serverOutput.includes('diagnostics')) {
            console.log();
            console.log('========================================');
            console.log('         Test Results');
            console.log('========================================');
            console.log(`Response received after ${Date.now() - startTime}ms`);

            // Check for parser_only flag (indicates the fix is working)
            if (serverOutput.includes('parser_only')) {
                console.log('✓ PASS: Used parser-only extraction (fix working)');
            } else if (serverOutput.includes('success":1') || serverOutput.includes('success": 1')) {
                console.log('✓ PASS: Introspection succeeded');
            } else if (serverOutput.includes('publishDiagnostics')) {
                console.log('✓ PASS: Received diagnostics (no timeout)');
            } else if (serverOutput.includes('error')) {
                console.log('⚠ WARNING: Got error response (but no timeout)');
            } else {
                console.log('⚠ WARNING: Unexpected response format');
            }

            // Check for timeout errors
            if (serverErrors.includes('timeout') || serverErrors.includes('timed out')) {
                console.log('✗ FAIL: Timeout error detected');
                server.kill();
                process.exit(1);
            }

            server.kill();
            process.exit(0);
        }

        // Show progress every 10 seconds
        if (checkCount % 10 === 0) {
            console.log(`  Still waiting... (${checkCount}s)`);
        }
    }

    // If we get here, we timed out
    console.log();
    console.log('✗ FAIL: No response received within 60 seconds');
    console.log('Server output:');
    console.log(serverOutput);
    server.kill();
    process.exit(1);
}

testPGPIntrospection().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
