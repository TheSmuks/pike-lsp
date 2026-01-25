
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { convertPikeDocToMarkdown } from '../features/utils/hover-builder.js';

describe('Hover Block Tag Conversion', () => {
    it('should convert @mapping block to bullet list', () => {
        const input = `
The options:
@mapping
  @member int "id"
    The ID.
  @member string "name"
    The name.
@endmapping
`;
        // We accept some variation in whitespace, but structure should match
        const actual = convertPikeDocToMarkdown(input);
        assert.ok(actual.includes('**Mapping:**'));
        assert.ok(actual.includes('- `"id"` (`int`)'));
        assert.ok(actual.includes('- `"name"` (`string`)'));
    });

    it('should convert @ul/@item to bullet list', () => {
        const input = `
List:
@ul
  @item Item 1
  @item Item 2
@endul
`;
        const actual = convertPikeDocToMarkdown(input);
        assert.ok(actual.includes('- Item 1'));
        assert.ok(actual.includes('- Item 2'));
    });

    it('should convert @decl to code block', () => {
        const input = `
Description.
@decl void create(string name)
More text.
`;
        const actual = convertPikeDocToMarkdown(input);
        assert.ok(actual.includes('```pike\nvoid create(string name)\n```'));
    });

    it('should convert @int/@value to bullet list', () => {
        const input = `
Direction:
@int
  @value 1
    Forward
  @value -1
    Backward
@endint
`;
        const actual = convertPikeDocToMarkdown(input);
        assert.ok(actual.includes('- `1`: Forward'));
        assert.ok(actual.includes('- `-1`: Backward'));
    });

    it('should convert @array/@elem to bullet list', () => {
        const input = `
Data structure:
@array
  @elem float 0
    Amplitude
  @elem float 1
    Phase
@endarray
`;
        const actual = convertPikeDocToMarkdown(input);
        // Format: index (type): description
        assert.ok(actual.includes('- `0 (float)`: Amplitude'));
        assert.ok(actual.includes('- `1 (float)`: Phase'));
    });

    it('should convert @elem with inline description', () => {
        const input = `
@array
  @elem string 0 Name of the item
  @elem int 1 Quantity
@endarray
`;
        const actual = convertPikeDocToMarkdown(input);
        assert.ok(actual.includes('- `0 (string)`: Name of the item'));
        assert.ok(actual.includes('- `1 (int)`: Quantity'));
    });

    it('should convert @dl/@dt/@dd to definition list', () => {
        const input = `
@dl
  @dt Term 1
  @dd Description of term 1
  @dt Term 2
  @dd Description of term 2
@enddl
`;
        const actual = convertPikeDocToMarkdown(input);
        assert.ok(actual.includes('- **Term 1**'));
        assert.ok(actual.includes('  Description of term 1'));
        assert.ok(actual.includes('- **Term 2**'));
        assert.ok(actual.includes('  Description of term 2'));
    });

    it('should handle @multiset block', () => {
        const input = `
@multiset
  @value "apple"
  @value "banana"
@endmultiset
`;
        const actual = convertPikeDocToMarkdown(input);
        assert.ok(actual.includes('- `"apple"`'));
        assert.ok(actual.includes('- `"banana"`'));
    });

    it('should convert @ol/@item to numbered list', () => {
        const input = `
@ol
  @item First item
  @item Second item
  @item Third item
@endol
`;
        const actual = convertPikeDocToMarkdown(input);
        assert.ok(actual.includes('1. First item'));
        assert.ok(actual.includes('2. Second item'));
        assert.ok(actual.includes('3. Third item'));
    });

    it('should convert @mixed/@type to type list', () => {
        const input = `
@mixed
  @type string
    String value
  @type int
    Integer value
@endmixed
`;
        const actual = convertPikeDocToMarkdown(input);
        assert.ok(actual.includes('- **string**: String value'));
        assert.ok(actual.includes('- **int**: Integer value'));
    });

    it('should convert @multiset with @index', () => {
        const input = `
@multiset
  @index "key1"
    Value for key1
  @index "key2"
    Value for key2
@endmultiset
`;
        const actual = convertPikeDocToMarkdown(input);
        assert.ok(actual.includes('- `"key1"`: Value for key1'));
        assert.ok(actual.includes('- `"key2"`: Value for key2'));
    });
});
