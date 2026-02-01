/**
 * Module Resolution Edge Cases
 *
 * Test cases for:
 * 1. import MODULES_PATH; inherit SomethingFromPath
 * 2. #include "something.h" navigation
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('Module Resolution - Edge Cases', () => {
	let bridge: PikeBridge;

	beforeEach(async () => {
		bridge = new PikeBridge();
		await bridge.start();
	});

	afterEach(async () => {
		await bridge.stop();
	});

	/**
	 * Case 1: import a module path, then inherit from it
	 * Example:
	 *   import .Modules.my_module;
	 *   inherit MyBaseClass;  // Should resolve to .Modules.my_module.MyBaseClass
	 */
	it('should extract import with path and inherit statement', async () => {
		const code = `
//! Test file with path import then inherit
import .Modules.my_module;

inherit MyBaseClass;
`;

		const result = await bridge.parse(code, '/tmp/test-path-inherit.pike');

		console.log('All symbols:', JSON.stringify(result.symbols.map((s: any) => ({
			name: s.name,
			kind: s.kind,
			classname: s.classname
		})), null, 2));

		// Should have import statement
		const imports = result.symbols.filter(s => s.kind === 'import');
		expect(imports.length).toBeGreaterThanOrEqual(1);
		expect(imports[0].classname).toBe('.Modules.my_module');

		// Should have inherit statement (likely at top level if not in class)
		const collectInherits = (symbols: any[]): any[] => {
			const inherits: any[] = [];
			for (const s of symbols) {
				if (s.kind === 'inherit') {
					inherits.push(s);
				}
				if (s.children) {
					inherits.push(...collectInherits(s.children));
				}
			}
			return inherits;
		};

		const inherits = collectInherits(result.symbols);
		expect(inherits.length).toBeGreaterThanOrEqual(1);
		expect(inherits[0]?.name).toBe('MyBaseClass');
	});
});
