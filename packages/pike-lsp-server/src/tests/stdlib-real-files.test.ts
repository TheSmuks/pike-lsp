/**
 * Pike Stdlib Real Files E2E Tests
 *
 * End-to-end tests that parse REAL Pike standard library files.
 * These tests verify the LSP works correctly with actual Pike stdlib code.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { PikeBridge } from '@pike-lsp/pike-bridge';
import * as fs from 'fs';
import * as path from 'path';

const PIKE_STDLIB_PATH = '/usr/local/pike/8.0.1116/lib/modules';

/**
 * Check if Pike stdlib is available in this environment
 */
function isPikeStdlibAvailable(): boolean {
    return fs.existsSync(PIKE_STDLIB_PATH);
}

/**
 * Read Pike module source, handling both .pmod files and .pmod directories.
 * Handles dotted module names like "Parser.Pike" -> "Parser.pmod/Pike.pmod"
 * Returns null if the module cannot be read as a single Pike source file.
 */
function readPikeModule(moduleName: string): string | null {
    // Handle dotted module names like "Parser.Pike" -> try Parser.pmod/Pike.pmod
    if (moduleName.includes('.')) {
        const parts = moduleName.split('.');
        const dirPath = path.join(PIKE_STDLIB_PATH, parts[0] + '.pmod');
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
            const filePath = path.join(dirPath, parts.slice(1).join('.') + '.pmod');
            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath, 'utf-8');
            }
        }
        return null;
    }

    const filePath = path.join(PIKE_STDLIB_PATH, moduleName + '.pmod');
    if (!fs.existsSync(filePath)) {
        return null;
    }

    const stats = fs.statSync(filePath);

    if (stats.isFile()) {
        return fs.readFileSync(filePath, 'utf-8');
    }

    // It's a directory - try to find module.pmod inside
    const modulePmodPath = path.join(filePath, 'module.pmod');
    if (fs.existsSync(modulePmodPath)) {
        return fs.readFileSync(modulePmodPath, 'utf-8');
    }

    return null;
}

describe('Pike Stdlib Real Files E2E', () => {
    let bridge: PikeBridge;

    beforeAll(async () => {
        // Skip all tests if Pike stdlib is not available (e.g., in CI without Pike)
        if (!isPikeStdlibAvailable()) {
            return;
        }
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    afterAll(async () => {
        if (bridge) {
            await bridge.stop();
        }
    });

    it('should analyze Array.pmod successfully', async () => {
        const code = readPikeModule('Array');
        if (code === null) {
            // Module not available in this environment
            return;
        }

        const result = await bridge.parse(code, '/tmp/Array.pmod');
        expect(result.symbols).toBeDefined();
        // Real stdlib files should parse without errors
        const errors = result.diagnostics.filter(d => d.severity === 'error');
        expect(errors.length).toBe(0);
    });

    it('should analyze Stdio.pmod successfully', async () => {
        const code = readPikeModule('Stdio');
        if (code === null) {
            return;
        }

        const result = await bridge.parse(code, '/tmp/Stdio.pmod');
        expect(result.symbols).toBeDefined();
        const errors = result.diagnostics.filter(d => d.severity === 'error');
        expect(errors.length).toBe(0);
    });

    it('should analyze String.pmod successfully', async () => {
        const code = readPikeModule('String');
        if (code === null) {
            return;
        }

        const result = await bridge.parse(code, '/tmp/String.pmod');
        expect(result.symbols).toBeDefined();
        const errors = result.diagnostics.filter(d => d.severity === 'error');
        expect(errors.length).toBe(0);
    });

    it('should analyze Parser.Pike successfully', async () => {
        const code = readPikeModule('Parser.Pike');
        if (code === null) {
            // Try Parser.pmod/Pike.pmod
            const parserDir = path.join(PIKE_STDLIB_PATH, 'Parser.pmod');
            if (!fs.existsSync(parserDir)) {
                return;
            }
            const pikeFile = path.join(parserDir, 'Pike.pmod');
            if (!fs.existsSync(pikeFile)) {
                return;
            }
            const pikeCode = fs.readFileSync(pikeFile, 'utf-8');
            const result = await bridge.parse(pikeCode, pikeFile);
            expect(result.symbols).toBeDefined();
            const errors = result.diagnostics.filter(d => d.severity === 'error');
            expect(errors.length).toBe(0);
            return;
        }

        const result = await bridge.parse(code, '/tmp/Parser.Pike.pmod');
        expect(result.symbols).toBeDefined();
        const errors = result.diagnostics.filter(d => d.severity === 'error');
        expect(errors.length).toBe(0);
    });

    it('should analyze Concurrent.pmod successfully', async () => {
        const code = readPikeModule('Concurrent');
        if (code === null) {
            return;
        }

        const result = await bridge.parse(code, '/tmp/Concurrent.pmod');
        expect(result.symbols).toBeDefined();
        const errors = result.diagnostics.filter(d => d.severity === 'error');
        expect(errors.length).toBe(0);
    });

    it('should extract symbols from Calendar.pmod', async () => {
        const code = readPikeModule('Calendar');
        if (code === null) {
            return;
        }

        const result = await bridge.parse(code, '/tmp/Calendar.pmod');
        expect(result.symbols).toBeDefined();
        // Should extract some symbols (classes, functions, constants)
        expect(result.symbols.length).toBeGreaterThan(0);
    });
});
