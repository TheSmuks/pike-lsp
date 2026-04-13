/**
 * Roxen Configuration File Support Tests
 *
 * Tests for parsing, validation, and completion of Roxen module configuration.
 * All tests use bridge/parser API (symbols, tokens, inherits) — no source-text scanning.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import {
  parseRoxenConfig,
  validateRoxenConfig,
  getRoxenConfigCompletions,
  getDefvarCompletions,
  isInDefvarContext,
  type RoxenConfig,
  type BridgeParseInput,
} from '../../../features/roxen/config.js';
import type { PikeSymbol, PikeToken } from '@pike-lsp/pike-bridge';

/** Helper: build tokens for a single defvar call. */
function defvarTokens(
  name: string,
  displayName: string,
  type: string,
  doc: string,
  flags: string,
  line = 1
): PikeToken[] {
  return [
    { text: 'defvar', line, character: 0, file: 0 },
    { text: '(', line, character: 6, file: 0 },
    { text: '"', line, character: 7, file: 0 },
    { text: name, line, character: 8, file: 0 },
    { text: '"', line, character: 8 + name.length, file: 0 },
    { text: ',', line, character: 8 + name.length + 1, file: 0 },
    { text: '"', line, character: 0, file: 0 },
    { text: displayName, line, character: 0, file: 0 },
    { text: '"', line, character: 0, file: 0 },
    { text: ',', line, character: 0, file: 0 },
    { text: type, line, character: 0, file: 0 },
    { text: ',', line, character: 0, file: 0 },
    { text: '"', line, character: 0, file: 0 },
    { text: doc, line, character: 0, file: 0 },
    { text: '"', line, character: 0, file: 0 },
    { text: ',', line, character: 0, file: 0 },
    { text: flags, line, character: 0, file: 0 },
    { text: ')', line, character: 0, file: 0 },
  ];
}

/** Helper: module_type constant symbol. */
function moduleTypeSymbol(value: string): PikeSymbol {
  return {
    kind: 'constant',
    name: 'module_type',
    modifiers: [],
    type: {
      kind: 'name' as const,
      name: value,
    } as unknown as import('@pike-lsp/pike-bridge').PikeType,
  };
}

