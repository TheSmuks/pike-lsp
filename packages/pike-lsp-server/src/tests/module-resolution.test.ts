/**
 * Module Resolution Tests
 *
 * TDD tests for fixing Pike module resolution for:
 * - import statements
 * - inherit statements
 * - #include directives
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('Module Resolution - Import Statements', () => {
	let bridge: PikeBridge;

	beforeEach(async () => {
		bridge = new PikeBridge();
		await bridge.start();
	});

	afterEach(async () => {
		await bridge.stop();
	});

	/**
	 * Test: Import statement should be extracted as a symbol
	 * Expected: Parser extracts import with path in classname field
	 *
	 * ISSUE: Local imports like "." have quote escaping problems
	 * The symbol name becomes "\".\"" instead of "."
	 */
	it('should extract local import without quote escaping', async () => {
		const code = `
//! Test file with local import
import ".";

int main() {
	return 0;
}
`;

		const result = await bridge.parse(code, '/tmp/test-import.pike');

		// Find import symbols
		const imports = result.symbols.filter(s => s.kind === 'import');
		expect(imports.length).toBeGreaterThanOrEqual(1);

		// The import should have name "." not "\".\""
		const localImport = imports[0];
		if (!localImport) {
			throw new Error('Expected to find local import');
		}
		expect(localImport.name).toBe('.');
		expect(localImport.classname).toBe('.');
	});
});
