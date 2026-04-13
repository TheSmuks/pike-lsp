import { describe, it, afterEach } from 'bun:test';
import assert from 'node:assert/strict';
import {
  detectRoxenModule,
  invalidateCache,
  isRoxenModule,
} from '../../../features/roxen/detector.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { RoxenModuleInfo } from '../../../features/roxen/types.js';

type RoxenDetectorBridge = {
  roxenDetect(code: string, filename?: string): Promise<RoxenModuleInfo>;
};

const nonRoxenModuleInfo: RoxenModuleInfo = {
  is_roxen_module: 0,
  module_type: [],
  module_name: '',
  inherits: [],
  variables: [],
  tags: [],
  lifecycle: {
    callbacks: [],
    has_create: 0,
    has_start: 0,
    has_stop: 0,
    has_status: 0,
    missing_required: [],
  },
};

const createMockBridge = (result: RoxenModuleInfo): RoxenDetectorBridge => ({
  roxenDetect: async () => result,
});

const roxenModuleInfo: RoxenModuleInfo = {
  is_roxen_module: 1,
  module_type: ['MODULE_TAG'],
  module_name: 'Test Module',
  inherits: ['module'],
  variables: [],
  tags: [],
  lifecycle: {
    callbacks: [],
    has_create: 0,
    has_start: 0,
    has_stop: 0,
    has_status: 0,
    missing_required: [],
  },
};

