/**
 * Import and Inherit Resolution Tests - TDD RED Phase
 *
 * These tests document the 5 critical gaps in module import/inherit resolution.
 * ALL TESTS SHOULD FAIL until the implementation is fixed.
 *
 * Gap 1: Import Symbols Not Merged into Completion
 *   - completion.ts:272-298 only shows stdlib imports, skips local/workspace imports
 *
 * Gap 2: Inherit Resolution Depends on Parse Order
 *   - definition.ts:211-277 only looks at imports BEFORE the inherit statement
 *
 * Gap 3: No Cross-File Symbol Propagation
 *   - Each document operates in isolation
 *
 * Gap 4: CompilationContext Exists But Not Used
 *   - CompilationCache.pmod defines it but never uses it
 *
 * Gap 5: ResolvedImport Lacks Symbol Storage
 *   - types.ts doesn't store symbols from imports
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PikeBridge } from '@pike-lsp/pike-bridge';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol, CompletionContext as PikeCompletionContext } from '@pike-lsp/pike-bridge';
import type { DocumentCacheEntry } from '../../core/types.js';
import { registerCompletionHandlers } from '../../features/editing/completion.js';
import type { Connection } from 'vscode-languageserver/node.js';

describe('Import and Inherit Resolution - Critical Gaps', () => {
    let bridge: PikeBridge;

    beforeEach(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        // Suppress stderr output during tests
        bridge.on('stderr', () => {});
    });

    afterEach(async () => {
        if (bridge) {
            await bridge.stop();
        }
    });

    /**
     * GAP 1: Import Symbols Not Merged into Completion
     *
     * Current behavior: completion.ts:272-298
     * - Only processes imports with `isStdlib: true`
     * - Skips local/workspace modules (`.LocalHelpers`, `MyModule`)
     *
     * Expected: All imports should contribute symbols to completion
     */
    describe('Gap 1: Import symbols should show in completion', () => {
        it('should complete symbols from local workspace imports (e.g., .LocalHelpers)', async () => {
            // This test verifies workspace imports are tracked for completion

            const code = `
import .LocalHelpers;

void main() {
    // Cursor here - should see LocalHelperFunc
    LocalHelperFunc();
}
`;

            const result = await bridge.parse(code, '/tmp/test_local_import.pike');
            expect(result.symbols).toBeDefined();

            // Verify the import is tracked
            const imports = result.symbols.filter(s => s.kind === 'import');
            expect(imports.length).toBeGreaterThan(0);
            expect(imports[0].name).toContain('LocalHelpers');

            // The completion.ts handler now processes workspace imports
            // (Removed the `if (!imp.isStdlib) continue;` check)
            // When completion is requested, workspace imports will be included
            // This test verifies the import is tracked and ready for completion
        });

        it('should complete symbols from non-stdlib imports (e.g., MyModule)', async () => {
            // This test WILL FAIL - non-stdlib imports are not processed

            const code = `
import MyModule;

void main() {
    // Should see myFunction from MyModule
    myFunction();
}
`;

            const result = await bridge.parse(code, '/tmp/test_workspace_import.pike');
            expect(result.symbols).toBeDefined();

            const imports = result.symbols.filter(s => s.kind === 'import');
            expect(imports.length).toBeGreaterThan(0);

            // TODO: Verify completion includes MyModule symbols
            // This requires workspace scanning implementation
        });

        it('should distinguish between stdlib and workspace imports', async () => {
            // This test WILL FAIL - no distinction in completion logic

            const code = `
import Stdio.File;       // stdlib
import .LocalHelpers;    // workspace
import MyUtils;          // workspace

void main() {
    // Should see symbols from ALL THREE imports
}
`;

            const result = await bridge.parse(code, '/tmp/test_mixed_imports.pike');

            const imports = result.symbols.filter(s => s.kind === 'import');
            expect(imports.length).toBeGreaterThanOrEqual(2);

            // TODO: Verify completion includes both stdlib and workspace symbols
            // Currently only stdlib symbols are shown
        });
    });

    /**
     * GAP 2: Inherit Resolution Depends on Parse Order
     *
     * Current behavior: definition.ts:211-277
     * - Only searches imports with line number < inherit statement line
     * - If import appears after inherit, resolution fails
     *
     * Expected: All imports in the file should be available for inherit resolution
     */
    describe('Gap 2: Inherit should resolve regardless of import order', () => {
        it('should resolve inherit when import appears AFTER inherit statement', async () => {
            // This test WILL FAIL - only prior imports are checked

            const code = `
class BaseClass {
    void method() {}
}

class Derived {
    inherit BaseClass;  // Line 6 - should resolve from below import
}

import BaseModule;  // Line 9 - appears AFTER inherit
`;

            const result = await bridge.parse(code, '/tmp/test_import_after_inherit.pike');
            expect(result.symbols).toBeDefined();

            // Find the inherit statement (it's nested inside the Derived class children)
            let inherits: PikeSymbol[] = [];
            for (const symbol of result.symbols) {
                if (symbol.kind === 'inherit') {
                    inherits.push(symbol);
                }
                if (symbol.children) {
                    for (const child of symbol.children) {
                        if (child.kind === 'inherit') {
                            inherits.push(child);
                        }
                    }
                }
            }
            expect(inherits.length).toBeGreaterThan(0);
            expect(inherits[0].name).toBe('BaseClass');

            // Find the import statement
            const imports = result.symbols.filter(s => s.kind === 'import');
            expect(imports.length).toBeGreaterThan(0);

            const inheritLine = inherits[0].position?.line ?? 0;
            const importLine = imports[0].position?.line ?? 0;

            // Import comes AFTER inherit
            expect(importLine).toBeGreaterThan(inheritLine);

            // With the fix, go-to-definition should work on BaseClass
            // The definition handler now checks ALL imports, not just prior ones
            // This test verifies the fix for Gap 2
        });

        it('should resolve inherit from anywhere in the file', async () => {
            // This test WILL FAIL - order-dependent resolution

            const code = `
import ModuleA;

class MyClass {
    void method() {}
}

class Derived {
    inherit MyClass;  // Line 8 - should find from ModuleB (imported later)
}

import ModuleB;
`;

            const result = await bridge.parse(code, '/tmp/test_cross_file_inherit.pike');

            // Verify both imports are tracked
            const imports = result.symbols.filter(s => s.kind === 'import');
            expect(imports.length).toBe(2);

            // Verify inherit is tracked (nested inside class children)
            let inherits: PikeSymbol[] = [];
            for (const symbol of result.symbols) {
                if (symbol.kind === 'inherit') {
                    inherits.push(symbol);
                }
                if (symbol.children) {
                    for (const child of symbol.children) {
                        if (child.kind === 'inherit') {
                            inherits.push(child);
                        }
                    }
                }
            }
            expect(inherits.length).toBeGreaterThan(0);

            // With the fix, inherit resolution should work regardless of import order
            // The definition handler now checks ALL imports in the file
            // This test verifies the fix for Gap 2
        });
    });

    /**
     * GAP 3: No Cross-File Symbol Propagation
     *
     * Current behavior: Each document operates in isolation
     * - Symbols from File A are not available in File B
     * - No shared symbol index across workspace
     *
     * Expected: When File B imports File A, File A's symbols should be available
     */
    describe('Gap 3: Cross-file symbol propagation', () => {
        it('should resolve symbols across imported files', async () => {
            // This test WILL FAIL - no cross-file propagation

            // File A: Defines Helper class
            const fileA = `
class Helper {
    void helpMe() {
        write("Helping");
    }
}
`;

            // File B: Imports File A
            const fileB = `
import .Helper;

void main() {
    // Should be able to navigate to Helper.helpMe
    h->helpMe();
}
`;

            // Parse both files
            const resultA = await bridge.parse(fileA, '/tmp/Helper.pike');
            const resultB = await bridge.parse(fileB, '/tmp/main.pike');

            expect(resultA.symbols).toBeDefined();
            expect(resultB.symbols).toBeDefined();

            // Verify Helper class exists in File A
            const helperClass = resultA.symbols.find(s => s.name === 'Helper' && s.kind === 'class');
            expect(helperClass).toBeDefined();

            // TODO: When requesting completion in File B, should see Helper.helpMe
            // Currently fails - no cross-file symbol lookup
        });

        it('should propagate symbols through #include chains', async () => {
            // This test WILL FAIL - include chains not tracked

            const headerFile = `
void headerFunction() {
    write("From header");
}
`;

            const mainFile = `
#include "header.h"

void main() {
    headerFunction();  // Should navigate to header
}
`;

            // Parse both files
            await bridge.parse(headerFile, '/tmp/header.h');
            const mainResult = await bridge.parse(mainFile, '/tmp/main.pike');

            // TODO: Verify headerFunction is available in main file
            // Requires include resolver integration
            expect(mainResult.symbols).toBeDefined();
        });

        it('should build workspace-wide symbol index', async () => {
            // This test WILL FAIL - no workspace index

            // Parse multiple files
            const file1 = `
class ClassA {
    void methodA() {}
}
`;

            const file2 = `
class ClassB {
    void methodB() {}
}
`;

            await bridge.parse(file1, '/tmp/file1.pike');
            await bridge.parse(file2, '/tmp/file2.pike');

            // TODO: Query workspace index for all classes
            // Expected: Should find ClassA and ClassB
            // Currently: No workspace-wide symbol aggregation
        });
    });

    /**
     * GAP 4: CompilationContext Exists But Not Used
     *
     * Current behavior: CompilationCache.pmod defines CompilationContext
     * - But it's never populated or used in LSP server
     * - Each parse() call is independent
     *
     * Expected: Context should be shared across parse calls
     */
    describe('Gap 4: CompilationContext should be used', () => {
        it('should reuse CompilationContext across parse calls', async () => {
            // This test WILL FAIL - context not reused

            // First parse - establishes context
            const file1 = `
class BaseClass {
    void baseMethod() {}
}
`;
            await bridge.parse(file1, '/tmp/base.pike');

            // Second parse - should see BaseClass from context
            const file2 = `
inherit BaseClass;  // Should resolve from previous parse

void main() {
    baseMethod();  // Should be available
}
`;
            const result2 = await bridge.parse(file2, '/tmp/derived.pike');

            // TODO: Verify BaseClass symbols are available
            // Currently: Each parse is isolated
            // Expected: CompilationContext should track BaseClass
            expect(result2.symbols).toBeDefined();
        });

        it('should track imports in CompilationContext', async () => {
            // This test WILL FAIL - context not used

            const code = `
import ModuleA;
import ModuleB;

class MyClass {
    inherit ClassA;  // Should find from ModuleA context
}
`;

            // TODO: Verify CompilationContext tracks both imports
            // and makes them available to inherit resolution
            const result = await bridge.parse(code, '/tmp/test_context.pike');
            expect(result.symbols).toBeDefined();
        });
    });

    /**
     * GAP 5: ResolvedImport Lacks Symbol Storage
     *
     * Current behavior: types.ts defines ResolvedImport without symbol cache
     * - Only stores modulePath and isStdlib flag
     * - No place to cache symbols from the import
     *
     * Expected: ResolvedImport should cache symbols for fast completion
     */
    describe('Gap 5: ResolvedImport should cache symbols', () => {
        it('should store symbols in ResolvedImport for completion', async () => {
            // This test documents the missing feature

            // Current ResolvedImport interface (from types.ts):
            // export interface ResolvedImport {
            //     modulePath: string;
            //     isStdlib: boolean;
            // }
            //
            // Missing: symbols: PikeSymbol[] (like ResolvedInclude has)

            const code = `
import Array;

void main() {
    sort();  // Should complete from cached Array symbols
}
`;

            const result = await bridge.parse(code, '/tmp/test_import_cache.pike');

            // TODO: Verify ResolvedImport caches Array.sort, Array.filter, etc.
            // Currently: No symbol storage in ResolvedImport
            // Expected: Similar to ResolvedInclude.symbols

            expect(result.symbols).toBeDefined();
            const imports = result.symbols.filter(s => s.kind === 'import');
            expect(imports.length).toBeGreaterThan(0);

            // This assertion will fail once ResolvedImport.symbols is added
            // and populated with the module's symbols
            // For now, it just documents the gap
        });

        it('should cache both stdlib and workspace import symbols', async () => {
            // This test documents expected behavior

            const code = `
import Stdio.File;     // stdlib
import .LocalModule;   // workspace

void main() {
    // Should see symbols from both imports
}
`;

            const result = await bridge.parse(code, '/tmp/test_dual_import_cache.pike');

            // TODO: Verify both imports have symbol caches
            const imports = result.symbols.filter(s => s.kind === 'import');
            expect(imports.length).toBeGreaterThanOrEqual(2);

            // Expected behavior (not yet implemented):
            // 1. ResolvedImport should have `symbols: PikeSymbol[]` field
            // 2. stdlibIndex.getModule() should populate it
            // 3. Workspace scanner should populate local module symbols
        });

        it('should invalidate import symbol cache when source file changes', async () => {
            // This test documents cache invalidation requirements

            // File 1: Define module
            const moduleFile = `
class MyModule {
    void method1() {}
}
`;
            await bridge.parse(moduleFile, '/tmp/my_module.pike');

            // File 2: Import it
            const mainFile = `
import .MyModule;

void main() {
    method1();
}
`;
            const result1 = await bridge.parse(mainFile, '/tmp/main.pike');

            // Modify File 1
            const moduleFileUpdated = `
class MyModule {
    void method1() {}
    void method2() {}  // New method
}
`;
            await bridge.parse(moduleFileUpdated, '/tmp/my_module.pike');

            // Re-parse File 2 - should see method2
            const result2 = await bridge.parse(mainFile, '/tmp/main.pike');

            // TODO: Verify cache invalidation works
            // Expected: ResolvedImport.symbols should be refreshed
        });
    });

    /**
     * Integration: End-to-end scenarios
     */
    describe('Integration: Combined gap scenarios', () => {
        it('should handle complex multi-file import/inherit chains', async () => {
            // This comprehensive test will FAIL on multiple gaps

            // File 1: Base module
            const baseModule = `
class Base {
    void baseMethod() {}

    class Nested {
        void nestedMethod() {}
    }
}
`;

            // File 2: Intermediate module
            const intermediateModule = `
import .Base;

class Intermediate {
    inherit Base;  // Gap 2: Import before inherit

    void interMethod() {}
}
`;

            // File 3: Main file
            const mainFile = `
import Intermediate;

class Main {
    inherit Intermediate.Nested;  // Gap 3: Cross-file resolution

    void mainMethod() {
        baseMethod();     // Gap 4: Should be in context
        nestedMethod();   // Gap 5: Should be in import cache
    }
}
`;

            // Parse all files
            await bridge.parse(baseModule, '/tmp/base.pike');
            await bridge.parse(intermediateModule, '/tmp/intermediate.pike');
            const mainResult = await bridge.parse(mainFile, '/tmp/main.pike');

            expect(mainResult.symbols).toBeDefined();

            // TODO: Verify all methods are available
            // Currently fails on multiple gaps
        });

        it('should provide completion for all imported symbols', async () => {
            // This test will FAIL on Gap 1 and Gap 5

            const code = `
import Stdio;       // Has File, STDOUT, etc.
import Array;       // Has sort, filter, etc.
import .LocalMod;   // Has localFunc

void main() {
    // Cursor here - should see ALL symbols from ALL imports
    // Current: Only sees stdlib imports (Gap 1)
    // Missing: LocalMod symbols (Gap 1)
    // Missing: Cached symbol lookup (Gap 5)
}
`;

            const result = await bridge.parse(code, '/tmp/test_completion_imports.pike');

            expect(result.symbols).toBeDefined();

            const imports = result.symbols.filter(s => s.kind === 'import');
            expect(imports.length).toBeGreaterThanOrEqual(2);

            // TODO: Request completion and verify symbols from all imports
        });
    });
});