describe('Roxen Configuration Parser', () => {
  it('should detect inherit "module" from bridge cache', () => {
    const result = parseRoxenConfig('inherit "module";', { inherits: [{ path: 'module' }] });
    assert.strictEqual(result.isInheritModule, true, 'Should detect module inherit');
  });

  it('should detect inherit "roxen" from bridge cache', () => {
    const result = parseRoxenConfig('inherit "roxen";', { inherits: [{ path: 'roxen' }] });
    assert.strictEqual(result.isInheritModule, true, 'Should detect roxen inherit');
  });

  it('should detect inherit via single-quoted path', () => {
    const result = parseRoxenConfig("inherit 'module';", { inherits: [{ path: 'module' }] });
    assert.strictEqual(result.isInheritModule, true, 'Should detect single quote inherit');
  });

  it('should parse constant module_type = MODULE_TAG via symbols', () => {
    const result = parseRoxenConfig('constant module_type = MODULE_TAG;', {
      symbols: [moduleTypeSymbol('MODULE_TAG')],
    });
    assert.strictEqual(result.moduleType, 'MODULE_TAG', 'Should extract module type');
  });

  it('should parse defvar with all components via tokens', () => {
    const tokens = defvarTokens('myvar', 'My Variable', 'TYPE_STRING', 'Documentation', '0');
    const result = parseRoxenConfig(
      'defvar("myvar", "My Variable", TYPE_STRING, "Documentation", 0);',
      { tokens }
    );

    assert.strictEqual(result.defvars.length, 1, 'Should parse one defvar');
    const defvar = result.defvars[0]!;
    assert.strictEqual(defvar.name, 'myvar');
    assert.strictEqual(defvar.displayName, 'My Variable');
    assert.strictEqual(defvar.type, 'TYPE_STRING');
    assert.strictEqual(defvar.documentation, 'Documentation');
    assert.strictEqual(defvar.flags, 0);
  });

  it('should parse multiple defvar declarations via tokens', () => {
    const tokens: PikeToken[] = [
      ...defvarTokens('var1', 'Variable 1', 'TYPE_STRING', 'Doc 1', '0', 1),
      { text: ';', line: 1, character: 0, file: 0 },
      ...defvarTokens('var2', 'Variable 2', 'TYPE_INT', 'Doc 2', 'VAR_EXPERT', 2),
      { text: ';', line: 2, character: 0, file: 0 },
      ...defvarTokens('var3', 'Variable 3', 'TYPE_FLAG', 'Doc 3', 'VAR_MORE', 3),
      { text: ';', line: 3, character: 0, file: 0 },
    ];
    const result = parseRoxenConfig('', { tokens });
    assert.strictEqual(result.defvars.length, 3, 'Should parse three defvars');
    assert.strictEqual(result.defvars[0]!.name, 'var1');
    assert.strictEqual(result.defvars[1]!.name, 'var2');
    assert.strictEqual(result.defvars[2]!.name, 'var3');
  });

  it('should parse defvar with VAR_* flags via tokens', () => {
    const tokens = defvarTokens('secret', 'Secret', 'TYPE_PASSWORD', 'Hidden', 'VAR_EXPERT');
    const result = parseRoxenConfig('', { tokens });
    assert.strictEqual(result.defvars.length, 1, 'Should parse defvar with flags');
  });

  it('should parse complete Roxen module structure with bridge data', () => {
    const tokens: PikeToken[] = [
      ...defvarTokens('enabled', 'Enabled', 'TYPE_FLAG', 'Enable this tag', '0', 4),
      { text: ';', line: 4, character: 0, file: 0 },
      ...defvarTokens('timeout', 'Timeout', 'TYPE_INT', 'Timeout in seconds', 'VAR_EXPERT', 5),
      { text: ';', line: 5, character: 0, file: 0 },
    ];
    const result = parseRoxenConfig('', {
      inherits: [{ path: 'module' }],
      symbols: [moduleTypeSymbol('MODULE_TAG')],
      tokens,
    });

    assert.strictEqual(result.isInheritModule, true, 'Should detect inherit');
    assert.strictEqual(result.moduleType, 'MODULE_TAG', 'Should extract module type');
    assert.strictEqual(result.defvars.length, 2, 'Should parse two defvars');
  });
});

describe('Roxen Configuration Validation', () => {
  it('should return empty diagnostics for valid config', () => {
    const tokens = defvarTokens('x', 'X', 'TYPE_STRING', 'Doc', '0');
    const result = validateRoxenConfig('', { tokens });
    assert.strictEqual(result.length, 0, 'Should have no errors');
  });

  it('should error on unknown TYPE constant via tokens', () => {
    const tokens = defvarTokens('x', 'X', 'TYPE_INVALID', 'Doc', '0');
    const result = validateRoxenConfig('', { tokens });
    assert.ok(result.length > 0, 'Should have errors');
    assert.ok(result[0]!.message.includes('TYPE_INVALID'), 'Should mention invalid type');
  });

  it('should warn when module has inherit but no module_type', () => {
    const result = validateRoxenConfig('', { inherits: [{ path: 'module' }] });
    assert.ok(
      result.some(d => d.message.includes('module_type')),
      'Should warn about missing module_type'
    );
  });

  it('should not warn when module has both inherit and module_type', () => {
    const result = validateRoxenConfig('', {
      inherits: [{ path: 'module' }],
      symbols: [moduleTypeSymbol('MODULE_TAG')],
    });
    assert.ok(
      !result.some(d => d.message.includes('module_type')),
      'Should not warn about module_type when present'
    );
  });
});

