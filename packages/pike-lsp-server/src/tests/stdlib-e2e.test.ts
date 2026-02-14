/**
 * Pike Stdlib E2E Tests
 *
 * End-to-end tests against real Pike standard library modules.
 * These tests verify the LSP works correctly with actual Pike stdlib code.
 *
 * Test categories:
 * 1. Parser.Pike module resolution
 * 2. Stdio module symbols
 * 3. Array/String module completions
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('Pike Stdlib E2E - Parser.Pike Module', () => {
    let bridge: PikeBridge;

    beforeEach(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    afterEach(async () => {
        await bridge.stop();
    });

    it('should resolve Parser.Pike import in user code', async () => {
        const code = `
import Parser.Pike;

void main() {
    array tokens = Parser.Pike.split("int x;");
}
`;

        const result = await bridge.parse(code, '/tmp/test_parser_import.pike');

        expect(result.symbols).toBeDefined();

        // Should find the import - extracted as name "Pike" with classname "Parser.Pike"
        const imports = result.symbols.filter(s => s.kind === 'import');
        expect(imports.length).toBeGreaterThan(0);

        const parserImport = imports.find(i => i.name === 'Pike' && i.classname === 'Parser.Pike');
        expect(parserImport).toBeDefined();
    });

    it('should extract symbols from code using Parser.Pike.Split context', async () => {
        // Parser.Pike.split is commonly used for tokenization
        const code = `
import Parser.Pike;

void main() {
    array tokens = Parser.Pike.split("int x;");
}
`;

        const result = await bridge.parse(code, '/tmp/test_parser_split.pike');

        expect(result.symbols).toBeDefined();
        expect(result.diagnostics.filter(d => d.severity === 'error').length).toBe(0);
    });
});

describe('Pike Stdlib E2E - Stdio Module', () => {
    let bridge: PikeBridge;

    beforeEach(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    afterEach(async () => {
        await bridge.stop();
    });

    it('should extract Stdio.File class symbols', async () => {
        // Stdio.File is a core class for file I/O
        const code = `
import Stdio;

void main() {
    Stdio.File file = Stdio.File("test.txt", "r");
    file.close();
}
`;

        const result = await bridge.parse(code, '/tmp/test_stdio_file.pike');

        expect(result.symbols).toBeDefined();

        // Should find the import
        const imports = result.symbols.filter(s => s.kind === 'import');
        expect(imports.length).toBeGreaterThan(0);

        // Should find Stdio import
        const stdioImport = imports.find(i => i.name === 'Stdio');
        expect(stdioImport).toBeDefined();
    });

    it('should resolve Stdio.stdout, Stdio.stderr, Stdio.stdin', async () => {
        const code = `
import Stdio;

void main() {
    Stdio.stdout.write("Hello\\n");
    Stdio.stderr.write("Error\\n");
    string line = Stdio.stdin.gets();
}
`;

        const result = await bridge.parse(code, '/tmp/test_stdio_streams.pike');

        expect(result.symbols).toBeDefined();
        expect(result.diagnostics.filter(d => d.severity === 'error').length).toBe(0);
    });

    it('should extract Stdio.File methods (open, close, read, write)', async () => {
        const code = `
import Stdio;

void test_file_ops() {
    Stdio.File f = Stdio.File();
    f.open("/tmp/test", "rwc");
    f.write("data");
    string data = f.read(1024);
    f.close();
}
`;

        const result = await bridge.parse(code, '/tmp/test_stdio_methods.pike');

        expect(result.symbols).toBeDefined();

        // Find method calls
        const methodCalls = result.symbols.filter(s =>
            s.kind === 'method' ||
            (s.children && s.children.some(c => c.kind === 'method'))
        );

        // Should have multiple method references
        expect(methodCalls.length).toBeGreaterThan(0);
    });
});

describe('Pike Stdlib E2E - Array Module', () => {
    let bridge: PikeBridge;

    beforeEach(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    afterEach(async () => {
        await bridge.stop();
    });

    it('should complete Array methods (sort, filter, map)', async () => {
        const code = `
import Array;

void main() {
    array(int) arr = ({3, 1, 2});
    arr = Array.sort(arr);
    arr = Array.filter(arr, lambda(int x) { return x > 1; });
    arr = Array.map(arr, lambda(int x) { return x * 2; });
}
`;

        const result = await bridge.parse(code, '/tmp/test_array_methods.pike');

        expect(result.symbols).toBeDefined();
        expect(result.diagnostics.filter(d => d.severity === 'error').length).toBe(0);

        // Should find the import
        const imports = result.symbols.filter(s => s.kind === 'import');
        const arrayImport = imports.find(i => i.name === 'Array');
        expect(arrayImport).toBeDefined();
    });

    it('should resolve array utilities (uniq, sum)', async () => {
        const code = `
import Array;

void test_utils() {
    array(int) arr = ({1, 2, 2, 3});
    arr = Array.uniq(arr);
    int total = Array.sum(arr);
}
`;

        const result = await bridge.parse(code, '/tmp/test_array_utils.pike');

        expect(result.symbols).toBeDefined();
        expect(result.diagnostics.filter(d => d.severity === 'error').length).toBe(0);
    });
});

describe('Pike Stdlib E2E - String Module', () => {
    let bridge: PikeBridge;

    beforeEach(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    afterEach(async () => {
        await bridge.stop();
    });

    it('should complete String methods (trim_all_whites, split)', async () => {
        // Note: String.trim() doesn't exist in Pike 8.0 - use trim_all_whites()
        const code = `
import String;

void main() {
    string s = "  hello  ";
    s = String.trim_all_whites(s);
    array parts = s / " ";
    array split_parts = String.split(s, " ");
}
`;

        const result = await bridge.parse(code, '/tmp/test_string_methods.pike');

        expect(result.symbols).toBeDefined();
        expect(result.diagnostics.filter(d => d.severity === 'error').length).toBe(0);
    });

    it('should resolve String formatting functions', async () => {
        const code = `
import String;

void test_format() {
    string formatted = String.sprintf("%s %d\\n", "test", 42);
    string hex = String.int2hex(255);
}
`;

        const result = await bridge.parse(code, '/tmp/test_string_format.pike');

        expect(result.symbols).toBeDefined();
        expect(result.diagnostics.filter(d => d.severity === 'error').length).toBe(0);

        // Should find String import
        const imports = result.symbols.filter(s => s.kind === 'import');
        const stringImport = imports.find(i => i.name === 'String');
        expect(stringImport).toBeDefined();
    });
});

describe('Pike Stdlib E2E - Multi-module Integration', () => {
    let bridge: PikeBridge;

    beforeEach(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    afterEach(async () => {
        await bridge.stop();
    });

    it('should handle code using multiple stdlib modules together', async () => {
        const code = `
import Stdio;
import Array;
import String;

void main() {
    // Read from stdin
    string line = Stdio.stdin.gets();

    // Process with String module
    line = String.trim_all_whites(line);

    // Split and sort with Array module
    array parts = String.split(line, " ");
    parts = Array.sort(parts);

    // Write output
    Stdio.stdout.write("Result: " + parts * ", " + "\\n");
}
`;

        const result = await bridge.parse(code, '/tmp/test_multi_module.pike');

        expect(result.symbols).toBeDefined();
        expect(result.diagnostics.filter(d => d.severity === 'error').length).toBe(0);

        // Should find all three imports
        const imports = result.symbols.filter(s => s.kind === 'import');
        expect(imports.length).toBeGreaterThanOrEqual(3);

        const importNames = imports.map(i => i.name);
        expect(importNames).toContain('Stdio');
        expect(importNames).toContain('Array');
        expect(importNames).toContain('String');
    });

    it('should resolve chained method calls across stdlib modules', async () => {
        const code = `
import Stdio;
import Array;
import String;

void process_data(string input) {
    // Chain: String -> Array -> String
    array parts = Array.sort(String.split(String.trim_all_whites(input), " "));
    string output = parts * ", ";
    Stdio.stdout.write(output + "\\n");
}
`;

        const result = await bridge.parse(code, '/tmp/test_chained_calls.pike');

        expect(result.symbols).toBeDefined();
        expect(result.diagnostics.filter(d => d.severity === 'error').length).toBe(0);
    });
});
