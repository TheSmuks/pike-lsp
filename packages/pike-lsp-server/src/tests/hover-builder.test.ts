import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { buildHoverContent, convertPikeDocToMarkdown } from '../features/utils/hover-builder.js';

describe('convertPikeDocToMarkdown', () => {
  describe('inline formatting tags', () => {
    it('converts @b{} to bold markdown', () => {
      const result = convertPikeDocToMarkdown('This is @b{bold@} text');
      assert.strictEqual(result, 'This is **bold** text');
    });

    it('converts @i{} to italic markdown', () => {
      const result = convertPikeDocToMarkdown('This is @i{italic@} text');
      assert.strictEqual(result, 'This is *italic* text');
    });

    it('converts @tt{} to inline code markdown', () => {
      const result = convertPikeDocToMarkdown('Use @tt{variable@} here');
      assert.strictEqual(result, 'Use `variable` here');
    });

    it('converts @code{} to inline code markdown', () => {
      const result = convertPikeDocToMarkdown('See @code{example@} code');
      assert.strictEqual(result, 'See `example` code');
    });

    it('converts @expr{} to inline code markdown', () => {
      const result = convertPikeDocToMarkdown('Expression @expr{1 + 2@}');
      assert.strictEqual(result, 'Expression `1 + 2`');
    });

    it('converts @ref{} to inline code markdown', () => {
      const result = convertPikeDocToMarkdown('See @ref{some_function@}');
      assert.strictEqual(result, 'See `some_function`');
    });

    it('converts @[...] to inline code markdown', () => {
      const result = convertPikeDocToMarkdown('See @[some_function]');
      assert.strictEqual(result, 'See `some_function`');
    });

    it('converts @url{} to markdown link', () => {
      const result = convertPikeDocToMarkdown('Visit @url{https://example.com@}');
      assert.strictEqual(result, 'Visit <https://example.com>');
    });

    it('converts @rfc{} to markdown link with RFC URL', () => {
      const result = convertPikeDocToMarkdown('See @rfc{2616@}');
      assert.strictEqual(result, 'See [RFC 2616](https://tools.ietf.org/html/rfc2616)');
    });

    it('converts @fixme{} to FIXME markdown', () => {
      const result = convertPikeDocToMarkdown('This is @fixme{broken@}');
      assert.strictEqual(result, 'This is **FIXME** broken');
    });

    it('converts @u{} to underline HTML', () => {
      const result = convertPikeDocToMarkdown('This is @u{underlined@}');
      assert.strictEqual(result, 'This is <u>underlined</u>');
    });

    it('converts @sub{} to subscript HTML', () => {
      const result = convertPikeDocToMarkdown('H@sub{2@}O');
      assert.strictEqual(result, 'H<sub>2</sub>O');
    });

    it('converts @sup{} to superscript HTML', () => {
      const result = convertPikeDocToMarkdown('E = mc@sup{2@}');
      assert.strictEqual(result, 'E = mc<sup>2</sup>');
    });

    it('converts @xml{} preserving content', () => {
      const result = convertPikeDocToMarkdown('Tag: @xml{<element/>@}');
      assert.strictEqual(result, 'Tag: <element/>');
    });

    it('converts @image{} to image placeholder', () => {
      const result = convertPikeDocToMarkdown('See @image{diagram.png@}');
      assert.strictEqual(result, 'See [Image: diagram.png]');
    });

    it('handles @@ to produce literal @', () => {
      const result = convertPikeDocToMarkdown('Email@@example.com');
      assert.strictEqual(result, 'Email@example.com');
    });

    it('handles nested tags', () => {
      const result = convertPikeDocToMarkdown('@b{bold @i{italic@} text@}');
      assert.strictEqual(result, '**bold *italic* text**');
    });

    it('handles unclosed tags gracefully', () => {
      const result = convertPikeDocToMarkdown('Text @b{unclosed');
      assert.strictEqual(result, 'Text @b{unclosed');
    });
  });

  describe('block-level tags', () => {
    it('converts @decl to code block', () => {
      const result = convertPikeDocToMarkdown('@decl int variable');
      assert.strictEqual(result, '```pike\nint variable\n```');
    });

    it('converts @mapping header', () => {
      const result = convertPikeDocToMarkdown('@mapping\nvalue');
      assert.strictEqual(result, '**Mapping:**\nvalue');
    });

    it('handles @ul and @item for unordered lists', () => {
      const result = convertPikeDocToMarkdown('@ul\n@item First\n@item Second\n@endul');
      assert.strictEqual(result, '- First\n- Second');
    });

    it('handles @ol and @item for ordered lists', () => {
      const result = convertPikeDocToMarkdown('@ol\n@item First\n@item Second\n@endol');
      assert.strictEqual(result, '1. First\n2. Second');
    });

    it('handles @member with quoted name', () => {
      const result = convertPikeDocToMarkdown('@member int "count"');
      assert.strictEqual(result, '- `"count"` (`int`)');
    });

    it('handles @member with description on same line', () => {
      const result = convertPikeDocToMarkdown('@member int "count" The count value');
      assert.strictEqual(result, '- `"count"` (`int`): The count value');
    });

    it('handles @member with description on next line', () => {
      const result = convertPikeDocToMarkdown('@member int "count"\n  The count value');
      assert.strictEqual(result, '- `"count"` (`int`): The count value');
    });

    it('handles @member without quotes', () => {
      const result = convertPikeDocToMarkdown('@member int count');
      assert.strictEqual(result, '- `count` (`int`)');
    });

    it('handles @value with description on next line', () => {
      const result = convertPikeDocToMarkdown('@value SUCCESS\nSuccess value\n@endint');
      assert.strictEqual(result, '- `SUCCESS`: Success value');
    });

    it('handles @value without description', () => {
      const result = convertPikeDocToMarkdown('@value SUCCESS\n@endint');
      assert.strictEqual(result, '- `SUCCESS`');
    });

    it('handles @index for multiset', () => {
      const result = convertPikeDocToMarkdown('@index key\n  Description\n@endmultiset');
      assert.strictEqual(result, '- `key`: Description');
    });

    it('handles @type for mixed containers', () => {
      const result = convertPikeDocToMarkdown('@type int\n  Integer type\n@endmixed');
      assert.strictEqual(result, '- **int**: Integer type');
    });

    it('handles @elem for array elements', () => {
      const result = convertPikeDocToMarkdown('@elem int 0\n  First element\n@endarray');
      assert.strictEqual(result, '- `0 (int)`: First element');
    });

    it('handles @dt and @dd for definition lists', () => {
      const result = convertPikeDocToMarkdown('@dt Term\n@dd Definition\n@enddl');
      assert.strictEqual(result, '- **Term**\n  Definition');
    });
  });

  describe('empty and edge cases', () => {
    it('returns empty string for empty input', () => {
      const result = convertPikeDocToMarkdown('');
      assert.strictEqual(result, '');
    });

    it('returns empty string for null input', () => {
      const result = convertPikeDocToMarkdown(null as any);
      assert.strictEqual(result, '');
    });

    it('returns empty string for undefined input', () => {
      const result = convertPikeDocToMarkdown(undefined as any);
      assert.strictEqual(result, '');
    });

    it('preserves plain text without tags', () => {
      const result = convertPikeDocToMarkdown('Just plain text');
      assert.strictEqual(result, 'Just plain text');
    });

    it('handles unknown tags by stripping wrapper', () => {
      const result = convertPikeDocToMarkdown('Text @unknown{content@}');
      assert.strictEqual(result, 'Text content');
    });
  });

  describe('complex scenarios', () => {
    it('handles multiple inline tags in same text', () => {
      const result = convertPikeDocToMarkdown('Use @b{bold@} and @i{italic@} with @tt{code@}');
      assert.strictEqual(result, 'Use **bold** and *italic* with `code`');
    });

    it('handles @pre{} as code block', () => {
      const result = convertPikeDocToMarkdown('@pre{int x = 1;@}');
      assert.strictEqual(result, '```pike\nint x = 1;\n```');
    });
  });
});

