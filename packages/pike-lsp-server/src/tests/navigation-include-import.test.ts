/**
 * Navigation Tests for #include, import, and inherit statements
 *
 * Test that go-to-definition works for:
 * 1. #include "header.h"
 * 2. import Module.Path
 * 3. inherit BaseClass
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('Navigation - Include and Import Statements', () => {
	let bridge: PikeBridge;

	beforeEach(async () => {
		bridge = new PikeBridge();
		await bridge.start();
	});

	afterEach(async () => {
		await bridge.stop();
	});

	/**
	 * Test that #include directives can be resolved
	 * This tests the resolve_include bridge method
	 */
	it('should resolve #include directive path', async () => {
		// For now, just test that the bridge method exists and doesn't throw
		// We'll need file system access to fully test this
		const result = await bridge.resolveInclude('test_header.h', '/tmp/test.pike');

		console.log('Include resolve result:', result);

		// The result should have the expected structure
		expect(result).toHaveProperty('path');
		expect(result).toHaveProperty('exists');
		expect(result).toHaveProperty('originalPath');
		expect(result.originalPath).toBe('test_header.h');
	});

	/**
	 * Test that relative import paths are resolved
	 * Relative paths (starting with .) should be resolved via file system
	 */
	it('should attempt to resolve relative import path', async () => {
		const result = await bridge.resolveInclude('.Modules.my_module', '/tmp/test.pike');

		console.log('Relative import resolve result:', result);

		// Should have the expected structure
		expect(result).toHaveProperty('path');
		expect(result).toHaveProperty('exists');
		expect(result).toHaveProperty('originalPath');
		expect(result.originalPath).toBe('.Modules.my_module');
	});
});