describe('Roxen Configuration Completions', () => {
  it('should return defvar snippet when typing defvar(', () => {
    const result = getRoxenConfigCompletions('defvar(', { line: 0, character: 7 });
    assert.ok(result !== null, 'Should return completions');
    assert.ok(
      result!.some(item => item.label === 'defvar'),
      'Should include defvar snippet'
    );
  });

  it('should return TYPE_* completions after TYPE_ prefix', () => {
    const result = getRoxenConfigCompletions('defvar("x", "X", TYPE_', { line: 0, character: 20 });
    assert.ok(result !== null, 'Should return completions');
    assert.ok(
      result!.some(item => item.label === 'TYPE_STRING'),
      'Should include TYPE_STRING'
    );
    assert.ok(
      result!.some(item => item.label === 'TYPE_INT'),
      'Should include TYPE_INT'
    );
    assert.ok(
      result!.some(item => item.label === 'TYPE_FLAG'),
      'Should include TYPE_FLAG'
    );
  });

  it('should return MODULE_* completions after MODULE_ prefix', () => {
    const result = getRoxenConfigCompletions('constant module_type = MODULE_', {
      line: 0,
      character: 28,
    });
    assert.ok(result !== null, 'Should return completions');
    assert.ok(
      result!.some(item => item.label === 'MODULE_TAG'),
      'Should include MODULE_TAG'
    );
    assert.ok(
      result!.some(item => item.label === 'MODULE_LOCATION'),
      'Should include MODULE_LOCATION'
    );
    assert.ok(
      result!.some(item => item.label === 'MODULE_FILTER'),
      'Should include MODULE_FILTER'
    );
  });

  it('should return VAR_* completions after VAR_ prefix', () => {
    const result = getRoxenConfigCompletions('defvar("x", "X", TYPE_STRING, "Doc", VAR_', {
      line: 0,
      character: 40,
    });
    assert.ok(result !== null, 'Should return completions');
    assert.ok(
      result!.some(item => item.label === 'VAR_EXPERT'),
      'Should include VAR_EXPERT'
    );
    assert.ok(
      result!.some(item => item.label === 'VAR_MORE'),
      'Should include VAR_MORE'
    );
    assert.ok(
      result!.some(item => item.label === 'VAR_DEVELOPER'),
      'Should include VAR_DEVELOPER'
    );
  });

  it('should return null for non-Roxen context', () => {
    const result = getRoxenConfigCompletions('int x = 42;', { line: 0, character: 10 });
    assert.strictEqual(result, null, 'Should return null for non-Roxen code');
  });

  it('defvar snippet should include TYPE choices', () => {
    const completions = getDefvarCompletions();
    const defvarSnippet = completions.find(c => c.label === 'defvar');
    assert.ok(defvarSnippet, 'Should have defvar snippet');
    assert.ok(
      defvarSnippet!.insertText!.includes('${3|'),
      'Should include snippet choices for TYPE'
    );
  });
});

describe('Context Detection', () => {
  it('should detect defvar context when cursor after defvar', () => {
    assert.strictEqual(
      isInDefvarContext('defvar("x", "X", TYPE_', 20),
      true,
      'Should be in defvar context'
    );
  });

  it('should not detect defvar context when defvar not present', () => {
    assert.strictEqual(
      isInDefvarContext('int x = 42;', 5),
      false,
      'Should not be in defvar context'
    );
  });

  it('should not detect defvar context when cursor before defvar', () => {
    assert.strictEqual(
      isInDefvarContext('  defvar("x"', 2),
      false,
      'Should not be in defvar context before keyword'
    );
  });
});

