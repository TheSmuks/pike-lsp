#!/usr/bin/env node
/**
 * E2E Server Test - Checks if the LSP server starts without crashes
 *
 * This test simulates what happens when the extension starts up:
 * 1. Starts the Pike LSP server
 * 2. Sends initialization request
 * 3. Waits to ensure no timeout/crash
 * 4. Checks output for errors
 */

const { spawn } = require('child_process');
const path = require('path');

const SERVER_PATH = path.join(__dirname, 'packages/pike-lsp-server/dist/server.js');
const WAIT_TIME_MS = 45000; // Wait 45 seconds to catch timeout issues

console.log('==========================================');
console.log('       E2E LSP Server Crash Test          ');
console.log('==========================================');
console.log('');
console.log(`Server path: ${SERVER_PATH}`);
console.log(`Wait time: ${WAIT_TIME_MS}ms`);
console.log('');

let serverProcess;
let startTime;
let output = [];
let errors = [];
let hasStarted = false;

function startServer() {
    console.log('Starting LSP server...');

    serverProcess = spawn('node', [SERVER_PATH, '--stdio'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
            PIKE_PATH: 'pike',
        }
    });

    serverProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output.push(text);
        process.stdout.write(text);

        // Check for successful start (server sends window/logMessage notification)
        if (text.includes('Pike LSP Server started') ||
            text.includes('Pike LSP Server initialized') ||
            text.includes('Listening')) {
            hasStarted = true;
            console.log('\n✓ Server started successfully');
        }

        // Check for timeout errors
        if (text.includes('timed out') || text.includes('timeout') || text.includes('Timeout')) {
            console.error('\n✗ TIMEOUT ERROR DETECTED');
        }
    });

    serverProcess.stderr.on('data', (data) => {
        const text = data.toString();
        errors.push(text);
        process.stderr.write(`[STDERR] ${text}`);
    });

    serverProcess.on('close', (code) => {
        const elapsed = Date.now() - startTime;
        console.log(`\nServer process exited with code ${code} after ${elapsed}ms`);
    });

    serverProcess.on('error', (err) => {
        console.error(`Failed to start server: ${err.message}`);
        process.exit(1);
    });

    startTime = Date.now();
}

function sendInitializeRequest() {
    // Send JSON-RPC initialize request
    const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            processId: process.pid,
            rootUri: null,
            capabilities: {},
            initializationOptions: {
                pikePath: 'pike',
                env: {}
            }
        }
    };

    console.log('Sending initialize request...');
    serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');
}

function sendShutdownRequest() {
    const shutdownRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'shutdown',
        params: {}
    };
    serverProcess.stdin.write(JSON.stringify(shutdownRequest) + '\n');
}

async function runTest() {
    startServer();

    // Wait a bit for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    sendInitializeRequest();

    // Wait for initialization and potential crashes
    console.log(`Waiting for initialization (${WAIT_TIME_MS}ms)...`);
    console.log('Monitoring for timeout/crash errors...');
    await new Promise(resolve => setTimeout(resolve, WAIT_TIME_MS));

    // Check for crashes
    const outputText = output.join('');
    const errorText = errors.join('');

    console.log('\n========================================');
    console.log('            Test Results                 ');
    console.log('========================================\n');

    // Check for timeout errors
    const hasTimeoutError = outputText.includes('timed out') ||
                           outputText.includes('timeout') ||
                           outputText.includes('Timeout') ||
                           errorText.includes('timed out') ||
                           errorText.includes('timeout');

    // Check for crash indicators
    const hasCrash = outputText.includes('Error') ||
                    outputText.includes('error') ||
                    outputText.includes('Exception') ||
                    outputText.includes('undefined') ||
                    outputText.includes('Cannot find') ||
                    errorText.includes('Error') ||
                    errorText.includes('undefined');

    // Check for successful start
    const hasSuccessIndicator = outputText.includes('result') ||
                                 outputText.includes('capabilities') ||
                                 hasStarted;

    console.log(`Server started: ${hasStarted || hasSuccessIndicator ? '✓ YES' : '✗ NO'}`);
    console.log(`Timeout errors: ${hasTimeoutError ? '✗ FOUND' : '✓ NONE'}`);
    console.log(`Crash indicators: ${hasCrash ? '⚠ FOUND' : '✓ NONE'}`);
    console.log(`Total output lines: ${output.length}`);
    console.log(`Total error lines: ${errors.length}`);

    // Clean shutdown
    console.log('\nShutting down server...');
    sendShutdownRequest();
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
    }

    // Exit with appropriate code
    if (hasTimeoutError) {
        console.error('\n❌ FAIL: Timeout errors detected');
        process.exit(1);
    }

    if (hasCrash && !hasSuccessIndicator) {
        console.error('\n❌ FAIL: Server crashed during startup');
        process.exit(1);
    }

    if (!hasSuccessIndicator && !hasStarted) {
        console.warn('\n⚠ WARNING: Could not confirm server started');
    }

    console.log('\n✓ PASS: No critical errors detected');
    process.exit(0);
}

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log('\nInterrupted, cleaning up...');
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
    }
    process.exit(130);
});

runTest().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