describe('buildHoverContent', () => {
  describe('basic functionality', () => {
    it('generates basic documentation', () => {
      const symbol: any = {
        name: 'my_func',
        kind: 'function',
        returnType: { name: 'void' },
        documentation: {
          text: 'Does something.',
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('Does something.'));
    });

    it('returns null for null symbol', () => {
      const content = buildHoverContent(null as any);
      assert.strictEqual(content, null);
    });

    it('returns null for undefined symbol', () => {
      const content = buildHoverContent(undefined as any);
      assert.strictEqual(content, null);
    });
  });

  describe('stdlib documentation links', () => {
    it('adds documentation link for stdlib symbols', () => {
      const symbol: any = {
        name: 'write_file',
        kind: 'function',
        returnType: { name: 'int' },
        documentation: {
          text: 'Writes a file.',
        },
      };

      const content = buildHoverContent(symbol, 'Stdio');
      assert.ok(content);
      assert.ok(content.includes('[Online Documentation]'));
      assert.ok(
        content.includes(
          'https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/Stdio/write_file.html'
        )
      );
    });

    it('adds documentation link for stdlib classes', () => {
      const symbol: any = {
        name: 'File',
        kind: 'class',
        documentation: {
          text: 'File object.',
        },
      };

      const content = buildHoverContent(symbol, 'Stdio');
      assert.ok(content);
      assert.ok(
        content.includes(
          'https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/Stdio/File.html'
        )
      );
    });

    it('adds documentation link for top-level modules', () => {
      const symbol: any = {
        name: 'Stdio',
        kind: 'module',
        documentation: {
          text: 'Standard IO module.',
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('predef_3A_3A/Stdio'));
    });
  });

  describe('symbol types', () => {
    it('handles method with function type', () => {
      const symbol: any = {
        name: 'my_method',
        kind: 'method',
        type: {
          kind: 'function',
          returnType: { name: 'string' },
          argTypes: [{ name: 'int' }, { name: 'string' }],
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('```pike'));
      assert.ok(content.includes('my_method'));
    });

    it('handles method without type property using PikeMethod fallback', () => {
      const symbol: any = {
        name: 'do_something',
        kind: 'method',
        argNames: ['count', 'label'],
        argTypes: [{ name: 'int' }, { name: 'string' }],
        returnType: { name: 'void' },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('```pike'));
      assert.ok(content.includes('void do_something(int count, string label)'));
    });

    it('handles method with variants', () => {
      const symbol: any = {
        name: 'process',
        kind: 'method',
        type: {
          kind: 'method',
          returnType: 'void',
        },
        variants: [
          {
            name: 'process',
            kind: 'method',
            type: { kind: 'method', returnType: 'void' },
          },
        ],
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('### Variants'));
    });

    it('handles variable', () => {
      const symbol: any = {
        name: 'counter',
        kind: 'variable',
        type: { name: 'int' },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('```pike'));
      assert.ok(content.includes('int counter'));
    });

    it('handles constant', () => {
      const symbol: any = {
        name: 'MAX_SIZE',
        kind: 'constant',
        type: { name: 'int' },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('constant int MAX_SIZE'));
    });

    it('handles typedef with resolved type', () => {
      const symbol: any = {
        name: 'StringArray',
        kind: 'typedef',
        type: { name: 'array' },
        resolvedType: 'array(string)',
        nameAlias: 'StringArray',
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('typedef array(string) StringArray'));
    });

    it('handles typedef without resolved type', () => {
      const symbol: any = {
        name: 'MyType',
        kind: 'typedef',
        type: { name: 'mixed' },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('typedef mixed MyType'));
    });

    it('handles class', () => {
      const symbol: any = {
        name: 'MyClass',
        kind: 'class',
        documentation: {
          text: 'A sample class.',
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('```pike'));
      assert.ok(content.includes('class MyClass'));
    });
  });

  describe('inheritance', () => {
    it('displays inheritance information', () => {
      const symbol: any = {
        name: 'inherited_func',
        kind: 'function',
        returnType: { name: 'void' },
        inherited: true,
        inheritedFrom: 'ParentClass',
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('*Inherited from*: `ParentClass`'));
    });

    it('displays inherited flag without source', () => {
      const symbol: any = {
        name: 'inherited_func',
        kind: 'function',
        returnType: { name: 'void' },
        inherited: true,
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('*Inherited*'));
    });
  });

  describe('conditional compilation', () => {
    it('displays #if condition', () => {
      const symbol: any = {
        name: 'conditional_func',
        kind: 'function',
        returnType: { name: 'void' },
        conditional: true,
        condition: 'DEBUG',
        branch: 0,
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('*Condition*: #if DEBUG'));
    });

    it('displays #elif condition', () => {
      const symbol: any = {
        name: 'conditional_func',
        kind: 'function',
        returnType: { name: 'void' },
        conditional: true,
        condition: 'RELEASE',
        branch: 1,
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('*Condition*: #elif RELEASE'));
    });
  });

  describe('modifiers', () => {
    it('displays modifiers', () => {
      const symbol: any = {
        name: 'protected_func',
        kind: 'function',
        returnType: { name: 'void' },
        modifiers: ['protected', 'final'],
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('*Modifiers*: protected, final'));
    });
  });

  describe('documentation structure', () => {
    it('handles string documentation', () => {
      const symbol: any = {
        name: 'simple_func',
        kind: 'function',
        returnType: { name: 'void' },
        documentation: 'Simple description.',
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('Simple description.'));
    });

    it('handles documentation with //! prefix', () => {
      const symbol: any = {
        name: 'commented_func',
        kind: 'function',
        returnType: { name: 'void' },
        documentation: '//! Comment line\n//! Second line',
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('Comment line'));
      assert.ok(content.includes('Second line'));
      assert.ok(!content.includes('//!'));
    });

    it('handles deprecated documentation', () => {
      const symbol: any = {
        name: 'old_func',
        kind: 'function',
        returnType: { name: 'void' },
        documentation: {
          deprecated: 'Use new_func instead.',
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('**DEPRECATED**'));
      assert.ok(content.includes('Use new_func instead.'));
    });

    it('handles parameters documentation', () => {
      const symbol: any = {
        name: 'func',
        kind: 'function',
        returnType: { name: 'void' },
        documentation: {
          params: {
            input: 'The input value',
            output: 'The output value',
          },
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('**Parameters:**'));
      assert.ok(content.includes('`input`: The input value'));
      assert.ok(content.includes('`output`: The output value'));
    });

    it('handles parameters with paramOrder', () => {
      const symbol: any = {
        name: 'func',
        kind: 'function',
        returnType: { name: 'void' },
        documentation: {
          params: {
            first: 'First param',
            second: 'Second param',
          },
          paramOrder: ['second', 'first'],
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      const paramsIdx = content!.indexOf('**Parameters:**');
      const secondIdx = content!.indexOf('`second`');
      const firstIdx = content!.indexOf('`first`');
      assert.ok(paramsIdx < secondIdx, 'params should come before second');
      assert.ok(secondIdx < firstIdx, 'second should come before first');
    });

    it('handles returns documentation', () => {
      const symbol: any = {
        name: 'func',
        kind: 'function',
        returnType: { name: 'int' },
        documentation: {
          returns: 'The result value.',
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('**Returns:** The result value.'));
    });

    it('handles throws documentation', () => {
      const symbol: any = {
        name: 'func',
        kind: 'function',
        returnType: { name: 'void' },
        documentation: {
          throws: 'Error on failure.',
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('**Throws:** Error on failure.'));
    });

    it('handles notes documentation', () => {
      const symbol: any = {
        name: 'func',
        kind: 'function',
        returnType: { name: 'void' },
        documentation: {
          notes: ['First note.', 'Second note.'],
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('**Note:** First note.'));
      assert.ok(content.includes('**Note:** Second note.'));
    });

    it('handles bugs documentation', () => {
      const symbol: any = {
        name: 'func',
        kind: 'function',
        returnType: { name: 'void' },
        documentation: {
          bugs: ['Known issue.'],
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('**Bug:** Known issue.'));
    });

    it('handles examples documentation', () => {
      const symbol: any = {
        name: 'func',
        kind: 'function',
        returnType: { name: 'void' },
        documentation: {
          examples: ['func();'],
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('**Example:**'));
      assert.ok(content.includes('```pike'));
      assert.ok(content.includes('func();'));
    });

    it('handles seealso documentation with links', () => {
      const symbol: any = {
        name: 'func',
        kind: 'function',
        returnType: { name: 'void' },
        documentation: {
          seealso: ['`Stdio.File`', 'write'],
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('**See also:**'));
      assert.ok(content.includes('[`Stdio.File`]'));
      assert.ok(content.includes('pike.lysator.liu.se'));
    });

    it('handles obsolete documentation', () => {
      const symbol: any = {
        name: 'old_func',
        kind: 'function',
        returnType: { name: 'void' },
        documentation: {
          obsolete: 'Use new_func instead.',
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('**⚠️ OBSOLETE**'));
      assert.ok(content.includes('Use new_func instead.'));
    });

    it('handles copyright documentation', () => {
      const symbol: any = {
        name: 'func',
        kind: 'function',
        returnType: { name: 'void' },
        documentation: {
          copyright: ['2024 Author'],
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('**© Copyright** 2024 Author'));
    });

    it('handles thanks documentation', () => {
      const symbol: any = {
        name: 'func',
        kind: 'function',
        returnType: { name: 'void' },
        documentation: {
          thanks: ['Contributor Name'],
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('**🙏 Thanks** Contributor Name'));
    });

    it('handles fixme documentation', () => {
      const symbol: any = {
        name: 'func',
        kind: 'function',
        returnType: { name: 'void' },
        documentation: {
          fixme: ['Needs refactoring.'],
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('**🔧 FIXME**'));
      assert.ok(content.includes('Needs refactoring.'));
    });

    it('handles constants documentation', () => {
      const symbol: any = {
        name: 'MyEnum',
        kind: 'class',
        documentation: {
          constants: {
            VALUE_A: 'int',
            VALUE_B: 'string',
          },
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('**Constants:**'));
      assert.ok(content.includes('`VALUE_A`: `int`'));
      assert.ok(content.includes('`VALUE_B`: `string`'));
    });

    it('handles indexes documentation', () => {
      const symbol: any = {
        name: 'my_multiset',
        kind: 'variable',
        type: { name: 'multiset' },
        documentation: {
          indexes: [
            { label: 'key1', text: 'First key' },
            { label: 'key2', text: '' },
          ],
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('**Indexes:**'));
      assert.ok(content.includes('`key1`: First key'));
      assert.ok(content.includes('`key2`'));
    });

    it('handles types documentation', () => {
      const symbol: any = {
        name: 'my_mixed',
        kind: 'variable',
        type: { name: 'mixed' },
        documentation: {
          types: ['int', 'string'],
        },
      };

      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('**Types:**'));
      assert.ok(content.includes('- int'));
      assert.ok(content.includes('- string'));
    });
  });

  describe('parameter type signatures', () => {
    it('handles function with parameters array', () => {
      const symbol: any = {
        name: 'my_func',
        kind: 'method',
        type: {
          kind: 'function',
          returnType: 'string',
          arguments: [
            { name: 'count', type: 'int' },
            { name: 'name', type: 'string' },
          ],
        },
      };
      const content = buildHoverContent(symbol);
      assert.ok(content);
      assert.ok(content.includes('my_func'));
      assert.ok(content.includes('int count'));
      assert.ok(content.includes('string name'));
    });
  });
});
