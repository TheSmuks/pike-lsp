import { describe, it, expect } from 'bun:test';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('Module Resolution - Inherit Statements', () => {
	it('should extract inherit statement with classname', async () => {
		const bridge = new PikeBridge();
		await bridge.start();

		try {
			const code = `
class BaseClass {
	void foo() {}
}

class DerivedClass {
	inherit BaseClass;
}
`;

			const result = await bridge.parse(code, '/tmp/test-inherit.pike');

			console.log('All symbols:', JSON.stringify(result.symbols.map((s: any) => ({ name: s.name, kind: s.kind, classname: s.classname })), null, 2));

			// Inherit statements inside classes are stored as children
			// Find all inherit statements at any level
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

			const baseClassInherit = inherits[0];
			expect(baseClassInherit.name).toBe('BaseClass');
			expect(baseClassInherit.classname).toBe('BaseClass');
		} finally {
			await bridge.stop();
		}
	});
});
