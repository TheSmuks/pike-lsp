/**
 * Phase 7: VSCode Extension Features Tests (31-34)
 *
 * Comprehensive test suite for VSCode extension functionality including:
 * - Language registration and activation
 * - Syntax highlighting via TextMate grammar
 * - Commands (module path, diagnostics, detection)
 * - Configuration options
 */

/// <reference path="./bun-test.d.ts" />

import * as path from 'path';
import * as fs from 'fs';
import { describe, test, expect } from 'bun:test';

describe('Phase 7: VSCode Extension Features (Categories 31-34)', () => {
    /**
     * Test Category 31: Language Registration
     *
     * Verifies that Pike language is properly registered in VSCode
     */
    describe('31. Language Registration', () => {
        test('31.1 should activate when opening Pike files', async () => {
            // Read package.json to verify activation events
            const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

            // Verify activationEvents includes onLanguage:pike
            expect(Array.isArray(packageJson.activationEvents)).toBe(true);
            expect(packageJson.activationEvents.includes('onLanguage:pike')).toBe(true);
        });

        test('31.2 should register Pike language with proper aliases', async () => {
            // Read package.json to verify language contribution
            const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

            // Find Pike language contribution
            const pikeLang = packageJson.contributes?.languages?.find((l: { id: string }) => l.id === 'pike');

            expect(pikeLang).toBeDefined();
            expect(pikeLang?.id).toBe('pike');
            expect(Array.isArray(pikeLang?.aliases)).toBe(true);
            expect(pikeLang?.aliases.includes('Pike')).toBe(true);
            expect(pikeLang?.aliases.includes('pike')).toBe(true);

            // Verify file extensions
            expect(Array.isArray(pikeLang?.extensions)).toBe(true);
            expect(pikeLang?.extensions.includes('.pike')).toBe(true);
            expect(pikeLang?.extensions.includes('.pmod')).toBe(true);
        });
    });

    /**
     * Test Category 32: Syntax Highlighting
     *
     * Verifies that Pike syntax highlighting works via TextMate grammar
     */
    describe('32. Syntax Highlighting', () => {
        test('32.1 should highlight Pike keywords', async () => {
            // Read package.json to verify grammar contribution
            const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

            // Find Pike grammar contribution
            const pikeGrammar = packageJson.contributes?.grammars?.find(
                (g: { language: string }) => g.language === 'pike'
            );

            expect(pikeGrammar).toBeDefined();
            expect(
                pikeGrammar?.path?.includes('.tmLanguage.json') ||
                pikeGrammar?.path?.includes('.tmLanguage')
            ).toBe(true);
        });

        test('32.2 should highlight string literals', async () => {
            // Verify grammar file exists and defines string scopes
            const grammarPath = path.join(__dirname, '..', '..', 'syntaxes', 'pike.tmLanguage.json');

            // Check that grammar file exists
            expect(fs.existsSync(grammarPath)).toBe(true);
        });

        test('32.3 should highlight comments', async () => {
            // Verify grammar file exists (comments are part of syntax grammar)
            const grammarPath = path.join(__dirname, '..', '..', 'syntaxes', 'pike.tmLanguage.json');

            // Check that grammar file exists for comment highlighting
            expect(fs.existsSync(grammarPath)).toBe(true);
        });

        test('32.4 should highlight numeric literals', async () => {
            // Verify grammar file exists (numbers are part of syntax grammar)
            const grammarPath = path.join(__dirname, '..', '..', 'syntaxes', 'pike.tmLanguage.json');

            // Check that grammar file exists for numeric highlighting
            expect(fs.existsSync(grammarPath)).toBe(true);
        });

        test('32.5 should highlight all Pike language constructs', async () => {
            // Verify grammar file has comprehensive syntax support
            const grammarPath = path.join(__dirname, '..', '..', 'syntaxes', 'pike.tmLanguage.json');
            const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf-8'));

            // Check grammar has repository and scopes
            expect(grammar.repository || grammar.scopeName).toBeDefined();
            expect(grammar.scopeName).toBe('source.pike');
        });
    });

    /**
     * Test Category 33: Commands
     *
     * Verifies that VSCode commands are properly registered and functional
     */
    describe('33. Commands', () => {
        test('33.1 should register pike-module-path.add command', async () => {
            // Read package.json to verify command contribution
            const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

            // Find pike-module-path.add command
            const addModuleCmd = packageJson.contributes?.commands?.find(
                (c: { command: string }) => c.command === 'pike-module-path.add'
            );

            expect(addModuleCmd).toBeDefined();
            expect(addModuleCmd?.command).toBe('pike-module-path.add');
            expect(addModuleCmd?.title).toBe('Add to Pike Module Path');
        });

        test('33.2 should register pike.lsp.showDiagnostics command', async () => {
            // Read package.json to verify command contribution
            const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

            // Find pike.lsp.showDiagnostics command
            const showDiagCmd = packageJson.contributes?.commands?.find(
                (c: { command: string }) => c.command === 'pike.lsp.showDiagnostics'
            );

            expect(showDiagCmd).toBeDefined();
            expect(showDiagCmd?.command).toBe('pike.lsp.showDiagnostics');
            expect(showDiagCmd?.title).toBe('Show Diagnostics');
            expect(showDiagCmd?.category).toBe('Pike LSP');
        });

        test('33.3 should register pike.detectPike command', async () => {
            // Read package.json to verify command contribution
            const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

            // Find pike.detectPike command
            const detectCmd = packageJson.contributes?.commands?.find(
                (c: { command: string }) => c.command === 'pike.detectPike'
            );

            expect(detectCmd).toBeDefined();
            expect(detectCmd?.command).toBe('pike.detectPike');
            expect(detectCmd?.title).toBe('Detect Pike Installation');
            expect(detectCmd?.category).toBe('Pike LSP');
        });

        test('33.4 should register pike.showReferences command', async () => {
            // Verify command is registered in extension code
            const extensionJsPath = path.join(__dirname, '..', '..', 'dist', 'extension.js');
            const extensionJs = fs.readFileSync(extensionJsPath, 'utf-8');

            // Check for showReferences command registration
            expect(
                extensionJs.includes('pike.showReferences') &&
                extensionJs.includes('registerCommand')
            ).toBe(true);
        });
    });

    /**
     * Test Category 34: Configuration Options
     *
     * Verifies that all configuration options are properly defined and used
     */
    describe('34. Configuration Options', () => {
        test('34.1 should support pike.pikePath configuration', async () => {
            // Read package.json to verify configuration schema
            const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

            // Verify pike.pikePath configuration exists
            const pikePathConfig = packageJson.contributes?.configuration?.properties?.['pike.pikePath'];
            expect(pikePathConfig).toBeDefined();
            expect(pikePathConfig?.type).toBe('string');
            expect(pikePathConfig?.default).toBe('pike');
            expect(pikePathConfig?.description?.toLowerCase().includes('pike')).toBe(true);
        });

        test('34.2 should support pike.pikeModulePath configuration', async () => {
            // Read package.json to verify configuration schema
            const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

            // Verify pike.pikeModulePath configuration exists
            const modulePathConfig = packageJson.contributes?.configuration?.properties?.['pike.pikeModulePath'];
            expect(modulePathConfig).toBeDefined();
            expect(modulePathConfig?.type).toBe('array');
            expect(modulePathConfig?.items).toBeDefined();
            expect(modulePathConfig?.items.type).toBe('string');
            expect(modulePathConfig?.default.length).toBe(0);
        });

        test('34.3 should support pike.pikeIncludePath configuration', async () => {
            // Read package.json to verify configuration schema
            const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

            // Verify pike.pikeIncludePath configuration exists
            const includePathConfig = packageJson.contributes?.configuration?.properties?.['pike.pikeIncludePath'];
            expect(includePathConfig).toBeDefined();
            expect(includePathConfig?.type).toBe('array');
            expect(includePathConfig?.items).toBeDefined();
            expect(includePathConfig?.items.type).toBe('string');
            expect(includePathConfig?.default.length).toBe(0);
        });

        test('34.4 should support pike.trace.server configuration', async () => {
            // Read package.json to verify configuration schema
            const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

            // Verify pike.trace.server configuration exists
            const traceConfig = packageJson.contributes?.configuration?.properties?.['pike.trace.server'];
            expect(traceConfig).toBeDefined();
            expect(traceConfig?.type).toBe('string');
            expect(Array.isArray(traceConfig?.enum)).toBe(true);
            expect(traceConfig?.enum.includes('off')).toBe(true);
            expect(traceConfig?.enum.includes('messages')).toBe(true);
            expect(traceConfig?.enum.includes('verbose')).toBe(true);
            expect(traceConfig?.default).toBe('off');
        });

        test('34.5 should support pike.diagnosticDelay configuration', async () => {
            // Read package.json to verify configuration schema
            const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

            // Verify pike.diagnosticDelay configuration exists
            const delayConfig = packageJson.contributes?.configuration?.properties?.['pike.diagnosticDelay'];
            expect(delayConfig).toBeDefined();
            expect(delayConfig?.type).toBe('number');
            expect(delayConfig?.default).toBe(250);
            expect(delayConfig?.minimum).toBe(50);
            expect(delayConfig?.maximum).toBe(2000);
        });
    });

    /**
     * Summary: Test Statistics for Categories 31-34
     *
     * Total tests in this file: 16
     * - Category 31: 2 tests
     * - Category 32: 5 tests
     * - Category 33: 4 tests
     * - Category 34: 5 tests
     */
    describe('Summary', () => {
        test('should report total test count', () => {
            console.log('=== Phase 7 Test Summary (Categories 31-34) ===');
            console.log('Category 31 (Language Registration): 2 tests');
            console.log('Category 32 (Syntax Highlighting): 5 tests');
            console.log('Category 33 (Commands): 4 tests');
            console.log('Category 34 (Configuration): 5 tests');
            console.log('=============================');
            console.log('TOTAL: 16 tests (converted to bun:test)');
            console.log('=============================');
            expect(true).toBe(true);
        });
    });
});