describe('Integration: Complete Module Parsing', () => {
  it('should parse a realistic Roxen tag module', () => {
    const tokens: PikeToken[] = [
      ...defvarTokens('attr1', 'Attribute 1', 'TYPE_STRING', 'Description of attribute 1', '0', 1),
      { text: ';', line: 1, character: 0, file: 0 },
      ...defvarTokens(
        'attr2',
        'Attribute 2',
        'TYPE_INT',
        'Description of attribute 2',
        'VAR_EXPERT',
        2
      ),
      { text: ';', line: 2, character: 0, file: 0 },
      ...defvarTokens('enabled', 'Enable', 'TYPE_FLAG', 'Enable this tag', '0', 3),
      { text: ';', line: 3, character: 0, file: 0 },
    ];
    const result = parseRoxenConfig('', {
      inherits: [{ path: 'module' }],
      symbols: [moduleTypeSymbol('MODULE_TAG')],
      tokens,
    });

    assert.strictEqual(result.isInheritModule, true);
    assert.strictEqual(result.moduleType, 'MODULE_TAG');
    assert.strictEqual(result.defvars.length, 3);

    const attr1 = result.defvars.find(d => d.name === 'attr1');
    assert.ok(attr1, 'Should find attr1');
    assert.strictEqual(attr1!.type, 'TYPE_STRING');
    assert.strictEqual(attr1!.flags, 0);

    const attr2 = result.defvars.find(d => d.name === 'attr2');
    assert.ok(attr2, 'Should find attr2');
    assert.strictEqual(attr2!.type, 'TYPE_INT');
  });

  it('should parse a Roxen filesystem module', () => {
    const tokens: PikeToken[] = [
      ...defvarTokens(
        'mountpoint',
        'Mount Point',
        'TYPE_STRING',
        'Where to mount this filesystem',
        '0',
        1
      ),
      { text: ';', line: 1, character: 0, file: 0 },
      ...defvarTokens(
        'root',
        'Root Directory',
        'TYPE_DIR',
        'Root directory for files',
        'VAR_EXPERT',
        2
      ),
      { text: ';', line: 2, character: 0, file: 0 },
    ];
    const result = parseRoxenConfig('', {
      inherits: [{ path: 'module' }, { path: 'filesystem' }],
      symbols: [moduleTypeSymbol('MODULE_LOCATION')],
      tokens,
    });

    assert.strictEqual(result.isInheritModule, true);
    assert.strictEqual(result.moduleType, 'MODULE_LOCATION');
    assert.strictEqual(result.defvars.length, 2);

    const mountpoint = result.defvars.find(d => d.name === 'mountpoint');
    assert.ok(mountpoint, 'Should find mountpoint');
    assert.strictEqual(mountpoint!.type, 'TYPE_STRING');

    const root = result.defvars.find(d => d.name === 'root');
    assert.ok(root, 'Should find root');
    assert.strictEqual(root!.type, 'TYPE_DIR');
  });

  it('should parse a Roxen filter module', () => {
    const tokens: PikeToken[] = [
      ...defvarTokens('pattern', 'Pattern', 'TYPE_STRING', 'Regex pattern to match', '0', 1),
      { text: ';', line: 1, character: 0, file: 0 },
      ...defvarTokens('replacement', 'Replacement', 'TYPE_STRING', 'Replacement text', '0', 2),
      { text: ';', line: 2, character: 0, file: 0 },
      ...defvarTokens('case_sensitive', 'Case Sensitive', 'TYPE_FLAG', 'Match case', '0', 3),
      { text: ';', line: 3, character: 0, file: 0 },
    ];
    const result = parseRoxenConfig('', {
      inherits: [{ path: 'module' }],
      symbols: [moduleTypeSymbol('MODULE_FILTER')],
      tokens,
    });

    assert.strictEqual(result.moduleType, 'MODULE_FILTER');
    assert.strictEqual(result.defvars.length, 3);
  });
});

describe('Error Cases', () => {
  it('should handle empty code with no bridge data gracefully', () => {
    const result = parseRoxenConfig('');
    assert.strictEqual(result.isInheritModule, false);
    assert.strictEqual(result.moduleType, null);
    assert.strictEqual(result.defvars.length, 0);
    assert.strictEqual(result.errors.length, 0);
  });

  it('should handle code with only comments (no bridge data)', () => {
    const result = parseRoxenConfig('// comment\n/* block */');
    assert.strictEqual(result.defvars.length, 0);
  });

  it('should handle malformed defvar tokens gracefully', () => {
    const tokens: PikeToken[] = [
      { text: 'defvar', line: 1, character: 0, file: 0 },
      { text: '(', line: 1, character: 6, file: 0 },
    ];
    const result = parseRoxenConfig('', { tokens });
    assert.strictEqual(result.defvars.length, 0, 'Should not crash on malformed tokens');
  });

  it('should handle defvar with missing components via tokens', () => {
    // Only name token, not enough arg groups
    const tokens: PikeToken[] = [
      { text: 'defvar', line: 1, character: 0, file: 0 },
      { text: '(', line: 1, character: 6, file: 0 },
      { text: 'name', line: 1, character: 7, file: 0 },
      { text: ')', line: 1, character: 11, file: 0 },
    ];
    const result = parseRoxenConfig('', { tokens });
    assert.strictEqual(result.defvars.length, 0);
  });
});