describe('Roxen Detector', () => {
  const testUri = 'file:///test/module.pike';

  // Clear cache after each test to prevent cross-test contamination
  afterEach(() => {
    invalidateCache(testUri);
    invalidateCache('file:///test/a.pike');
    invalidateCache('file:///test/b.pike');
  });

  describe('detectRoxenModule', () => {
    it('should return null when bridge confirms not a Roxen module', async () => {
      const code = 'int add(int a, int b) { return a + b; }';
      const bridge = createMockBridge(nonRoxenModuleInfo);
      const result = await detectRoxenModule(code, testUri, bridge);
      assert.strictEqual(result, null, 'Should return null for non-Roxen code');
    });

    it('should return null for code with only comments', async () => {
      const code = '\n        // This is a comment\n        /* Multi-line comment */\n      ';
      const bridge = createMockBridge(nonRoxenModuleInfo);
      const result = await detectRoxenModule(code, testUri, bridge);
      assert.strictEqual(result, null, 'Should return null for comments only');
    });

    it('should return null for empty code', async () => {
      const code = '';
      const bridge = createMockBridge(nonRoxenModuleInfo);
      const result = await detectRoxenModule(code, testUri, bridge);
      assert.strictEqual(result, null, 'Should return null for empty code');
    });

    it('should call bridge when inherit "module" marker present', async () => {
      const code = 'inherit "module";';
      const bridge = createMockBridge(roxenModuleInfo);
      const result = await detectRoxenModule(code, testUri, bridge);
      assert.strictEqual(result?.is_roxen_module, 1, 'Should return module info when confirmed');
    });

    it("should call bridge when inherit 'module' marker present", async () => {
      const code = "inherit 'module';";
      const bridge = createMockBridge(roxenModuleInfo);
      const result = await detectRoxenModule(code, testUri, bridge);
      assert.strictEqual(result?.is_roxen_module, 1);
    });

    it('should call bridge when inherit "roxen" marker present', async () => {
      const code = 'inherit "roxen";';
      const bridge = createMockBridge(roxenModuleInfo);
      const result = await detectRoxenModule(code, testUri, bridge);
      assert.strictEqual(result?.is_roxen_module, 1);
    });

    it('should call bridge when inherit "filesystem" marker present', async () => {
      const code = 'inherit "filesystem";';
      const bridge = createMockBridge(roxenModuleInfo);
      const result = await detectRoxenModule(code, testUri, bridge);
      assert.strictEqual(result?.is_roxen_module, 1);
    });

    it('should call bridge when #include <module.h> marker present', async () => {
      const code = '#include <module.h>';
      const bridge = createMockBridge(roxenModuleInfo);
      const result = await detectRoxenModule(code, testUri, bridge);
      assert.strictEqual(result?.is_roxen_module, 1);
    });

    it('should call bridge when #include "module.h" marker present', async () => {
      const code = '#include "module.h"';
      const bridge = createMockBridge(roxenModuleInfo);
      const result = await detectRoxenModule(code, testUri, bridge);
      assert.strictEqual(result?.is_roxen_module, 1);
    });

    it('should call bridge when constant module_type = MODULE_* present', async () => {
      const code = 'constant module_type = MODULE_TAG;';
      const bridge = createMockBridge(roxenModuleInfo);
      const result = await detectRoxenModule(code, testUri, bridge);
      assert.strictEqual(result?.is_roxen_module, 1);
    });

    it('should call bridge when constant int module_type = MODULE_* present', async () => {
      const code = 'constant int module_type = MODULE_LOCATION;';
      const bridge = createMockBridge(roxenModuleInfo);
      const result = await detectRoxenModule(code, testUri, bridge);
      assert.strictEqual(result?.is_roxen_module, 1);
    });

    it('should call bridge when register_module( present', async () => {
      const code = 'register_module(MyModule);';
      const bridge = createMockBridge(roxenModuleInfo);
      const result = await detectRoxenModule(code, testUri, bridge);
      assert.strictEqual(result?.is_roxen_module, 1);
    });

    it('should return null when bridge confirms not a Roxen module (marker present)', async () => {
      const code = 'inherit "module";';
      const bridge = createMockBridge(nonRoxenModuleInfo);
      const result = await detectRoxenModule(code, 'file:///test/non-roxen.pike', bridge);
      assert.strictEqual(result, null, 'Should return null when is_roxen_module is 0');
    });

    it('should handle bridge errors gracefully', async () => {
      const code = 'inherit "module";';
      const bridge: RoxenDetectorBridge = {
        roxenDetect: async () => {
          throw new Error('Bridge error');
        },
      };
      const result = await detectRoxenModule(code, 'file:///test/error.pike', bridge);
      assert.strictEqual(result, null, 'Should return null on bridge error');
    });

    it('should cache results for same URI', async () => {
      const code = 'inherit "module";';
      const cacheUri = 'file:///test/cache-test.pike';
      let callCount = 0;
      const bridge: RoxenDetectorBridge = {
        roxenDetect: async () => {
          callCount++;
          return roxenModuleInfo;
        },
      };

      const result1 = await detectRoxenModule(code, cacheUri, bridge);
      const result2 = await detectRoxenModule(code, cacheUri, bridge);

      assert.strictEqual(callCount, 1, 'Bridge should only be called once');
      assert.strictEqual(result1?.is_roxen_module, 1);
      assert.strictEqual(result2?.is_roxen_module, 1);
      invalidateCache(cacheUri);
    });

    it('should not cache across different URIs', async () => {
      const code = 'inherit "module";';
      let callCount = 0;
      const bridge: RoxenDetectorBridge = {
        roxenDetect: async () => {
          callCount++;
          return roxenModuleInfo;
        },
      };

      await detectRoxenModule(code, 'file:///test/a.pike', bridge);
      await detectRoxenModule(code, 'file:///test/b.pike', bridge);

      assert.strictEqual(callCount, 2, 'Bridge should be called for each unique URI');
    });
  });

  describe('invalidateCache', () => {
    it('should clear cache for specified URI', async () => {
      const code = 'inherit "module";';
      const invalidateTestUri = 'file:///test/invalidate-test.pike';
      let callCount = 0;
      const bridge: RoxenDetectorBridge = {
        roxenDetect: async () => {
          callCount++;
          return roxenModuleInfo;
        },
      };

      await detectRoxenModule(code, invalidateTestUri, bridge);
      invalidateCache(invalidateTestUri);
      await detectRoxenModule(code, invalidateTestUri, bridge);

      assert.strictEqual(callCount, 2, 'Bridge should be called again after cache invalidation');
    });

    it('should handle invalidating non-cached URI gracefully', () => {
      assert.doesNotThrow(() => invalidateCache('file:///nonexistent.pike'));
    });
  });

  // --- isRoxenModule: single source of truth for all detection patterns ---

  describe('isRoxenModule', () => {
    it('returns false for plain Pike code', () => {
      assert.strictEqual(isRoxenModule('int x = 1; string s = "hello";'), false);
    });

    it('returns false for empty string', () => {
      assert.strictEqual(isRoxenModule(''), false);
    });

    // --- Inheritance markers ---
    it('detects inherit "module"', () => {
      assert.strictEqual(isRoxenModule('inherit "module";'), true);
    });

    it("detects inherit 'module'", () => {
      assert.strictEqual(isRoxenModule("inherit 'module';"), true);
    });

    it('detects inherit "roxen"', () => {
      assert.strictEqual(isRoxenModule('inherit "roxen";'), true);
    });

    it('detects inherit "filesystem"', () => {
      assert.strictEqual(isRoxenModule('inherit "filesystem";'), true);
    });

    // --- Whitespace between inherit and string (KB-1641: no longer matched) ---
    it('does NOT detect inherit  "module" with extra whitespace (KB-1641)', () => {
      // INHERIT_RE used to match inherit\s+"module" via regex; now uses exact includes()
      assert.strictEqual(isRoxenModule('inherit  "module"'), false);
    });

    it('does NOT detect inherit\t"module" with tab whitespace (KB-1641)', () => {
      assert.strictEqual(isRoxenModule('inherit\t"module"'), false);
    });

    it('does NOT detect inherit with large gap (KB-1641)', () => {
      assert.strictEqual(isRoxenModule('inherit   "roxen"'), false);
    });

    // --- Symbol-based inherit detection (KB-1641) ---
    it('detects inherit "module" via symbol kind=inherit classname=module', () => {
      const symbols: PikeSymbol[] = [
        { kind: 'inherit', classname: 'module', name: 'module', line: 1, character: 0 },
      ];
      assert.strictEqual(isRoxenModule('int x = 1;', symbols), true);
    });

    it('detects inherit "roxen" via symbol', () => {
      const symbols: PikeSymbol[] = [
        { kind: 'inherit', classname: 'roxen', name: 'roxen', line: 1, character: 0 },
      ];
      assert.strictEqual(isRoxenModule('int x = 1;', symbols), true);
    });

    it('detects inherit "filesystem" via symbol', () => {
      const symbols: PikeSymbol[] = [
        { kind: 'inherit', classname: 'filesystem', name: 'filesystem', line: 1, character: 0 },
      ];
      assert.strictEqual(isRoxenModule('int x = 1;', symbols), true);
    });

    it('ignores inherit of non-roxen class via symbol', () => {
      const symbols: PikeSymbol[] = [
        { kind: 'inherit', classname: 'string', name: 'string', line: 1, character: 0 },
      ];
      assert.strictEqual(isRoxenModule('int x = 1;', symbols), false);
    });

    it('ignores inherit with missing classname', () => {
      const symbols: PikeSymbol[] = [{ kind: 'inherit', name: 'something', line: 1, character: 0 }];
      assert.strictEqual(isRoxenModule('int x = 1;', symbols), false);
    });

    it('does not false-positive on inherit in comments (KB-1641)', () => {
      // The regex used to match inherit in comments; now hasMarkers only checks includes()
      // which still matches raw text, but callers pass symbols which are parse-aware
      assert.strictEqual(isRoxenModule('// TODO: consider inherit "module"'), true);
      // With parse-aware symbols, the comment-inherit is NOT a symbol:
      const symbols: PikeSymbol[] = [];
      assert.strictEqual(isRoxenModule('// TODO: consider inherit "module"', symbols), true);
    });
    // --- Include markers ---
    it('detects #include <module.h>', () => {
      assert.strictEqual(isRoxenModule('#include <module.h>'), true);
    });

    it('detects #include "module.h"', () => {
      assert.strictEqual(isRoxenModule('#include "module.h"'), true);
    });

    // --- module_type declaration ---
    it('detects module_type = MODULE_*', () => {
      assert.strictEqual(isRoxenModule('constant module_type = MODULE_TAG;'), true);
    });

    it('detects standalone MODULE_ constant', () => {
      assert.strictEqual(isRoxenModule('constant x = MODULE_LOCATION;'), true);
    });

    // --- register_module() call ---
    it('detects register_module(...)', () => {
      assert.strictEqual(isRoxenModule('register_module("Test|Module");'), true);
    });

    it('rejects register_module_without paren', () => {
      // Word boundary check: register_moduleX should not match
      assert.strictEqual(isRoxenModule('register_moduleExtra;'), false);
    });

    // --- Roxen metadata constants (ID_DEFINED, ID_RUNTIME, VERSION_) ---
    it('detects ID_DEFINED constant', () => {
      assert.strictEqual(isRoxenModule('constant id = ID_DEFINED;'), true);
    });

    it('detects ID_RUNTIME constant', () => {
      assert.strictEqual(isRoxenModule('constant id = ID_RUNTIME;'), true);
    });

    it('detects VERSION_ constant', () => {
      assert.strictEqual(isRoxenModule('constant v = VERSION_MAJOR;'), true);
    });

    // --- Symbol-based detection (register_ prefix) ---
    it('detects register_ prefixed symbols', () => {
      const symbols: PikeSymbol[] = [
        { name: 'register_tag', kind: 'method', line: 1, character: 0 },
      ];
      assert.strictEqual(isRoxenModule('void foo() {}', symbols), true);
    });

    it('ignores non-register_ symbols', () => {
      const symbols: PikeSymbol[] = [{ name: 'find_tag', kind: 'method', line: 1, character: 0 }];
      assert.strictEqual(isRoxenModule('void foo() {}', symbols), false);
    });

    it('detects register_ in child symbols', () => {
      const symbols: PikeSymbol[] = [
        {
          name: 'MyModule',
          kind: 'class',
          line: 1,
          character: 0,
          children: [{ name: 'register_tags', kind: 'method', line: 5, character: 2 }],
        },
      ];
      assert.strictEqual(isRoxenModule('class MyModule {}', symbols), true);
    });

    // --- Combined: text marker takes priority ---
    it('text markers work without symbols', () => {
      assert.strictEqual(isRoxenModule('inherit "module";'), true);
    });

    it('symbols supplement text scanning', () => {
      const symbols: PikeSymbol[] = [
        { name: 'register_provider', kind: 'method', line: 1, character: 0 },
      ];
      assert.strictEqual(isRoxenModule('void init() {}', symbols), true);
    });
  });
});
