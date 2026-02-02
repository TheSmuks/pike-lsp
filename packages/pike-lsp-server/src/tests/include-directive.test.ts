/**
 * Include Directive Tests
 *
 * TDD tests for distinguishing #include directives from module imports.
 * Tests that #include has kind="include" while import statements have kind="import".
 *
 * Run with: bun test dist/src/tests/include-directive.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('Include Directive - Kind Distinction', () => {
    let bridge: PikeBridge;

    beforeEach(async () => {
        bridge = new PikeBridge();
        await bridge.start();
    });

    afterEach(async () => {
        await bridge.stop();
    });

    /**
     * Test: #include directive should have kind='include'
     * Expected: Parser extracts #include with kind='include', not kind='import'
     */
    it('should extract #include with kind="include"', async () => {
        const code = `
//! Test file with include directive
#include "test.h"

int main() {
    return 0;
}
`;

        const result = await bridge.parse(code, '/tmp/test-include.pike');

        // Find include symbols
        const includes = result.symbols.filter(s => s.kind === 'include');
        expect(includes.length).toBeGreaterThanOrEqual(1);

        const includeSymbol = includes[0];
        if (!includeSymbol) {
            throw new Error('Expected to find #include symbol');
        }

        // Verify it has kind='include'
        expect(includeSymbol.kind).toBe('include');
        expect(includeSymbol.name).toBe('test.h');
        expect(includeSymbol.classname).toBe('test.h');
    });

    /**
     * Test: import statement should have kind='import'
     * Expected: Parser extracts import with kind='import', distinct from #include
     */
    it('should extract import with kind="import"', async () => {
        const code = `
//! Test file with import
import Stdio;

int main() {
    return 0;
}
`;

        const result = await bridge.parse(code, '/tmp/test-import.pike');

        // Find import symbols
        const imports = result.symbols.filter(s => s.kind === 'import');
        expect(imports.length).toBeGreaterThanOrEqual(1);

        const importSymbol = imports[0];
        if (!importSymbol) {
            throw new Error('Expected to find import symbol');
        }

        // Verify it has kind='import'
        expect(importSymbol.kind).toBe('import');
        expect(importSymbol.name).toBe('Stdio');
    });

    /**
     * Test: #include with angle brackets should also have kind='include'
     */
    it('should extract #include <...> with kind="include"', async () => {
        const code = `
//! Test file with system include
#include <stdio.h>

int main() {
    return 0;
}
`;

        const result = await bridge.parse(code, '/tmp/test-system-include.pike');

        // Find include symbols
        const includes = result.symbols.filter(s => s.kind === 'include');
        expect(includes.length).toBeGreaterThanOrEqual(1);

        const includeSymbol = includes[0];
        if (!includeSymbol) {
            throw new Error('Expected to find #include symbol');
        }

        expect(includeSymbol.kind).toBe('include');
        expect(includeSymbol.name).toBe('stdio.h');
    });

    /**
     * Test: Document with both #include and import should distinguish them
     */
    it('should distinguish #include from import in same file', async () => {
        const code = `
//! Test file with both include and import
#include "config.h"
import Stdio;

int main() {
    return 0;
}
`;

        const result = await bridge.parse(code, '/tmp/test-mixed.pike');

        // Find include symbols
        const includes = result.symbols.filter(s => s.kind === 'include');
        expect(includes.length).toBe(1);
        expect(includes[0]?.name).toBe('config.h');

        // Find import symbols
        const imports = result.symbols.filter(s => s.kind === 'import');
        expect(imports.length).toBeGreaterThanOrEqual(1);
        expect(imports[0]?.name).toBe('Stdio');
    });

    /**
     * Test: Multiple #include directives should all have kind='include'
     */
    it('should extract multiple #include directives with kind="include"', async () => {
        const code = `
//! Test file with multiple includes
#include "header1.h"
#include "header2.h"
#include <system.h>

int main() {
    return 0;
}
`;

        const result = await bridge.parse(code, '/tmp/test-multi-include.pike');

        // Find include symbols
        const includes = result.symbols.filter(s => s.kind === 'include');
        expect(includes.length).toBeGreaterThanOrEqual(3);

        // Verify all are kind='include'
        for (const include of includes) {
            expect(include.kind).toBe('include');
        }
    });
});