describe('Inherit detection: no false positives', () => {
  it('should return false when no bridge data is provided', () => {
    const result = parseRoxenConfig('// inherit "module";\nint x = 1;');
    assert.strictEqual(result.isInheritModule, false, 'No bridge data → false');
  });

  it('should not detect inherit from unrelated inherits in cache', () => {
    const result = parseRoxenConfig('anything', { inherits: [{ path: 'filesystem' }] });
    assert.strictEqual(result.isInheritModule, false, 'Unrelated inherit should be ignored');
  });

  it('should not detect inherit "roxen" from unrelated inherits', () => {
    const result = parseRoxenConfig('anything', { inherits: [{ path: 'some_lib' }] });
    assert.strictEqual(result.isInheritModule, false, 'Unrelated inherit should be ignored');
  });

  it('should detect real inherit from bridge cache alongside comment code', () => {
    const result = parseRoxenConfig('', {
      inherits: [{ path: 'module' }],
      symbols: [moduleTypeSymbol('MODULE_TAG')],
    });
    assert.strictEqual(result.isInheritModule, true, 'Real inherit should be detected');
    assert.strictEqual(result.moduleType, 'MODULE_TAG');
  });
});

describe('Validation Error Reporting', () => {
  it('should provide correct line for errors from token-based parsing', () => {
    const tokens = defvarTokens('x', 'X', 'TYPE_BAD', 'Doc', '0');
    const result = validateRoxenConfig('', { tokens });
    assert.ok(result.length > 0, 'Should have errors');
    assert.strictEqual(result[0]!.range.start.line, 0, 'Error should be on line 0');
  });

  it('should have correct source in diagnostics', () => {
    const tokens = defvarTokens('x', 'X', 'TYPE_BAD', 'Doc', '0');
    const result = validateRoxenConfig('', { inherits: [{ path: 'module' }], tokens });
    const configDiags = result.filter(d => d.source === 'roxen-config');
    assert.ok(configDiags.length > 0, 'Should have roxen-config source diagnostics');
  });

  it('should distinguish between error and warning severity', () => {
    const tokens = defvarTokens('x', 'X', 'TYPE_BAD', 'Doc', '0');
    const result = validateRoxenConfig('', { tokens });
    const errorDiag = result.find(d => d.message.includes('TYPE_BAD'));
    assert.ok(errorDiag, 'Should have TYPE_BAD error');
    assert.strictEqual(errorDiag!.severity, 1, 'Should be error severity (1)');
  });
});

describe('BridgeParseInput: Symbol-based Parsing', () => {
  it('should detect inherit module from bridge symbols', () => {
    const symbols: PikeSymbol[] = [
      { kind: 'inherit', name: 'module', modifiers: [], classname: 'module' },
    ];
    const result = parseRoxenConfig('anything', { symbols });
    assert.strictEqual(result.isInheritModule, true, 'Should detect inherit from symbols');
  });

  it('should detect inherit roxen from bridge symbols', () => {
    const symbols: PikeSymbol[] = [
      { kind: 'inherit', name: 'roxen', modifiers: [], classname: 'roxen' },
    ];
    const result = parseRoxenConfig('anything', { symbols });
    assert.strictEqual(result.isInheritModule, true);
  });

  it('should not detect inherit from unrelated symbols', () => {
    const symbols: PikeSymbol[] = [
      { kind: 'inherit', name: 'BaseClass', modifiers: [], classname: 'BaseClass' },
    ];
    const result = parseRoxenConfig('anything', { symbols });
    assert.strictEqual(result.isInheritModule, false);
  });

  it('should extract module_type from constant symbol', () => {
    const result = parseRoxenConfig('anything', { symbols: [moduleTypeSymbol('MODULE_TAG')] });
    assert.strictEqual(result.moduleType, 'MODULE_TAG');
  });

  it('should extract module_type from nested child symbol', () => {
    const symbols: PikeSymbol[] = [
      {
        kind: 'class',
        name: 'MyModule',
        modifiers: [],
        children: [
          {
            kind: 'constant',
            name: 'module_type',
            modifiers: [],
            type: {
              kind: 'name' as const,
              name: 'MODULE_LOCATION',
            } as unknown as import('@pike-lsp/pike-bridge').PikeType,
          },
        ],
      },
    ];
    const result = parseRoxenConfig('anything', { symbols });
    assert.strictEqual(result.moduleType, 'MODULE_LOCATION');
  });

  it('should return null module_type when symbol has no matching type', () => {
    const symbols: PikeSymbol[] = [{ kind: 'constant', name: 'module_type', modifiers: [] }];
    const result = parseRoxenConfig('anything', { symbols });
    assert.strictEqual(result.moduleType, null);
  });

  it('should validate with bridge symbols', () => {
    const symbols: PikeSymbol[] = [
      { kind: 'inherit', name: 'module', modifiers: [], classname: 'module' },
      moduleTypeSymbol('MODULE_TAG'),
    ];
    const result = validateRoxenConfig('anything', { symbols });
    assert.ok(
      !result.some(d => d.message.includes('module_type')),
      'Should not warn when module_type present in symbols'
    );
  });
});

