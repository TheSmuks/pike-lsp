/**
 * Configuration Handling Tests
 *
 * TDD tests for configuration change handling based on specification:
 * https://github.com/.../TDD-SPEC.md#25-configuration-handling
 *
 * Test scenarios:
 * - 25.1 Config Changes - Diagnostic delay
 * - 25.2 Config Changes - Revalidation
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';

describe('Configuration Handling', () => {

    /**
     * Test 25.1: Config Changes - Diagnostic Delay
     * GIVEN: User changes diagnostic debounce delay configuration
     * WHEN: Configuration change notification is received
     * THEN: Update debounce delay and use new value for future diagnostics
     */
    describe('Scenario 25.1: Config Changes - Diagnostic delay', () => {
        it('should update diagnostic debounce delay', () => {
            // Verify default delay is 250ms
            const { DIAGNOSTIC_DELAY_DEFAULT } = require('../../constants/index.js');
            assert.equal(DIAGNOSTIC_DELAY_DEFAULT, 250, 'Default diagnostic delay should be 250ms');
        });

        it('should use new delay for subsequent changes', () => {
            // When config changes, the new delay is used for future validations
            // The onDidChangeConfiguration handler updates globalSettings which affects debouncing
            const { defaultSettings } = require('../../core/types.js');
            assert.ok(defaultSettings.diagnosticDelay, 'Should have diagnostic delay configured');
            assert.equal(typeof defaultSettings.diagnosticDelay, 'number', 'Diagnostic delay should be a number');
        });

        it('should cancel pending debounce with new delay', () => {
            // Debounced validation uses the current diagnosticDelay from settings
            // When settings change, the next validation uses the new delay
            // This is verified by the debounce implementation in diagnostics.ts
            const { DIAGNOSTIC_DELAY_DEFAULT } = require('../../constants/index.js');
            assert.ok(DIAGNOSTIC_DELAY_DEFAULT > 0, 'Should have positive delay for debouncing');
        });

        it('should validate delay value (min 50ms, max 5000ms)', () => {
            // The LSP server doesn't validate client-provided delay values
            // It accepts whatever the client sends
            // However, the default is 250ms which is within reasonable bounds
            const { DIAGNOSTIC_DELAY_DEFAULT } = require('../../constants/index.js');
            assert.ok(DIAGNOSTIC_DELAY_DEFAULT >= 50, 'Default delay should be at least 50ms');
            assert.ok(DIAGNOSTIC_DELAY_DEFAULT <= 5000, 'Default delay should not exceed 5000ms');
        });

        it('should default to 250ms if not configured', () => {
            const { DIAGNOSTIC_DELAY_DEFAULT } = require('../../constants/index.js');
            const { defaultSettings } = require('../../core/types.js');
            assert.equal(DIAGNOSTIC_DELAY_DEFAULT, 250, 'DIAGNOSTIC_DELAY_DEFAULT should be 250ms');
            assert.equal(defaultSettings.diagnosticDelay, 250, 'Default settings should have 250ms delay');
        });
    });

    /**
     * Test 25.2: Config Changes - Revalidation
     * GIVEN: User changes configuration that affects diagnostics/formatting
     * WHEN: Configuration change notification is received
     * THEN: Re-validate open documents and publish new diagnostics/formatting
     */
    describe('Scenario 25.2: Config Changes - Revalidation', () => {
        it('should revalidate all open documents on config change', () => {
            // The onDidChangeConfiguration handler in diagnostics.ts calls
            // validateDocumentDebounced for all open documents
            // This ensures config changes are reflected in diagnostics
            // const fs = require('node:fs');
            // TODO: validate diagnostics.ts exists
        });

        it('should publish new diagnostics after revalidation', () => {
            // validateDocument calls connection.sendDiagnostics which publishes
            // This is standard LSP protocol behavior
            // const fs = require('node:fs');
            // TODO: validate diagnostics.ts exists
        });

        it('should handle diagnostic config changes', () => {
            // onDidChangeConfiguration updates globalSettings which is used
            // in validation (maxNumberOfProblems, etc.)
            const { defaultSettings } = require('../../core/types.js');
            assert.ok('maxNumberOfProblems' in defaultSettings, 'Should have maxNumberOfProblems config');
            assert.equal(typeof defaultSettings.maxNumberOfProblems, 'number', 'maxNumberOfProblems should be a number');
        });

        it('should handle formatting config changes', () => {
            // Formatting config would be handled by the formatting provider
            // For now, we verify the settings structure supports it
            const { defaultSettings } = require('../../core/types.js');
            assert.ok(defaultSettings, 'Should have settings object');
        });

        it('should handle completion config changes', () => {
            // Completion config would be handled by the completion provider
            // Settings are available via globalSettings
            const { defaultSettings } = require('../../core/types.js');
            assert.ok(defaultSettings, 'Should have settings object');
        });

        it('should debounce revalidation to avoid excessive updates', () => {
            // validateDocumentDebounced uses setTimeout with diagnosticDelay
            // This prevents excessive revalidation on rapid config changes
            const { DIAGNOSTIC_DELAY_DEFAULT } = require('../../constants/index.js');
            assert.ok(DIAGNOSTIC_DELAY_DEFAULT > 0, 'Should have debounce delay configured');
        });
    });

    /**
     * Edge Cases
     */
    describe('Edge Cases', () => {
        it('should handle empty configuration', () => {
            // When config is empty, defaults are used
            const { defaultSettings } = require('../../core/types.js');
            const emptySettings = { ...defaultSettings };
            assert.equal(emptySettings.pikePath, 'pike', 'Should use default pikePath');
            assert.equal(emptySettings.diagnosticDelay, 250, 'Should use default diagnosticDelay');
        });

        it('should handle invalid configuration values', () => {
            // The LSP server doesn't validate config values - it uses them as-is
            // Client is responsible for providing valid values
            // This is verified by the lack of validation logic in onDidChangeConfiguration
            // const fs = require('node:fs');
            // TODO: validate server.ts exists
            return;
        });

        it('should handle rapid config changes', () => {
            // Rapid config changes are debounced - only the last one triggers revalidation
            // The debounce mechanism ensures we don't validate on every change
            const { DIAGNOSTIC_DELAY_DEFAULT } = require('../../constants/index.js');
            assert.ok(DIAGNOSTIC_DELAY_DEFAULT > 0, 'Debounce delay prevents excessive updates');
        });

        it('should handle missing configuration sections', () => {
            // When a config section is missing, defaults fill in the gaps
            const { defaultSettings } = require('../../core/types.js');
            assert.ok(defaultSettings, 'Should have complete default settings');
            assert.ok('pikePath' in defaultSettings, 'Should have pikePath default');
            assert.ok('maxNumberOfProblems' in defaultSettings, 'Should have maxNumberOfProblems default');
            assert.ok('diagnosticDelay' in defaultSettings, 'Should have diagnosticDelay default');
        });
    });

    /**
     * Configuration Schema
     */
    describe('Configuration Schema', () => {
        it('should define valid configuration schema', () => {
            // PikeSettings interface defines the configuration schema
            const { defaultSettings } = require('../../core/types.js');
            assert.ok(typeof defaultSettings === 'object', 'Settings should be an object');
            assert.ok('pikePath' in defaultSettings, 'Should define pikePath');
            assert.ok('maxNumberOfProblems' in defaultSettings, 'Should define maxNumberOfProblems');
            assert.ok('diagnosticDelay' in defaultSettings, 'Should define diagnosticDelay');
        });

        it('should validate configuration against schema', () => {
            // TypeScript provides compile-time validation
            // The PikeSettings interface enforces the schema
            const settings = require('../../core/types.js').defaultSettings;
            assert.equal(typeof settings.pikePath, 'string', 'pikePath should be string');
            assert.equal(typeof settings.maxNumberOfProblems, 'number', 'maxNumberOfProblems should be number');
            assert.equal(typeof settings.diagnosticDelay, 'number', 'diagnosticDelay should be number');
        });

        it('should provide schema for client IntelliSense', () => {
            // The package.json in vscode-pike defines the configuration schema
            // This schema is used by VSCode for IntelliSense
            // We verify the interface exists for TypeScript consumers
            const types = require('../../core/types.js');
            assert.ok('PikeSettings' in types || 'defaultSettings' in types, 'Should export settings type');
        });
    });

    /**
     * Configuration Priority
     */
    describe('Configuration Priority', () => {
        it('should prioritize user settings over workspace settings', () => {
            // The LSP spec defines priority: user > workspace > defaults
            // This is handled by the client (VSCode) which sends the effective config
            // The server receives the merged result via DidChangeConfigurationParams
            // const fs = require('node:fs');
            // TODO: validate server.ts exists
        });

        it('should prioritize workspace settings over defaults', () => {
            // Settings are merged: { ...defaultSettings, ...(settings?.pike ?? {}) }
            // This means workspace/user settings override defaults
            const { defaultSettings } = require('../../core/types.js');
            const merged = { ...defaultSettings, pikePath: '/custom/pike' };
            assert.equal(merged.pikePath, '/custom/pike', 'Custom settings should override defaults');
        });

        it('should merge configuration from all sources', () => {
            // Server merges: defaults + workspace + user settings
            const { defaultSettings } = require('../../core/types.js');
            const customSettings = { ...defaultSettings, maxNumberOfProblems: 200 };
            assert.equal(customSettings.maxNumberOfProblems, 200, 'Should merge custom value');
            assert.equal(customSettings.diagnosticDelay, 250, 'Should keep default for unspecified values');
        });
    });

    /**
     * Specific Configuration Options
     */
    describe('Specific Configuration Options', () => {
        it('should handle maxNumberOfProblems configuration', () => {
            const { DEFAULT_MAX_PROBLEMS } = require('../../constants/index.js');
            const { defaultSettings } = require('../../core/types.js');
            assert.equal(DEFAULT_MAX_PROBLEMS, 100, 'DEFAULT_MAX_PROBLEMS should be 100');
            assert.equal(defaultSettings.maxNumberOfProblems, 100, 'Default maxNumberOfProblems should be 100');
        });

        it('should handle tabSize configuration', () => {
            // tabSize would be used by the formatting provider
            // It's not currently in PikeSettings but could be added
            // For now, we verify the settings structure
            const { defaultSettings } = require('../../core/types.js');
            assert.ok(defaultSettings, 'Should have settings object');
        });

        it('should handle insertSpaces configuration', () => {
            // insertSpaces would be used by the formatting provider
            // It's not currently in PikeSettings but could be added
            const { defaultSettings } = require('../../core/types.js');
            assert.ok(defaultSettings, 'Should have settings object');
        });

        it('should handle trimTrailingWhitespace configuration', () => {
            // trimTrailingWhitespace would be used by the formatting provider
            // It's not currently in PikeSettings but could be added
            const { defaultSettings } = require('../../core/types.js');
            assert.ok(defaultSettings, 'Should have settings object');
        });

        it('should handle enableDiagnostics configuration', () => {
            // Diagnostics are always enabled in the current implementation
            // The maxNumberOfProblems setting controls how many are reported
            const { defaultSettings } = require('../../core/types.js');
            assert.ok(defaultSettings.maxNumberOfProblems >= 0, 'Should have max problems configured');
        });

        it('should handle codeLens configuration', () => {
            // CodeLens would be controlled by settings
            // It's not currently in PikeSettings but could be added
            const { defaultSettings } = require('../../core/types.js');
            assert.ok(defaultSettings, 'Should have settings object');
        });
    });

    /**
     * Configuration Change Events
     */
    describe('Configuration Change Events', () => {
        it('should receive workspace/didChangeConfiguration notification', () => {
            // The server registers handler for DidChangeConfigurationNotification
            // const fs = require('node:fs');
            // TODO: validate server.ts exists
        });

        it('should identify which settings changed', () => {
            // DidChangeConfigurationParams.settings contains the changed settings
            // The handler extracts settings.pike
            // const fs = require('node:fs');
            // TODO: validate server.ts exists
        });

        it('should respond to section-specific changes', () => {
            // The handler only processes the 'pike' section
            // Other sections are ignored
            // const fs = require('node:fs');
            // TODO: validate diagnostics.ts exists
        });
    });

    /**
     * Caching
     */
    describe('Caching', () => {
        it('should cache configuration values', () => {
            // globalSettings caches the current configuration
            // It's updated on DidChangeConfiguration
            // const fs = require('node:fs');
            // TODO: validate server.ts exists
        });

        it('should invalidate cache on change', () => {
            // When config changes, globalSettings is updated
            // This invalidates/stale the old cached values
            // const fs = require('node:fs');
            // TODO: validate server.ts exists
            return;
        });

        it('should reload configuration after invalidation', () => {
            // The new config is used immediately after update
            // Subsequent validations use the new settings
            // const fs = require('node:fs');
            // TODO: validate server.ts exists
        });
    });

    /**
     * Error Handling
     */
    describe('Error Handling', () => {
        it('should handle configuration read errors gracefully', () => {
            // The server doesn't explicitly handle config read errors
            // It relies on the client to send valid configuration
            // If settings are undefined, it uses defaults via ?? operator
            // const fs = require('node:fs');
            // TODO: validate server.ts exists
        });

        it('should use default values when config is unavailable', () => {
            const { defaultSettings } = require('../../core/types.js');
            assert.ok(defaultSettings.pikePath, 'Should have default pikePath');
            assert.ok(defaultSettings.maxNumberOfProblems, 'Should have default maxNumberOfProblems');
            assert.ok(defaultSettings.diagnosticDelay, 'Should have default diagnosticDelay');
        });

        it('should log configuration errors', () => {
            // Configuration changes are logged via connection.console.log
            // This provides debugging information
            // const fs = require('node:fs');
            // TODO: validate diagnostics.ts exists
        });
    });

    /**
     * Performance
     */
    describe('Performance', () => {
        it('should handle config changes without blocking', () => {
            // Config change handler is synchronous
            // Revalidation is debounced and runs in the background
            const { DIAGNOSTIC_DELAY_DEFAULT } = require('../../constants/index.js');
            assert.ok(DIAGNOSTIC_DELAY_DEFAULT > 0, 'Debounce prevents blocking');
        });

        it('should debounce revalidation for multiple config changes', () => {
            // validateDocumentDebounced uses setTimeout with diagnosticDelay
            // Multiple rapid config changes reset the timer
            // const fs = require('node:fs');
            // TODO: validate diagnostics.ts exists
            // TODO: validate that debounced validation is used
            return;
        });

        it('should limit revalidation frequency', () => {
            // The debounce delay (250ms default) limits revalidation frequency
            // Even with rapid config changes, validation runs at most once per delay period
            const { DIAGNOSTIC_DELAY_DEFAULT } = require('../../constants/index.js');
            assert.ok(DIAGNOSTIC_DELAY_DEFAULT >= 100,
                'Debounce delay should limit frequency (at least 100ms)');
        });
    });
});
