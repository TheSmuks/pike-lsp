import assert from 'node:assert';
import { enhanceRoxenSymbols } from '../../../features/roxen/symbols';
import type { DocumentSymbol } from 'vscode-languageserver/node.js';
import type { RoxenModuleInfo } from '@pike-lsp/pike-bridge/dist/src/types.js';

describe('Roxen Symbols - enhanceRoxenSymbols', () => {
  const baseSymbols = [
    {
      name: 'TestModule',
      kind: 5,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 10, character: 0 },
      },
      selectionRange: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 10 },
      },
      children: [],
    },
  ];

  test('null moduleInfo -> returns base symbols unchanged', () => {
    const result = enhanceRoxenSymbols(baseSymbols, null);

    assert.strictEqual(result, baseSymbols, 'Should return same symbols reference');
    assert.deepStrictEqual(result, baseSymbols, 'Should not modify symbols');
  });

  test('is_roxen_module=0 -> returns base symbols unchanged', () => {
    const moduleInfo: RoxenModuleInfo = {
      is_roxen_module: 0,
      module_type: ['module'],
      module_name: 'TestModule',
      inherits: [],
      variables: [],
      tags: [],
      lifecycle: { has_create: 0, has_start: 0, has_stop: 0 },
    };

    const result = enhanceRoxenSymbols(baseSymbols, moduleInfo);

    assert.deepStrictEqual(result, baseSymbols, 'Should not enhance non-Roxen modules');
  });

  test('with variables -> adds "Module Variables" group', () => {
    const moduleInfo: RoxenModuleInfo = {
      is_roxen_module: 1,
      module_type: ['module'],
      module_name: 'TestModule',
      inherits: [],
      variables: [{ name: 'var1', type: 'string', position: { line: 5, column: 4 } }],
      tags: [],
      lifecycle: { has_create: 0, has_start: 0, has_stop: 0 },
    };

    const result = enhanceRoxenSymbols(baseSymbols, moduleInfo);

    assert.ok(result[0].children, 'Should have children');
    const variablesGroup = result[0].children?.find(c => c.name === 'Module Variables');
    assert.ok(variablesGroup, 'Should have "Module Variables" group');
    assert.ok(variablesGroup?.children, 'Variables group should have children');
  });

  test('with tags -> adds "RXML Tags" group', () => {
    const moduleInfo: RoxenModuleInfo = {
      is_roxen_module: 1,
      module_type: ['module'],
      module_name: 'TestModule',
      inherits: [],
      variables: [],
      tags: [{ name: 'tag1', has_container: 0, position: { line: 3, column: 4 } }],
      lifecycle: { has_create: 0, has_start: 0, has_stop: 0 },
    };

    const result = enhanceRoxenSymbols(baseSymbols, moduleInfo);

    assert.ok(result[0].children, 'Should have children');
    const tagsGroup = result[0].children?.find(c => c.name === 'RXML Tags');
    assert.ok(tagsGroup, 'Should have "RXML Tags" group');
  });

  test('All symbols have selectionRange property', () => {
    const moduleInfo: RoxenModuleInfo = {
      is_roxen_module: 1,
      module_type: ['module'],
      module_name: 'TestModule',
      inherits: [],
      variables: [{ name: 'var1', type: 'string', position: { line: 5, column: 4 } }],
      tags: [],
      lifecycle: { has_create: 0, has_start: 0, has_stop: 0 },
    };

    const result = enhanceRoxenSymbols(baseSymbols, moduleInfo);

    // Check all symbols have selectionRange
    const checkSelectionRange = (symbols: DocumentSymbol[]) => {
      for (const symbol of symbols) {
        assert.ok(symbol.selectionRange, `Symbol ${symbol.name} missing selectionRange`);
        if (symbol.children) {
          checkSelectionRange(symbol.children);
        }
      }
    };

    checkSelectionRange(result);
  });

  test('Variable positions use real line numbers from Pike', () => {
    const moduleInfo: RoxenModuleInfo = {
      is_roxen_module: 1,
      module_type: ['module'],
      module_name: 'TestModule',
      inherits: [],
      variables: [
        { name: 'var1', type: 'string', position: { line: 5, column: 4 } },
        { name: 'var2', type: 'int', position: { line: 10, column: 4 } },
      ],
      tags: [],
      lifecycle: { has_create: 0, has_start: 0, has_stop: 0 },
    };

    const result = enhanceRoxenSymbols(baseSymbols, moduleInfo);

    const variablesGroup = result[0].children?.find(c => c.name === 'Module Variables');
    assert.ok(variablesGroup?.children);

    // var1 at line 5 -> LSP line 4
    const var1 = variablesGroup.children.find((c: any) => c.name === 'var1');
    assert.strictEqual(var1.range.start.line, 4, 'var1 should be at LSP line 4');
    assert.strictEqual(var1.range.start.character, 3, 'var1 should be at LSP char 3');

    // var2 at line 10 -> LSP line 9
    const var2 = variablesGroup.children.find((c: any) => c.name === 'var2');
    assert.strictEqual(var2.range.start.line, 9, 'var2 should be at LSP line 9');
  });

  test('selectionRange is contained in range for all generated symbols', () => {
    const moduleInfo: RoxenModuleInfo = {
      is_roxen_module: 1,
      module_type: ['module'],
      module_name: 'TestModule',
      inherits: [],
      variables: [{ name: 'var1', type: 'string', position: { line: 5, column: 4 } }],
      tags: [{ name: 'tag1', has_container: 0, position: { line: 8, column: 10 } }],
      lifecycle: { has_create: 0, has_start: 0, has_stop: 0 },
    };

    const result = enhanceRoxenSymbols(baseSymbols, moduleInfo);

    const positionGte = (
      left: { line: number; character: number },
      right: { line: number; character: number }
    ): boolean => {
      return (
        left.line > right.line || (left.line === right.line && left.character >= right.character)
      );
    };

    const validateRanges = (symbols: ReturnType<typeof enhanceRoxenSymbols>): void => {
      for (const symbol of symbols) {
        assert.ok(
          positionGte(symbol.selectionRange.start, symbol.range.start),
          `${symbol.name}: selectionRange.start must be >= range.start`
        );
        assert.ok(
          positionGte(symbol.range.end, symbol.selectionRange.end),
          `${symbol.name}: selectionRange.end must be <= range.end`
        );

        if (symbol.children) {
          validateRanges(symbol.children);
        }
      }
    };

    validateRanges(result);
  });
});