describe('BridgeParseInput: Inherits-based Parsing', () => {
  it('should detect inherit module from inherits cache', () => {
    const result = parseRoxenConfig('anything', { inherits: [{ path: 'module' }] });
    assert.strictEqual(result.isInheritModule, true);
  });

  it('should detect inherit roxen from inherits cache', () => {
    const result = parseRoxenConfig('anything', { inherits: [{ path: 'roxen' }] });
    assert.strictEqual(result.isInheritModule, true);
  });

  it('should prefer inherits over symbols when both provided', () => {
    const symbols: PikeSymbol[] = [
      { kind: 'inherit', name: 'BaseClass', modifiers: [], classname: 'BaseClass' },
    ];
    const result = parseRoxenConfig('anything', { inherits: [{ path: 'module' }], symbols });
    assert.strictEqual(result.isInheritModule, true, 'inherits should take priority');
  });

  it('should fall back to symbols when inherits is empty', () => {
    const symbols: PikeSymbol[] = [
      { kind: 'inherit', name: 'module', modifiers: [], classname: 'module' },
    ];
    const result = parseRoxenConfig('anything', { inherits: [], symbols });
    assert.strictEqual(result.isInheritModule, true, 'Should fall back to symbols');
  });

  it('should return false when neither inherits nor symbols match', () => {
    const result = parseRoxenConfig('anything', { inherits: [{ path: 'filesystem' }] });
    assert.strictEqual(result.isInheritModule, false);
  });
});

