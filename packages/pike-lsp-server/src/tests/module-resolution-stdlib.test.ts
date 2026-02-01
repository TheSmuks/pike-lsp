/**
 * Module Resolution Tests - Stdlib Imports
 *
 * Test that stdlib imports are correctly extracted
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('Module Resolution - Stdlib Import', () => {
	let bridge: PikeBridge;

	beforeEach(async () => {
		bridge = new PikeBridge();
		await bridge.start();
	});

	afterEach(async () => {
		await bridge.stop();
	});

	it('should extract stdlib import with classname', async () => {
		const code = `
//! Test file with stdlib import
import Stdio;

int main() {
	return 0;
}
`;

		const result = await bridge.parse(code, '/tmp/test-import.pike');

		const imports = result.symbols.filter(s => s.kind === 'import');
		expect(imports.length).toBeGreaterThanOrEqual(1);

		const stdioImport = imports[0];
		if (!stdioImport) {
			throw new Error('Expected to find Stdio import');
		}
		expect(stdioImport.name).toBe('Stdio');
		expect(stdioImport.classname).toBe('Stdio');
	});
});