describe('Roxen Symbols - enhanceRoxenSymbols edge cases', () => {
  const baseSymbols = [
    {
      name: 'TestModule',
      kind: 5,
      range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
      selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
      children: [],
    },
  ];

  const roxenModule: RoxenModuleInfo = {
    is_roxen_module: 1,
    module_type: ['module'],
    module_name: 'TestModule',
    inherits: [],
    variables: [
      {
        name: 'v',
        type: 'string',
        name_string: 'v',
        doc_str: '',
        position: { file: 'test.pike', line: 5, column: 4 },
      },
    ],
    tags: [
      { name: 't', type: 'simple', position: { file: 'test.pike', line: 3, column: 2 }, args: [] },
    ],
    lifecycle: {
      callbacks: [],
      has_create: 0,
      has_start: 0,
      has_stop: 0,
      has_status: 0,
      missing_required: [],
    },
  };

  test('empty base symbols with roxen moduleInfo still produces roxen container', () => {
    const result = enhanceRoxenSymbols([], roxenModule);
    assert.strictEqual(result.length, 1, 'Should have roxen container only');
    assert.strictEqual(result[0].name, 'Roxen Module');
  });

  test('null moduleInfo with empty base symbols returns empty array', () => {
    const result = enhanceRoxenSymbols([], null);
    assert.deepStrictEqual(result, [], 'null moduleInfo returns base symbols unchanged');
  });

  test('undefined variables and tags fields are treated as absent (code guards)', () => {
    // The type says variables/tags are required, but the code guards anyway.
    // Cast to any to simulate runtime data that doesn't match the type.
    const info = {
      ...roxenModule,
      variables: undefined,
      tags: undefined,
    } as unknown as RoxenModuleInfo;
    const result = enhanceRoxenSymbols(baseSymbols, info);

    assert.strictEqual(result.length, 2, 'Should have roxen container + base symbol');
    const roxen = result[0];
    assert.strictEqual(roxen.name, 'Roxen Module');
    assert.strictEqual(roxen.children!.length, 0, 'Should have no variable or tag groups');
  });

  test('empty variables array does not create Module Variables group', () => {
    const info = { ...roxenModule, variables: [] };
    const result = enhanceRoxenSymbols(baseSymbols, info);

    const roxen = result[0];
    assert.strictEqual(roxen.name, 'Roxen Module');
    assert.ok(!roxen.children?.some(c => c.name === 'Module Variables'));
  });

  test('empty tags array does not create RXML Tags group', () => {
    const info = { ...roxenModule, tags: [] };
    const result = enhanceRoxenSymbols(baseSymbols, info);

    const roxen = result[0];
    assert.strictEqual(roxen.name, 'Roxen Module');
    assert.ok(!roxen.children?.some(c => c.name === 'RXML Tags'));
  });

  test('variable with missing position falls back to line=0, column=0 via default 1-1=0', () => {
    const info = {
      ...roxenModule,
      variables: [
        {
          name: 'no_pos',
          type: 'string',
          name_string: '',
          doc_str: '',
          position: undefined as any,
        },
      ],
      tags: [],
    } as unknown as RoxenModuleInfo;

    const result = enhanceRoxenSymbols(baseSymbols, info);
    const varGroup = result[0].children?.find(c => c.name === 'Module Variables');
    assert.ok(varGroup);
    const v = varGroup.children![0];
    // position?.line ?? 1 - 1 = 0
    assert.strictEqual(v.range.start.line, 0, 'Should default to line 0');
    assert.strictEqual(v.range.start.character, 0, 'Should default to column 0');
  });

  test('variable with position line=0 clamps to 0 via Math.max guard (not -1)', () => {
    const info = {
      ...roxenModule,
      variables: [
        {
          name: 'zero_line',
          type: 'int',
          name_string: '',
          doc_str: '',
          position: { file: '', line: 0, column: 1 },
        },
      ],
      tags: [],
    };

    const result = enhanceRoxenSymbols(baseSymbols, info);
    const v = result[0].children![0].children![0];
    // Math.max(0, 0 - 1) = Math.max(0, -1) = 0
    assert.strictEqual(
      v.range.start.line,
      0,
      'line=0 input should clamp to 0, not underflow to -1'
    );
    assert.strictEqual(v.range.start.character, 0, 'column=1-1=0');
  });

  test('variable with position column=0 clamps to 0 via Math.max guard', () => {
    const info = {
      ...roxenModule,
      variables: [
        {
          name: 'zero_col',
          type: 'int',
          name_string: '',
          doc_str: '',
          position: { file: '', line: 1, column: 0 },
        },
      ],
      tags: [],
    };

    const result = enhanceRoxenSymbols(baseSymbols, info);
    const v = result[0].children![0].children![0];
    // Math.max(0, 0 - 1) = 0
    assert.strictEqual(v.range.start.character, 0, 'column=0 input should clamp to 0');
    assert.strictEqual(v.range.start.line, 0, 'line=1-1=0');
  });

  test('tag with undefined column uses default fallback 1-1=0', () => {
    const info = {
      ...roxenModule,
      variables: [],
      tags: [{ name: 'no_col', type: 'simple', position: { file: '', line: 3 }, args: [] }],
    };

    const result = enhanceRoxenSymbols(baseSymbols, info);
    const t = result[0].children![0].children![0];
    // position?.column ?? 1 - 1 = 0
    assert.strictEqual(t.range.start.line, 2, 'line=3-1=2');
    assert.strictEqual(t.range.start.character, 0, 'undefined column should default to 0');
  });

  test('large line and column values convert correctly', () => {
    const info = {
      ...roxenModule,
      variables: [
        {
          name: 'big',
          type: 'string',
          name_string: '',
          doc_str: '',
          position: { file: '', line: 99999, column: 500 },
        },
      ],
      tags: [],
    };

    const result = enhanceRoxenSymbols(baseSymbols, info);
    const v = result[0].children![0].children![0];
    assert.strictEqual(v.range.start.line, 99998);
    assert.strictEqual(v.range.start.character, 499);
  });

  test('both variables and tags present creates both groups', () => {
    const result = enhanceRoxenSymbols(baseSymbols, roxenModule);

    const roxen = result[0];
    assert.strictEqual(roxen.children!.length, 2);
    assert.ok(roxen.children!.some(c => c.name === 'Module Variables'));
    assert.ok(roxen.children!.some(c => c.name === 'RXML Tags'));
  });

  test('variable with both line=0 and column=0 clamps both to 0', () => {
    const info = {
      ...roxenModule,
      variables: [
        {
          name: 'origin',
          type: 'string',
          name_string: '',
          doc_str: '',
          position: { file: '', line: 0, column: 0 },
        },
      ],
      tags: [],
    };

    const result = enhanceRoxenSymbols(baseSymbols, info);
    const v = result[0].children![0].children![0];
    // Math.max(0, 0 - 1) = 0 for both
    assert.strictEqual(v.range.start.line, 0, 'line=0 should not underflow');
    assert.strictEqual(v.range.start.character, 0, 'column=0 should not underflow');
  });
});