describe('BridgeParseInput: roxenInfo-based Defvar Extraction', () => {
  it('should extract defvars from roxenInfo.variables', () => {
    const roxenInfo = {
      is_roxen_module: 1 as const,
      module_type: ['MODULE_TAG'] as string[],
      module_name: 'test_module',
      inherits: ['module'],
      variables: [
        {
          name: 'myvar',
          type: 'TYPE_STRING',
          name_string: 'My Variable',
          doc_str: 'Documentation for myvar',
          position: { file: 'test.pike', line: 5, column: 4 },
        },
      ],
      tags: [],
      lifecycle: { callbacks: [], has_create: 0, has_start: 0, has_stop: 0, has_status: 0 },
    };
    const result = parseRoxenConfig('', { roxenInfo });

    assert.strictEqual(result.isInheritModule, true);
    assert.strictEqual(result.moduleType, 'MODULE_TAG');
    assert.strictEqual(result.defvars.length, 1);
    assert.strictEqual(result.defvars[0]!.name, 'myvar');
    assert.strictEqual(result.defvars[0]!.displayName, 'My Variable');
    assert.strictEqual(result.defvars[0]!.type, 'TYPE_STRING');
    assert.strictEqual(result.defvars[0]!.documentation, 'Documentation for myvar');
    assert.strictEqual(result.defvars[0]!.flags, 0);
    assert.strictEqual(result.defvars[0]!.line, 4, 'Line should be 0-indexed (5 - 1)');
    assert.strictEqual(result.defvars[0]!.column, 4);
  });

  it('should extract multiple defvars from roxenInfo', () => {
    const roxenInfo = {
      is_roxen_module: 1 as const,
      module_type: ['MODULE_LOCATION'] as string[],
      module_name: 'fs_module',
      inherits: ['module'],
      variables: [
        {
          name: 'mount',
          type: 'TYPE_STRING',
          name_string: 'Mount',
          doc_str: 'Doc1',
          position: { file: '', line: 1, column: 0 },
        },
        {
          name: 'root',
          type: 'TYPE_DIR',
          name_string: 'Root',
          doc_str: 'Doc2',
          position: { file: '', line: 2, column: 0 },
        },
      ],
      tags: [],
      lifecycle: { callbacks: [], has_create: 0, has_start: 0, has_stop: 0, has_status: 0 },
    };
    const result = parseRoxenConfig('', { roxenInfo });
    assert.strictEqual(result.defvars.length, 2);
    assert.strictEqual(result.defvars[0]!.name, 'mount');
    assert.strictEqual(result.defvars[1]!.name, 'root');
  });

  it('should report error for unknown TYPE in roxenInfo variables', () => {
    const roxenInfo = {
      is_roxen_module: 1 as const,
      module_type: [] as string[],
      module_name: 'bad_module',
      inherits: ['module'],
      variables: [
        {
          name: 'x',
          type: 'TYPE_INVALID',
          name_string: 'X',
          doc_str: '',
          position: { file: '', line: 3, column: 2 },
        },
      ],
      tags: [],
      lifecycle: { callbacks: [], has_create: 0, has_start: 0, has_stop: 0, has_status: 0 },
    };
    const result = parseRoxenConfig('', { roxenInfo });
    assert.strictEqual(result.defvars.length, 1);
    assert.strictEqual(result.errors.length, 1);
    assert.ok(result.errors[0]!.message.includes('TYPE_INVALID'));
    assert.strictEqual(result.errors[0]!.line, 2, 'Error line should be 0-indexed');
  });

  it('should fall back to tokens when roxenInfo has no variables', () => {
    const roxenInfo = {
      is_roxen_module: 1 as const,
      module_type: ['MODULE_TAG'] as string[],
      module_name: 'empty_module',
      inherits: ['module'],
      variables: [],
      tags: [],
      lifecycle: { callbacks: [], has_create: 0, has_start: 0, has_stop: 0, has_status: 0 },
    };
    const tokens = defvarTokens('from_tokens', 'From Tokens', 'TYPE_INT', 'Doc', '0');
    const result = parseRoxenConfig('', { roxenInfo, tokens });
    assert.strictEqual(result.defvars.length, 1, 'Should fall back to token-based extraction');
    assert.strictEqual(result.defvars[0]!.name, 'from_tokens');
  });

  it('should use name as displayName when name_string is empty', () => {
    const roxenInfo = {
      is_roxen_module: 1 as const,
      module_type: [] as string[],
      module_name: 'm',
      inherits: [],
      variables: [
        {
          name: 'bare_var',
          type: 'TYPE_FLAG',
          name_string: '',
          doc_str: '',
          position: { file: '', line: 1, column: 0 },
        },
      ],
      tags: [],
      lifecycle: { callbacks: [], has_create: 0, has_start: 0, has_stop: 0, has_status: 0 },
    };
    const result = parseRoxenConfig('', { roxenInfo });
    assert.strictEqual(result.defvars[0]!.displayName, 'bare_var');
  });

  it('should handle missing column in roxenInfo position', () => {
    const roxenInfo = {
      is_roxen_module: 1 as const,
      module_type: [] as string[],
      module_name: 'm',
      inherits: [],
      variables: [
        {
          name: 'v',
          type: 'TYPE_STRING',
          name_string: 'V',
          doc_str: 'D',
          position: { file: '', line: 10 },
        },
      ],
      tags: [],
      lifecycle: { callbacks: [], has_create: 0, has_start: 0, has_stop: 0, has_status: 0 },
    };
    const result = parseRoxenConfig('', { roxenInfo });
    assert.strictEqual(result.defvars[0]!.line, 9);
    assert.strictEqual(result.defvars[0]!.column, 0, 'Missing column should default to 0');
  });
});

