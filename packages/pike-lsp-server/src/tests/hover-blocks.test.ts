
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
        // Checking for typical formatting, adjust based on implementation decision
        assert.ok(actual.includes('- `float 0`: Amplitude'));
        assert.ok(actual.includes('- `float 1`: Phase'));
    });
});