describe('BridgeParseInput: Token-based Defvar Parsing', () => {
  it('should extract defvar from tokens', () => {
    const tokens: PikeToken[] = [
      { text: 'defvar', line: 1, character: 4, file: 0 },
      { text: '(', line: 1, character: 10, file: 0 },
      { text: '"', line: 1, character: 11, file: 0 },
      { text: 'myvar', line: 1, character: 12, file: 0 },
      { text: '"', line: 1, character: 17, file: 0 },
      { text: ',', line: 1, character: 18, file: 0 },
      { text: '"', line: 1, character: 20, file: 0 },
      { text: 'My Var', line: 1, character: 21, file: 0 },
      { text: '"', line: 1, character: 27, file: 0 },
      { text: ',', line: 1, character: 28, file: 0 },
      { text: 'TYPE_STRING', line: 1, character: 30, file: 0 },
      { text: ',', line: 1, character: 41, file: 0 },
      { text: '"', line: 1, character: 43, file: 0 },
      { text: 'Doc text', line: 1, character: 44, file: 0 },
      { text: '"', line: 1, character: 52, file: 0 },
      { text: ',', line: 1, character: 53, file: 0 },
      { text: '0', line: 1, character: 55, file: 0 },
      { text: ')', line: 1, character: 56, file: 0 },
    ];

    const result = parseRoxenConfig('', { tokens });
    assert.strictEqual(result.defvars.length, 1);
    assert.strictEqual(result.defvars[0]!.name, 'myvar');
    assert.strictEqual(result.defvars[0]!.displayName, 'My Var');
    assert.strictEqual(result.defvars[0]!.type, 'TYPE_STRING');
    assert.strictEqual(result.defvars[0]!.documentation, 'Doc text');
  });

  it('should extract multiple defvars from tokens', () => {
    const tokens: PikeToken[] = [
      { text: 'defvar', line: 1, character: 0, file: 0 },
      { text: '(', line: 1, character: 6, file: 0 },
      { text: 'var1', line: 1, character: 7, file: 0 },
      { text: ',', line: 1, character: 13, file: 0 },
      { text: 'Name1', line: 1, character: 15, file: 0 },
      { text: ',', line: 1, character: 22, file: 0 },
      { text: 'TYPE_INT', line: 1, character: 24, file: 0 },
      { text: ',', line: 1, character: 32, file: 0 },
      { text: 'Doc1', line: 1, character: 34, file: 0 },
      { text: ',', line: 1, character: 40, file: 0 },
      { text: '0', line: 1, character: 42, file: 0 },
      { text: ')', line: 1, character: 43, file: 0 },
      { text: ';', line: 1, character: 44, file: 0 },
      { text: 'defvar', line: 2, character: 0, file: 0 },
      { text: '(', line: 2, character: 6, file: 0 },
      { text: 'var2', line: 2, character: 7, file: 0 },
      { text: ',', line: 2, character: 13, file: 0 },
      { text: 'Name2', line: 2, character: 15, file: 0 },
      { text: ',', line: 2, character: 22, file: 0 },
      { text: 'TYPE_FLAG', line: 2, character: 24, file: 0 },
      { text: ',', line: 2, character: 32, file: 0 },
      { text: 'Doc2', line: 2, character: 34, file: 0 },
      { text: ',', line: 2, character: 40, file: 0 },
      { text: 'VAR_EXPERT', line: 2, character: 42, file: 0 },
      { text: ')', line: 2, character: 52, file: 0 },
    ];

    const result = parseRoxenConfig('', { tokens });
    assert.strictEqual(result.defvars.length, 2);
    assert.strictEqual(result.defvars[0]!.name, 'var1');
    assert.strictEqual(result.defvars[0]!.type, 'TYPE_INT');
    assert.strictEqual(result.defvars[1]!.name, 'var2');
    assert.strictEqual(result.defvars[1]!.type, 'TYPE_FLAG');
  });

  it('should report error for unknown TYPE in token-based parsing', () => {
    const tokens: PikeToken[] = [
      { text: 'defvar', line: 1, character: 0, file: 0 },
      { text: '(', line: 1, character: 6, file: 0 },
      { text: 'x', line: 1, character: 7, file: 0 },
      { text: ',', line: 1, character: 10, file: 0 },
      { text: 'X', line: 1, character: 12, file: 0 },
      { text: ',', line: 1, character: 15, file: 0 },
      { text: 'TYPE_BAD', line: 1, character: 17, file: 0 },
      { text: ',', line: 1, character: 25, file: 0 },
      { text: 'D', line: 1, character: 27, file: 0 },
      { text: ',', line: 1, character: 30, file: 0 },
      { text: '0', line: 1, character: 32, file: 0 },
      { text: ')', line: 1, character: 33, file: 0 },
    ];

    const result = parseRoxenConfig('', { tokens });
    assert.strictEqual(result.defvars.length, 1);
    assert.strictEqual(result.errors.length, 1);
    assert.ok(result.errors[0]!.message.includes('TYPE_BAD'));
  });

  it('should handle empty tokens gracefully', () => {
    const tokens: PikeToken[] = [];
    const result = parseRoxenConfig('', { tokens });
    assert.strictEqual(result.defvars.length, 0);
  });
});
